// Backend do sistema Despesas (reembolso com foto da nota).
//
// Banco: Postgres (assíncrono). Dentro de uma transação (rotas com "h") use sempre o "t".
// A leitura por IA acontece sempre FORA de transação (pode demorar alguns segundos).
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import migrations from './migrations.js';
import relatorio from './relatorio.js';
import { lerNota } from './ia.js';
import {
  RuleError, isDate, hoje, brDate, brMoney, soDigitos, fmtCnpj, parseValor, codigoPedido, codigoNota, ids,
  config, log, duplicadosDe, alertas, recalcPedido, STATUS_LABEL, NOTA_LABEL,
} from './regras.js';

const MIMES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const MAX_UPLOAD = 15 * 1024 * 1024;
const PIX_TIPOS = ['CPF', 'CNPJ', 'E-mail', 'Telefone', 'Chave aleatória'];
const A_PAGAR = "status IN ('aprovado','parcial') AND pago_em IS NULL";
const HTML = (corpo) => `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6">${corpo}</div>`;
const esc = (s) => String(s ?? '').replace(/</g, '&lt;');

export default {
  banco: 'postgres',
  migrations,
  relatorio,

  async summary({ db, user, isCentral }) {
    if (isCentral) {
      const r = await db.get(`SELECT COUNT(*) FILTER (WHERE status = 'aguardando') AS n, COALESCE(SUM(total_declarado) FILTER (WHERE status = 'aguardando'), 0) AS v,
        COUNT(*) FILTER (WHERE ${A_PAGAR}) AS pagar FROM despesas_pedidos WHERE status IN ('aguardando','aprovado','parcial')`);
      return `${r.n} pedido(s) aguardando · ${brMoney(r.v)}${r.pagar ? ` · ${r.pagar} a pagar` : ''}`;
    }
    const r = await db.get(`SELECT COUNT(*) FILTER (WHERE status = 'aguardando') AS a, COUNT(*) FILTER (WHERE ${A_PAGAR}) AS p
      FROM despesas_pedidos WHERE solicitante_id = ?`, user.id);
    return `${r.a} em análise · ${r.p} aprovado(s) aguardando pagamento`;
  },

  async notificacoes({ db, user, isCentral, isSolicitante }) {
    const out = [];
    if (isCentral) {
      const r = await db.get(`SELECT COUNT(*) FILTER (WHERE status = 'aguardando') AS analisar, COUNT(*) FILTER (WHERE ${A_PAGAR}) AS pagar
        FROM despesas_pedidos WHERE status IN ('aguardando','aprovado','parcial')`);
      out.push({ central: true, qtd: r.analisar, texto: 'pedido(s) de reembolso para analisar' });
      out.push({ link: 'central/financeiro', qtd: r.pagar, texto: 'reembolso(s) aprovado(s) a pagar' });
    }
    if (isSolicitante) {
      const r = await db.get(`SELECT
        (SELECT COUNT(*) FROM despesas_notas n JOIN despesas_pedidos p ON p.id = n.pedido_id
          WHERE n.dono_id = ? AND n.status = 'recusada' AND p.status <> 'cancelado'
          AND NOT EXISTS (SELECT 1 FROM despesas_notas s WHERE s.substitui_id = n.id AND s.status <> 'rascunho')) AS recusadas,
        (SELECT COUNT(*) FROM despesas_notas WHERE dono_id = ? AND status = 'rascunho' AND pedido_id IS NULL) AS rascunhos`, user.id, user.id);
      out.push({ link: 'solicitante/pedidos', qtd: r.recusadas, texto: 'nota(s) recusada(s) — envie outra foto' });
      out.push({ link: 'solicitante', qtd: r.rascunhos, texto: 'nota(s) ainda não enviada(s)' });
    }
    return out;
  },

  router(r, ctx) {
    const { db, requireRole, notify, filesDir, ai, files } = ctx;
    const sol = requireRole('solicitante');
    const cen = requireRole('central');
    const isCentral = (req) => ['central', 'ambos'].includes(req.moduleRole);

    function erro(res, err) {
      if (err instanceof RuleError) return res.status(err.status).json({ error: err.message });
      console.error('[despesas]', err);
      if (!res.headersSent) res.status(500).json({ error: 'Erro interno' });
    }
    /** Rota de leitura: fn(req, res) devolve o JSON. */
    const ler = (fn) => async (req, res) => {
      try { const out = await fn(req, res); if (!res.headersSent) res.json(out ?? { ok: true }); } catch (e) { erro(res, e); }
    };
    /** Rota de gravação: fn(req, t) roda inteira numa transação; qualquer erro desfaz tudo. */
    const h = (fn) => async (req, res) => {
      try { const out = await db.tx((t) => fn(req, t)); res.json(out ?? { ok: true }); } catch (e) { erro(res, e); }
    };

    // ------------------------------------------------------------ leitura (sempre em lote)
    /** Notas prontas para a tela, com alertas; as parecidas de todas as notas vêm numa consulta só. */
    async function notasView(t, notas, cfg, { comDuplicados = false } = {}) {
      const dups = await duplicadosDe(t, notas);
      return notas.map((n) => {
        const parecidas = dups.get(n.id);
        return { ...n, cnpj_fmt: fmtCnpj(n.cnpj), alertas: alertas(n, cfg, parecidas.length), duplicados: comDuplicados ? parecidas : undefined, ia_json: undefined };
      });
    }
    const getNota = async (t, id) => {
      const n = await t.get('SELECT * FROM despesas_notas WHERE id = ?', Number(id) || 0);
      if (!n) throw new RuleError('Nota não encontrada', 404);
      return n;
    };
    const notaView = async (t, id, opts) => (await notasView(t, [await getNota(t, id)], await config(t), opts))[0];
    const getPedido = async (t, id) => {
      const p = await t.get('SELECT * FROM despesas_pedidos WHERE id = ?', Number(id) || 0);
      if (!p) throw new RuleError('Pedido não encontrado', 404);
      return p;
    };
    /** Pedidos completos (notas com alertas e histórico) em 4 consultas, qualquer que seja a quantidade. */
    async function pedidosView(t, pedidos, { central = false } = {}) {
      if (!pedidos.length) return [];
      const lst = ids(pedidos.map((p) => p.id));
      const notas = await notasView(t, await t.all(`SELECT * FROM despesas_notas WHERE pedido_id IN (${lst}) ORDER BY id`), await config(t), { comDuplicados: central });
      const historico = await t.all(`SELECT * FROM despesas_historico WHERE pedido_id IN (${lst}) ORDER BY id DESC`);
      return pedidos.map((p) => ({ ...p, notas: notas.filter((n) => n.pedido_id === p.id), historico: historico.filter((x) => x.pedido_id === p.id) }));
    }

    r.get('/config', ler(async (req) => {
      const perfil = (await db.get('SELECT * FROM despesas_perfis WHERE user_id = ?', req.user.id)) || {};
      return { ...(await config(db)), pix_tipos: PIX_TIPOS, ia: ai.status(), perfil, colaborador: req.user.name };
    }));

    // TODO(migração): os arquivos ainda ficam em disco local; passam para o Supabase Storage na etapa de arquivos.
    r.get('/arquivo/:id', async (req, res) => {
      try {
        const n = await db.get('SELECT codigo, mime, arquivo, dono_id FROM despesas_notas WHERE id = ?', Number(req.params.id) || 0);
        if (!n || (n.dono_id !== req.user.id && !isCentral(req))) return res.status(404).json({ error: 'Arquivo não encontrado' });
        res.setHeader('Content-Type', n.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="${n.codigo}${MIMES[n.mime] || ''}"`);
        res.sendFile(path.join(filesDir, n.arquivo));
      } catch (e) { erro(res, e); }
    });

    // ============================================================ SOLICITANTE
    // Envio de foto/PDF: cria a nota (rascunho), lê com IA e confere duplicidade
    r.post('/notas', sol, express.raw({ type: () => true, limit: MAX_UPLOAD }), async (req, res) => {
      let arquivo = null;
      try {
        const mime = String(req.headers['content-type'] || '').split(';')[0];
        if (!MIMES[mime]) throw new RuleError('Envie foto (JPG, PNG, WEBP) ou PDF.');
        if (!req.body?.length) throw new RuleError('Arquivo vazio.');
        const cfg = await config(db);
        let substitui = null;
        if (req.query.substitui) {
          substitui = await getNota(db, req.query.substitui);
          if (substitui.dono_id !== req.user.id || substitui.status !== 'recusada') throw new RuleError('Só é possível substituir uma nota recusada sua.');
        }
        const hash = crypto.createHash('sha256').update(req.body).digest('hex');
        const hashOriginal = /^[a-f0-9]{64}$/.test(String(req.headers['x-hash-original'] || '')) ? req.headers['x-hash-original'] : null;
        const nomeOriginal = path.basename(String(req.query.nome || 'arquivo')).slice(0, 200);
        arquivo = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${MIMES[mime]}`;
        await fs.promises.writeFile(path.join(filesDir, arquivo), req.body);

        // leitura por IA fora de transação (pode demorar alguns segundos)
        const lido = await lerNota(ai, req.body, mime, cfg.tipos);

        // gravação atômica
        const { id, descartados } = await db.tx((t) => gravarNota(t, req, { substitui, mime, hash, hashOriginal, nomeOriginal, arquivo, lido, cfg }));
        for (const a of descartados) fs.rm(path.join(filesDir, a), { force: true }, () => {});
        res.status(201).json(await notaView(db, id));
      } catch (err) {
        if (arquivo) fs.rm(path.join(filesDir, arquivo), { force: true }, () => {});
        erro(res, err);
      }
    });

    async function gravarNota(t, req, { substitui, mime, hash, hashOriginal, nomeOriginal, arquivo, lido, cfg }) {
      const pedidoId = substitui?.pedido_id ?? null;
      // descarta substituição anterior ainda não enviada
      const descartados = substitui
        ? (await t.all("DELETE FROM despesas_notas WHERE substitui_id = ? AND status = 'rascunho' RETURNING arquivo", substitui.id)).map((x) => x.arquivo) : [];
      const perfil = await t.get('SELECT centro_custo FROM despesas_perfis WHERE user_id = ?', req.user.id);
      const tipo = lido.tipo || substitui?.tipo || null;
      const { id } = await t.get(`INSERT INTO despesas_notas (dono_id, pedido_id, substitui_id, arquivo, nome_original, mime, tamanho, hash, hash_original,
          valor, data, tipo, centro_custo, motivo, emitente, cnpj, numero_nf, chave_acesso, ia_status, ia_valor, ia_data, ia_json, ia_obs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      req.user.id, pedidoId, substitui?.id ?? null, arquivo, nomeOriginal, mime, req.body.length, hash, hashOriginal,
      lido.valor ?? null, lido.data ?? null, tipo, substitui?.centro_custo || perfil?.centro_custo || cfg.centros[0] || null,
      tipo ? `${tipo}${lido.emitente ? ` - ${lido.emitente}` : ''}` : (substitui?.motivo || null),
      lido.emitente ?? null, lido.cnpj ?? null, lido.numero_nf ?? null, lido.chave_acesso ?? null,
      lido.ia_status, lido.ia_valor ?? null, lido.ia_data ?? null, lido.ia_json ?? null, lido.ia_obs ?? null);
      await t.run('UPDATE despesas_notas SET codigo = ? WHERE id = ?', codigoNota(id), id);
      if (pedidoId) await log(t, pedidoId, id, req.user, 'Nova foto enviada', `${codigoNota(id)} substitui ${substitui.codigo}`);
      return { id, descartados };
    }

    r.get('/rascunhos', sol, ler(async (req) => notasView(db,
      await db.all("SELECT * FROM despesas_notas WHERE dono_id = ? AND status = 'rascunho' AND pedido_id IS NULL ORDER BY id", req.user.id), await config(db))));

    function lerCampos(b, { central = false } = {}) {
      const out = {};
      if ('valor' in b) out.valor = parseValor(b.valor);
      if ('data' in b) { if (b.data && !isDate(b.data)) throw new RuleError('Data inválida.'); out.data = b.data || null; }
      for (const k of ['tipo', 'centro_custo', 'motivo', 'emitente']) if (k in b) out[k] = String(b[k] ?? '').trim() || null;
      if ('cnpj' in b) out.cnpj = soDigitos(b.cnpj) || null;
      if ('numero_nf' in b) out.numero_nf = soDigitos(b.numero_nf).replace(/^0+/, '') || null;
      if (central && 'chave_acesso' in b) out.chave_acesso = soDigitos(b.chave_acesso) || null;
      return out; // as chaves são sempre nomes de coluna fixos deste arquivo
    }
    const meuRascunho = async (t, req, msg) => {
      const n = await getNota(t, req.params.id);
      if (n.dono_id !== req.user.id || n.status !== 'rascunho') throw new RuleError(msg);
      return n;
    };

    r.patch('/notas/:id', sol, h(async (req, t) => {
      const n = await meuRascunho(t, req, 'Esta nota não pode mais ser alterada.');
      const c = lerCampos(req.body || {});
      const keys = Object.keys(c);
      if (keys.length) await t.run(`UPDATE despesas_notas SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = now() WHERE id = ?`, ...keys.map((k) => c[k]), n.id);
      return notaView(t, n.id);
    }));

    r.delete('/notas/:id', sol, h(async (req, t) => {
      const n = await meuRascunho(t, req, 'Esta nota não pode ser excluída.');
      await t.run('DELETE FROM despesas_notas WHERE id = ?', n.id);
      fs.rm(path.join(filesDir, n.arquivo), { force: true }, () => {});
    }));

    function validarNotaParaEnvio(n, cfg) {
      if (!(n.valor > 0)) throw new RuleError(`${n.codigo}: informe o valor.`);
      if (!isDate(n.data)) throw new RuleError(`${n.codigo}: informe a data da despesa.`);
      if (n.data > hoje()) throw new RuleError(`${n.codigo}: a data não pode ser no futuro.`);
      if (!n.tipo || !cfg.tipos.includes(n.tipo)) throw new RuleError(`${n.codigo}: escolha o tipo de despesa.`);
      if (!n.motivo) throw new RuleError(`${n.codigo}: informe o motivo.`);
    }

    r.post('/pedidos', sol, h(async (req, t) => {
      const b = req.body || {};
      const cfg = await config(t);
      const sel = [...new Set((b.notas || []).map(Number))];
      if (!sel.length) throw new RuleError('Adicione ao menos uma nota.');
      if (!PIX_TIPOS.includes(b.pix_tipo) || !String(b.pix_chave || '').trim()) throw new RuleError('Informe o tipo e a chave PIX para receber.');
      if (b.centro_custo && !cfg.centros.includes(b.centro_custo)) throw new RuleError('Centro de custo inválido.');
      const notas = await t.all(`SELECT * FROM despesas_notas WHERE id IN (${ids(sel)}) ORDER BY id`);
      if (notas.length !== sel.length) throw new RuleError('Nota não encontrada', 404);
      for (const n of notas) {
        if (n.dono_id !== req.user.id || n.status !== 'rascunho' || n.pedido_id) throw new RuleError('Uma das notas não pode ser enviada.');
        validarNotaParaEnvio(n, cfg);
      }
      const pix = String(b.pix_chave).trim();
      const { id: pid } = await t.get(`INSERT INTO despesas_pedidos (solicitante_id, solicitante_nome, solicitante_email, centro_custo, pix_tipo, pix_chave, obs_solicitante)
        VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`, req.user.id, req.user.name, req.user.email, b.centro_custo || null, b.pix_tipo, pix, b.obs || null);
      await t.run('UPDATE despesas_pedidos SET codigo = ? WHERE id = ?', codigoPedido(pid), pid);
      await t.run(`UPDATE despesas_notas SET pedido_id = ?, status = 'aguardando', centro_custo = COALESCE(?, centro_custo), updated_at = now() WHERE id IN (${ids(sel)})`, pid, b.centro_custo || null);
      await t.run(`INSERT INTO despesas_perfis (user_id, pix_tipo, pix_chave, centro_custo) VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET pix_tipo = excluded.pix_tipo, pix_chave = excluded.pix_chave, centro_custo = excluded.centro_custo`,
      req.user.id, b.pix_tipo, pix, b.centro_custo || null);
      await recalcPedido(t, pid);
      await log(t, pid, null, req.user, 'Pedido enviado', `${notas.length} nota(s)`);
      return { id: pid, codigo: codigoPedido(pid) };
    }));

    r.get('/meus', sol, ler(async (req) => pedidosView(db, await db.all('SELECT * FROM despesas_pedidos WHERE solicitante_id = ? ORDER BY id DESC', req.user.id))));

    r.get('/pedidos/:id', ler(async (req) => {
      const central = isCentral(req);
      const p = await getPedido(db, req.params.id);
      if (!central && p.solicitante_id !== req.user.id) throw new RuleError('Pedido não encontrado', 404);
      return (await pedidosView(db, [p], { central }))[0];
    }));

    // Reenvia uma nota substituta (foto nova para uma nota recusada)
    r.post('/notas/:id/reenviar', sol, h(async (req, t) => {
      const n = await getNota(t, req.params.id);
      if (n.dono_id !== req.user.id || n.status !== 'rascunho' || !n.substitui_id) throw new RuleError('Nota não pode ser reenviada.');
      validarNotaParaEnvio(n, await config(t));
      await t.run("UPDATE despesas_notas SET status = 'aguardando', updated_at = now() WHERE id = ?", n.id);
      await t.run("UPDATE despesas_notas SET status = 'substituida', updated_at = now() WHERE id = ?", n.substitui_id);
      await t.run("UPDATE despesas_pedidos SET status = 'aguardando' WHERE id = ? AND status <> 'cancelado'", n.pedido_id);
      await recalcPedido(t, n.pedido_id);
      await log(t, n.pedido_id, n.id, req.user, 'Nota reenviada', `${n.codigo} · ${brMoney(n.valor)}`);
    }));

    r.post('/pedidos/:id/cancelar', sol, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      if (p.solicitante_id !== req.user.id) throw new RuleError('Pedido não encontrado', 404);
      const analisada = await t.get("SELECT 1 FROM despesas_notas WHERE pedido_id = ? AND status IN ('ok','recusada') LIMIT 1", p.id);
      if (p.status !== 'aguardando' || analisada) throw new RuleError('A central já começou a analisar este pedido.');
      await t.run("UPDATE despesas_notas SET status = 'cancelada' WHERE pedido_id = ?", p.id);
      await t.run("UPDATE despesas_pedidos SET status = 'cancelado', updated_at = now() WHERE id = ?", p.id);
      await log(t, p.id, null, req.user, 'Pedido cancelado pelo solicitante');
    }));

    // ============================================================ CENTRAL
    r.get('/central/pedidos', cen, ler(async () => {
      const cfg = await config(db);
      const pedidos = await db.all('SELECT * FROM despesas_pedidos ORDER BY id DESC');
      const notas = await db.all("SELECT * FROM despesas_notas WHERE pedido_id IS NOT NULL AND status IN ('aguardando','ok','recusada')");
      // só as notas ainda aguardando precisam da conferência de duplicidade para o contador de alertas
      const dups = await duplicadosDe(db, notas.filter((n) => n.status === 'aguardando'));
      const porPedido = new Map();
      for (const n of notas) { if (!porPedido.has(n.pedido_id)) porPedido.set(n.pedido_id, []); porPedido.get(n.pedido_id).push(n); }
      return pedidos.map((p) => {
        const ns = porPedido.get(p.id) || [];
        return {
          ...p,
          n_notas: ns.length,
          n_aguardando: ns.filter((n) => n.status === 'aguardando').length,
          n_ok: ns.filter((n) => n.status === 'ok').length,
          n_recusadas: ns.filter((n) => n.status === 'recusada').length,
          n_alertas: ns.filter((n) => n.status === 'aguardando' && alertas(n, cfg, dups.get(n.id).length).length).length,
          tipos: [...new Set(ns.map((n) => n.tipo).filter(Boolean))].join(', '),
          data_min: ns.reduce((m, n) => (!m || (n.data && n.data < m) ? n.data : m), null),
        };
      });
    }));

    /** Nota de um pedido que ainda pode ser analisada pela central. */
    async function notaAberta(t, id) {
      const n = await getNota(t, id);
      if (!n.pedido_id) throw new RuleError('Nota ainda não enviada.');
      const p = await t.get('SELECT status FROM despesas_pedidos WHERE id = ?', n.pedido_id);
      if (p.status === 'cancelado') throw new RuleError('Pedido cancelado.');
      if (['substituida', 'cancelada', 'rascunho'].includes(n.status)) throw new RuleError('Esta nota não está em análise.');
      return n;
    }
    async function concluir(t, pid, user) {
      const { pedido, concluiu } = await recalcPedido(t, pid);
      if (!pedido) throw new RuleError('Pedido não encontrado', 404);
      if (concluiu) {
        await log(t, pid, null, user, 'Análise concluída', `${STATUS_LABEL[pedido.status]} · ${brMoney(pedido.total_aprovado)}`);
        await notify(pedido.solicitante_email, `Despesas - ${pedido.codigo}: ${STATUS_LABEL[pedido.status]}`, HTML(`Olá, ${esc(pedido.solicitante_nome)}.<br>
          Seu pedido de reembolso <b>${pedido.codigo}</b> foi analisado: <b>${STATUS_LABEL[pedido.status]}</b>.<br>
          Total aprovado: <b>${brMoney(pedido.total_aprovado)}</b> de ${brMoney(pedido.total_declarado)}.
          ${pedido.obs_central ? `<br><br>Observação da central: ${esc(pedido.obs_central)}` : ''}
          <br><br>Veja os detalhes no QIMA HUB · Despesas.`), t);
      }
      return pedido;
    }

    r.patch('/central/notas/:id', cen, h(async (req, t) => {
      const n = await notaAberta(t, req.params.id);
      const c = lerCampos(req.body || {}, { central: true });
      const mud = Object.keys(c).filter((k) => String(c[k] ?? '') !== String(n[k] ?? ''));
      if (mud.length) {
        await t.run(`UPDATE despesas_notas SET ${mud.map((k) => `${k} = ?`).join(', ')}, editado_central = TRUE,
          valor_aprovado = CASE WHEN status = 'ok' THEN ?::numeric ELSE valor_aprovado END, updated_at = now() WHERE id = ?`,
        ...mud.map((k) => c[k]), c.valor ?? n.valor, n.id);
        const fmt = (k, v) => (k === 'valor' ? brMoney(v) : k === 'data' ? brDate(v) : (v ?? '—'));
        await log(t, n.pedido_id, n.id, req.user, `${n.codigo} editada pela central`, mud.map((k) => `${k}: ${fmt(k, n[k])} → ${fmt(k, c[k])}`).join(' · '));
        await recalcPedido(t, n.pedido_id);
      }
      return notaView(t, n.id, { comDuplicados: true });
    }));

    r.post('/central/notas/:id/ok', cen, h(async (req, t) => {
      const n = await notaAberta(t, req.params.id);
      if (!(n.valor > 0)) throw new RuleError('A nota está sem valor.');
      const aprovado = req.body?.valor_aprovado != null ? parseValor(req.body.valor_aprovado) : n.valor;
      if (!(aprovado > 0) || aprovado > n.valor) throw new RuleError('Valor aprovado inválido (máximo: valor da nota).');
      await t.run("UPDATE despesas_notas SET status = 'ok', valor_aprovado = ?, motivo_recusa = NULL, analisado_por = ?, analisado_at = now() WHERE id = ?", aprovado, req.user.id, n.id);
      await log(t, n.pedido_id, n.id, req.user, `${n.codigo} aprovada`, brMoney(aprovado));
      return { pedido: await concluir(t, n.pedido_id, req.user) };
    }));

    r.post('/central/notas/:id/recusar', cen, h(async (req, t) => {
      const n = await notaAberta(t, req.params.id);
      const motivo = String(req.body?.motivo || '').trim();
      if (!motivo) throw new RuleError('Informe o motivo da recusa.');
      await t.run("UPDATE despesas_notas SET status = 'recusada', valor_aprovado = NULL, motivo_recusa = ?, analisado_por = ?, analisado_at = now() WHERE id = ?", motivo, req.user.id, n.id);
      await log(t, n.pedido_id, n.id, req.user, `${n.codigo} recusada`, motivo);
      return { pedido: await concluir(t, n.pedido_id, req.user) };
    }));

    r.post('/central/notas/:id/reabrir', cen, h(async (req, t) => {
      const n = await notaAberta(t, req.params.id);
      await t.run("UPDATE despesas_notas SET status = 'aguardando', valor_aprovado = NULL, motivo_recusa = NULL WHERE id = ?", n.id);
      await t.run("UPDATE despesas_pedidos SET status = 'aguardando' WHERE id = ?", n.pedido_id);
      await recalcPedido(t, n.pedido_id);
      await log(t, n.pedido_id, n.id, req.user, `${n.codigo} voltou para análise`);
    }));

    r.post('/central/pedidos/:id/aprovar-tudo', cen, h(async (req, t) => {
      const pid = Number(req.params.id) || 0;
      const pend = await t.all("SELECT codigo, valor FROM despesas_notas WHERE pedido_id = ? AND status = 'aguardando' ORDER BY id", pid);
      if (!pend.length) throw new RuleError('Não há notas aguardando.');
      const semValor = pend.find((n) => !(n.valor > 0));
      if (semValor) throw new RuleError(`${semValor.codigo} está sem valor.`);
      await t.run("UPDATE despesas_notas SET status = 'ok', valor_aprovado = valor, analisado_por = ?, analisado_at = now() WHERE pedido_id = ? AND status = 'aguardando'", req.user.id, pid);
      await log(t, pid, null, req.user, 'Aprovou todas as notas pendentes', `${pend.length} nota(s)`);
      return { pedido: await concluir(t, pid, req.user) };
    }));

    r.post('/central/pedidos/:id/reprovar-tudo', cen, h(async (req, t) => {
      const pid = Number(req.params.id) || 0;
      const motivo = String(req.body?.motivo || '').trim();
      if (!motivo) throw new RuleError('Informe o motivo.');
      const x = await t.run("UPDATE despesas_notas SET status = 'recusada', motivo_recusa = ?, analisado_por = ?, analisado_at = now() WHERE pedido_id = ? AND status = 'aguardando'", motivo, req.user.id, pid);
      if (!x.rowCount) throw new RuleError('Não há notas aguardando.');
      await log(t, pid, null, req.user, 'Recusou todas as notas pendentes', motivo);
      return { pedido: await concluir(t, pid, req.user) };
    }));

    r.put('/central/pedidos/:id/obs', cen, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      const obs = String(req.body?.obs_central || '').trim() || null;
      await t.run('UPDATE despesas_pedidos SET obs_central = ?, updated_at = now() WHERE id = ?', obs, p.id);
      await log(t, p.id, null, req.user, 'Observação da central', obs || '(removida)');
    }));

    r.post('/central/pedidos/:id/pagamento', cen, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      const { pago_em, obs } = req.body || {};
      if (pago_em && !['aprovado', 'parcial'].includes(p.status)) throw new RuleError('Só pedidos aprovados podem ser pagos.');
      if (pago_em && !isDate(pago_em)) throw new RuleError('Data de pagamento inválida.');
      await t.run('UPDATE despesas_pedidos SET pago_em = ?, pagamento_obs = ?, updated_at = now() WHERE id = ?', pago_em || null, obs || null, p.id);
      await log(t, p.id, null, req.user, pago_em ? 'Pagamento registrado' : 'Pagamento desfeito', pago_em ? `${brDate(pago_em)} · ${brMoney(p.total_aprovado)}` : '');
      if (pago_em) {
        await notify(p.solicitante_email, `Despesas - ${p.codigo}: reembolso pago`,
          HTML(`O reembolso <b>${p.codigo}</b> de <b>${brMoney(p.total_aprovado)}</b> foi pago em ${brDate(pago_em)} via PIX (${esc(p.pix_tipo)}).`), t);
      }
    }));

    r.put('/central/config', cen, h(async (req, t) => {
      const b = req.body || {};
      const linhas = (v) => [...new Set(String(v || '').split('\n').map((s) => s.trim()).filter(Boolean))];
      const sync = async (tabela, nomes) => { // "tabela" é um nome fixo deste arquivo
        if (!nomes.length) throw new RuleError('As listas não podem ficar vazias.');
        await t.run(`UPDATE ${tabela} SET ativo = FALSE`);
        await t.run(`INSERT INTO ${tabela} (nome) VALUES ${nomes.map(() => '(?)').join(', ')} ON CONFLICT (nome) DO UPDATE SET ativo = TRUE`, ...nomes);
      };
      if ('tipos' in b) await sync('despesas_tipos', linhas(b.tipos));
      if ('centros' in b) await sync('despesas_centros', linhas(b.centros));
      if ('dias_limite' in b) {
        const d = Math.round(Number(b.dias_limite));
        if (!(d >= 1 && d <= 3650)) throw new RuleError('Dias limite inválido.');
        await t.run("UPDATE despesas_config SET valor = ? WHERE chave = 'dias_limite'", String(d));
      }
      return config(t);
    }));

    // ------------------------------------------------------------ downloads (Excel + fotos)
    const COLS = [
      { label: 'ID Foto', width: 13 }, { label: 'Arquivo', width: 30 }, { label: 'Pedido', width: 12 }, { label: 'Colaborador', width: 26 },
      { label: 'Enviado em', width: 12, type: 'date' }, { label: 'Data despesa', width: 12, type: 'date' }, { label: 'Tipo', width: 18 },
      { label: 'Centro de custo', width: 18 }, { label: 'Motivo', width: 40 }, { label: 'Valor declarado', width: 15, type: 'money' },
      { label: 'Valor aprovado', width: 15, type: 'money' }, { label: 'Status nota', width: 13 }, { label: 'Motivo recusa', width: 30 },
      { label: 'Emitente', width: 32 }, { label: 'CNPJ', width: 20 }, { label: 'Nº NF', width: 10 }, { label: 'Chave de acesso', width: 48 },
      { label: 'Lido pela IA', width: 12 }, { label: 'Editado pela central', width: 12 }, { label: 'Alertas', width: 40 },
      { label: 'Status pedido', width: 16 }, { label: 'PIX tipo', width: 10 }, { label: 'PIX chave', width: 22 }, { label: 'Pago em', width: 12, type: 'date' },
    ];
    const nomeFoto = (n) => `fotos/${n.codigo}${MIMES[n.mime] || ''}`;
    /** Linhas do Excel para as notas (não canceladas) dos pedidos dados; duplicidade conferida numa consulta só. */
    async function linhasExcel(pedidos) {
      if (!pedidos.length) return { rows: [], notas: [] };
      const cfg = await config(db);
      const porId = new Map(pedidos.map((p) => [p.id, p]));
      const notas = await db.all(`SELECT * FROM despesas_notas WHERE pedido_id IN (${ids(pedidos.map((p) => p.id))}) AND status <> 'cancelada' ORDER BY pedido_id, id`);
      const dups = await duplicadosDe(db, notas);
      const rows = notas.map((n) => {
        const p = porId.get(n.pedido_id);
        return [n.codigo, nomeFoto(n), p.codigo, p.solicitante_nome, p.created_at.slice(0, 10), n.data, n.tipo, n.centro_custo, n.motivo,
          n.valor, n.status === 'ok' ? n.valor_aprovado : null, NOTA_LABEL[n.status], n.motivo_recusa, n.emitente, fmtCnpj(n.cnpj), n.numero_nf,
          n.chave_acesso, n.ia_status === 'ok' ? 'Sim' : 'Não', n.editado_central ? 'Sim' : 'Não',
          alertas(n, cfg, dups.get(n.id).length).map((a) => a.texto).join('; '), STATUS_LABEL[p.status], p.pix_tipo, p.pix_chave, p.pago_em];
      });
      return { rows, notas };
    }

    r.get('/central/pedidos/:id/zip', cen, ler(async (req, res) => {
      const p = await getPedido(db, req.params.id);
      const { rows, notas } = await linhasExcel([p]);
      const entradas = [];
      for (const n of notas) {
        try { entradas.push({ name: `${p.codigo}/${nomeFoto(n)}`, data: await fs.promises.readFile(path.join(filesDir, n.arquivo)) }); } catch { /* arquivo ausente: segue sem ele */ }
      }
      const xlsx = files.xlsx([
        { name: 'Notas', columns: COLS, rows },
        { name: 'Pedido', columns: [{ label: 'Pedido' }, { label: 'Colaborador', width: 26 }, { label: 'E-mail', width: 26 }, { label: 'Enviado em', type: 'date', width: 12 },
          { label: 'Status', width: 16 }, { label: 'Total declarado', type: 'money', width: 15 }, { label: 'Total aprovado', type: 'money', width: 15 },
          { label: 'PIX tipo' }, { label: 'PIX chave', width: 22 }, { label: 'Centro de custo', width: 18 }, { label: 'Obs. central', width: 40 }, { label: 'Pago em', type: 'date', width: 12 }],
          rows: [[p.codigo, p.solicitante_nome, p.solicitante_email, p.created_at.slice(0, 10), STATUS_LABEL[p.status],
            p.total_declarado, p.total_aprovado, p.pix_tipo, p.pix_chave, p.centro_custo, p.obs_central, p.pago_em]] },
      ]);
      entradas.unshift({ name: `${p.codigo}/${p.codigo}.xlsx`, data: xlsx });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${p.codigo}.zip"`);
      res.send(files.zip(entradas));
    }));

    // Excel geral (financeiro): todas as notas dos pedidos filtrados
    r.get('/central/exportar', cen, ler(async (req, res) => {
      const st = String(req.query.status || '');
      const de = isDate(req.query.de) ? req.query.de : null;
      const ate = isDate(req.query.ate) ? req.query.ate : null;
      const pedidos = (await db.all('SELECT * FROM despesas_pedidos ORDER BY id'))
        .filter((p) => (!st || (st === 'a_pagar' ? ['aprovado', 'parcial'].includes(p.status) && !p.pago_em : st === 'pagos' ? !!p.pago_em : p.status === st))
          && (!de || p.created_at.slice(0, 10) >= de) && (!ate || p.created_at.slice(0, 10) <= ate));
      const { rows } = await linhasExcel(pedidos);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="despesas-${hoje()}.xlsx"`);
      res.send(files.xlsx([{ name: 'Notas', columns: COLS, rows }]));
    }));
  },
};
