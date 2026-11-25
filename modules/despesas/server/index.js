// Backend do sistema Despesas (reembolso com foto da nota).
//
// Banco: Postgres (assíncrono). Dentro de uma transação (rotas com "h") use sempre o "t".
// A leitura por IA acontece sempre FORA de transação (pode demorar alguns segundos).
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import migrations from './migrations.js';
import relatorio from './relatorio.js';
import { lerNota } from './ia.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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
    const { db, requireRole, notify, arquivos, ai, files, limitar } = ctx;
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
        await arquivos.enviar(res, n.arquivo);
      } catch (e) { erro(res, e); }
    });

    // ============================================================ SOLICITANTE
    // Envio de foto/PDF: cria a nota (rascunho), lê com IA e confere duplicidade
    r.post('/notas', sol, limitar({ nome: 'envio', max: 40, porDia: 100 }), express.raw({ type: () => true, limit: MAX_UPLOAD }), async (req, res) => {
      let arquivo = null;
      try {
        const mime = String(req.headers['content-type'] || '').split(';')[0];
        if (!MIMES[mime]) throw new RuleError('Envie foto (JPG, PNG, WEBP) ou PDF.');
        if (!req.body?.length) throw new RuleError('Arquivo vazio.');
        { const ruim = arquivos.conferir(req.body, mime); if (ruim) throw new RuleError(ruim); } // conteúdo real, não o tipo declarado
        const cfg = await config(db);
        let substitui = null;
        if (req.query.substitui) {
          substitui = await getNota(db, req.query.substitui);
          if (substitui.dono_id !== req.user.id || substitui.status !== 'recusada') throw new RuleError('Só é possível substituir uma nota recusada sua.');
          if (substitui.pedido_id) await pedidoAberto(db, substitui.pedido_id);
        }
        const hash = crypto.createHash('sha256').update(req.body).digest('hex');
        const hashOriginal = /^[a-f0-9]{64}$/.test(String(req.headers['x-hash-original'] || '')) ? req.headers['x-hash-original'] : null;
        const nomeOriginal = path.basename(String(req.query.nome || 'arquivo')).slice(0, 200);
        arquivo = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${MIMES[mime]}`;
        await arquivos.salvar(arquivo, req.body, mime);

        // leitura por IA fora de transação (pode demorar alguns segundos)
        const lido = await lerNota(ai, req.body, mime, cfg.tipos);

        // gravação atômica
        const { id, descartados } = await db.tx((t) => gravarNota(t, req, { substitui, mime, hash, hashOriginal, nomeOriginal, arquivo, lido, cfg }));
        for (const a of descartados) arquivos.apagar(a);
        res.status(201).json(await notaView(db, id));
      } catch (err) {
        if (arquivo) arquivos.apagar(arquivo);
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

    /** Pedido que ainda aceita mudança nas notas: nem cancelado nem já pago (para mexer num pago, a central desfaz o pagamento antes). */
    async function pedidoAberto(t, pid) {
      const p = await t.get('SELECT id, status, pago_em, solicitante_id FROM despesas_pedidos WHERE id = ?', Number(pid) || 0);
      if (!p) throw new RuleError('Pedido não encontrado', 404);
      if (p.status === 'cancelado') throw new RuleError('Pedido cancelado.');
      if (p.pago_em) throw new RuleError('Este pedido já foi pago. Para alterar, a central precisa desfazer o pagamento antes.');
      return p;
    }
    /** A central não analisa nem paga o próprio reembolso (quem tem papel "ambos"). */
    const naoEhOProprio = (p, req) => {
      if (p.solicitante_id === req.user.id) throw new RuleError('Você não pode analisar ou pagar o seu próprio pedido. Peça a outra pessoa da central.', 403);
    };

    function lerCampos(b, { central = false } = {}) {
      const out = {};
      if ('valor' in b) {
        out.valor = parseValor(b.valor);
        if (out.valor !== null && !(out.valor > 0 && out.valor < 10_000_000)) throw new RuleError('Valor inválido.');
      }
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
      arquivos.apagar(n.arquivo);
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
      // FOR UPDATE: dois envios ao mesmo tempo com as mesmas notas ficam em fila; o segundo vê as notas já enviadas e é recusado
      const notas = await t.all(`SELECT * FROM despesas_notas WHERE id IN (${ids(sel)}) ORDER BY id FOR UPDATE`);
      if (notas.length !== sel.length) throw new RuleError('Nota não encontrada', 404);
      for (const n of notas) {
        if (n.dono_id !== req.user.id || n.status !== 'rascunho' || n.pedido_id) throw new RuleError('Uma das notas não pode ser enviada.');
        validarNotaParaEnvio(n, cfg);
      }
      const pix = String(b.pix_chave).trim();
      const { id: pid } = await t.get(`INSERT INTO despesas_pedidos (solicitante_id, solicitante_nome, solicitante_email, centro_custo, pix_tipo, pix_chave, obs_solicitante)
        VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`, req.user.id, req.user.name, req.user.email, b.centro_custo || null, b.pix_tipo, pix, b.obs || null);
      await t.run('UPDATE despesas_pedidos SET codigo = ? WHERE id = ?', codigoPedido(pid), pid);
      const mov = await t.run(`UPDATE despesas_notas SET pedido_id = ?, status = 'aguardando', centro_custo = COALESCE(?, centro_custo), updated_at = now()
        WHERE id IN (${ids(sel)}) AND status = 'rascunho' AND pedido_id IS NULL AND dono_id = ?`, pid, b.centro_custo || null, req.user.id);
      if (mov.rowCount !== sel.length) throw new RuleError('Uma das notas já foi enviada em outro pedido. Atualize a página.');
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
      await pedidoAberto(t, n.pedido_id);
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
    async function notaAberta(t, id, req) {
      const n = await getNota(t, id);
      if (!n.pedido_id) throw new RuleError('Nota ainda não enviada.');
      naoEhOProprio(await pedidoAberto(t, n.pedido_id), req);
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
      const n = await notaAberta(t, req.params.id, req);
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
      const n = await notaAberta(t, req.params.id, req);
      if (!(n.valor > 0)) throw new RuleError('A nota está sem valor.');
      const aprovado = req.body?.valor_aprovado != null ? parseValor(req.body.valor_aprovado) : n.valor;
      if (!(aprovado > 0) || aprovado > n.valor) throw new RuleError('Valor aprovado inválido (máximo: valor da nota).');
      await t.run("UPDATE despesas_notas SET status = 'ok', valor_aprovado = ?, motivo_recusa = NULL, analisado_por = ?, analisado_at = now() WHERE id = ?", aprovado, req.user.id, n.id);
      await log(t, n.pedido_id, n.id, req.user, `${n.codigo} aprovada`, brMoney(aprovado));
      return { pedido: await concluir(t, n.pedido_id, req.user) };
    }));

    r.post('/central/notas/:id/recusar', cen, h(async (req, t) => {
      const n = await notaAberta(t, req.params.id, req);
      const motivo = String(req.body?.motivo || '').trim();
      if (!motivo) throw new RuleError('Informe o motivo da recusa.');
      await t.run("UPDATE despesas_notas SET status = 'recusada', valor_aprovado = NULL, motivo_recusa = ?, analisado_por = ?, analisado_at = now() WHERE id = ?", motivo, req.user.id, n.id);
      await log(t, n.pedido_id, n.id, req.user, `${n.codigo} recusada`, motivo);
      return { pedido: await concluir(t, n.pedido_id, req.user) };
    }));

    r.post('/central/notas/:id/reabrir', cen, h(async (req, t) => {
      const n = await notaAberta(t, req.params.id, req);
      await t.run("UPDATE despesas_notas SET status = 'aguardando', valor_aprovado = NULL, motivo_recusa = NULL WHERE id = ?", n.id);
      await t.run("UPDATE despesas_pedidos SET status = 'aguardando' WHERE id = ?", n.pedido_id);
      await recalcPedido(t, n.pedido_id);
      await log(t, n.pedido_id, n.id, req.user, `${n.codigo} voltou para análise`);
    }));

    r.post('/central/pedidos/:id/aprovar-tudo', cen, h(async (req, t) => {
      const pid = Number(req.params.id) || 0;
      naoEhOProprio(await pedidoAberto(t, pid), req);
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
      naoEhOProprio(await pedidoAberto(t, pid), req);
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
      naoEhOProprio(p, req);
      const { pago_em, obs } = req.body || {};
      if (pago_em && !['aprovado', 'parcial'].includes(p.status)) throw new RuleError('Só pedidos aprovados podem ser pagos.');
      if (pago_em && !isDate(pago_em)) throw new RuleError('Data de pagamento inválida.');
      // taxa do pagamento (tarifa do banco etc.): soma no total pago; desfazer o pagamento zera
      const bruta = req.body?.taxa;
      const taxa = !pago_em || bruta === undefined || bruta === null || bruta === '' ? 0 : (typeof bruta === 'number' ? bruta : parseValor(bruta));
      if (!(Number.isFinite(taxa) && taxa >= 0 && taxa <= 100000)) throw new RuleError('Taxa inválida.');
      const taxaR = Math.round(taxa * 100) / 100;
      const taxaObs = pago_em ? String(req.body?.taxa_obs || '').trim().slice(0, 200) || null : null;
      await t.run('UPDATE despesas_pedidos SET pago_em = ?, pagamento_obs = ?, pagamento_taxa = ?, pagamento_taxa_obs = ?, updated_at = now() WHERE id = ?',
        pago_em || null, obs || null, taxaR, taxaObs, p.id);
      await log(t, p.id, null, req.user, pago_em ? 'Pagamento registrado' : 'Pagamento desfeito', pago_em
        ? `${brDate(pago_em)} · ${brMoney(p.total_aprovado)}${taxaR ? ` + taxa ${brMoney(taxaR)}${taxaObs ? ` (${taxaObs})` : ''} = ${brMoney(p.total_aprovado + taxaR)}` : ''}` : '');
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
    // colunas do pagamento, por pedido (taxa e total pago = aprovado + taxa)
    const COLS_PAGTO = [{ label: 'Pago em', type: 'date', width: 12 }, { label: 'Taxa pagamento', type: 'money', width: 15 },
      { label: 'Obs. da taxa', width: 24 }, { label: 'Total pago', type: 'money', width: 15 }];
    const pagto = (p) => [p.pago_em, p.pago_em ? p.pagamento_taxa || 0 : null, p.pagamento_taxa_obs, p.pago_em ? p.total_aprovado + (p.pagamento_taxa || 0) : null];
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
      const fotos = await arquivos.lerVarios(notas.map((n) => n.arquivo));
      notas.forEach((n, i) => { if (fotos[i]) entradas.push({ name: `${p.codigo}/${nomeFoto(n)}`, data: fotos[i] }); }); // arquivo ausente: segue sem ele
      const xlsx = files.xlsx([
        { name: 'Notas', columns: COLS, rows },
        { name: 'Pedido', columns: [{ label: 'Pedido' }, { label: 'Colaborador', width: 26 }, { label: 'E-mail', width: 26 }, { label: 'Enviado em', type: 'date', width: 12 },
          { label: 'Status', width: 16 }, { label: 'Total declarado', type: 'money', width: 15 }, { label: 'Total aprovado', type: 'money', width: 15 },
          { label: 'PIX tipo' }, { label: 'PIX chave', width: 22 }, { label: 'Centro de custo', width: 18 }, { label: 'Obs. central', width: 40 },
          ...COLS_PAGTO],
          rows: [[p.codigo, p.solicitante_nome, p.solicitante_email, p.created_at.slice(0, 10), STATUS_LABEL[p.status],
            p.total_declarado, p.total_aprovado, p.pix_tipo, p.pix_chave, p.centro_custo, p.obs_central, ...pagto(p)]] },
      ]);
      entradas.unshift({ name: `${p.codigo}/${p.codigo}.xlsx`, data: xlsx });
      await arquivos.entregarDownload(res, `${p.codigo}.zip`, files.zip(entradas));
    }));

    // ------------------------------------------------------------ PDF (capa do pedido + uma página por nota)
    const A4 = [595.28, 841.89];
    const MARGEM = 40;
    const MAX_NOTAS_PDF = 400; // acima disso o arquivo fica grande demais para baixar de uma vez
    /** Monta um PDF. grupos = [{ p, notas }]. resumo (opcional) = página inicial com a lista dos pedidos. */
    async function montarPdf(grupos, { titulo, resumo }) {
      const doc = await PDFDocument.create();
      doc.setTitle(titulo);
      const fonte = await doc.embedFont(StandardFonts.Helvetica);
      const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
      // a fonte padrão do PDF só tem o alfabeto latino: troca o resto para não quebrar a geração
      const txt = (v) => String(v ?? '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');
      const escrever = (pg, v, x, y, tam = 10, f = fonte, cor = rgb(0.15, 0.15, 0.15)) => pg.drawText(txt(v), { x, y, size: tam, font: f, color: cor });
      const VERMELHO = rgb(0.894, 0, 0.169);
      const M = MARGEM;
      const linhaNota = (n) => `${n.codigo} · ${n.data ? brDate(n.data) : '-'} · ${n.tipo || '-'} · ${brMoney((n.status === 'ok' ? n.valor_aprovado : n.valor) || 0)} · ${NOTA_LABEL[n.status] || n.status}`;
      const totalPago = (p) => p.total_aprovado + (p.pagamento_taxa || 0);
      /** "Total por categoria": uma linha por tipo de despesa com as notas aprovadas e o valor aprovado. Devolve o novo y. */
      const porCategoria = (pg, notas, y) => {
        const mapa = new Map();
        for (const n of notas.filter((x) => x.status === 'ok')) {
          const k = n.tipo || 'Sem categoria';
          const c = mapa.get(k) || { qtd: 0, total: 0 };
          c.qtd += 1; c.total += Number(n.valor_aprovado || 0);
          mapa.set(k, c);
        }
        if (!mapa.size) return y;
        escrever(pg, 'Total por categoria (notas aprovadas)', M, y, 13, negrito); y -= 18;
        const linhas = [...mapa.entries()].sort((a, b) => b[1].total - a[1].total);
        for (const [k, c] of linhas) {
          escrever(pg, k, M, y, 10.5); escrever(pg, `${c.qtd} nota(s)`, M + 260, y, 10.5);
          const v = brMoney(c.total); escrever(pg, v, A4[0] - M - negrito.widthOfTextAtSize(txt(v), 10.5), y, 10.5, negrito);
          y -= 15;
        }
        const soma = brMoney(linhas.reduce((s, [, c]) => s + c.total, 0));
        pg.drawLine({ start: { x: M, y: y + 10 }, end: { x: A4[0] - M, y: y + 10 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
        escrever(pg, 'Total', M, y - 2, 10.5, negrito); escrever(pg, soma, A4[0] - M - negrito.widthOfTextAtSize(txt(soma), 10.5), y - 2, 10.5, negrito);
        return y - 26;
      };

      if (resumo) {
        let pg = doc.addPage(A4);
        let y = A4[1] - M - 10;
        escrever(pg, resumo.titulo, M, y, 18, negrito, VERMELHO); y -= 22;
        for (const l of resumo.linhas) { escrever(pg, l, M, y, 10.5); y -= 15; }
        y -= 8;
        y = porCategoria(pg, grupos.flatMap((g) => g.notas), y);
        escrever(pg, 'Pedido · Colaborador · Pago em · Aprovado · Taxa · Total pago · Notas', M, y, 9.5, negrito); y -= 15;
        for (const { p, notas } of grupos) {
          if (y < M) { pg = doc.addPage(A4); y = A4[1] - M; }
          escrever(pg, `${p.codigo} · ${p.solicitante_nome} · ${p.pago_em ? brDate(p.pago_em) : '-'} · ${brMoney(p.total_aprovado)} · ${brMoney(p.pagamento_taxa || 0)} · ${brMoney(totalPago(p))} · ${notas.length}`, M, y, 9.5);
          y -= 13;
        }
      }

      for (const { p, notas } of grupos) {
        // capa do pedido
        const capa = doc.addPage(A4);
        let y = A4[1] - M - 10;
        escrever(capa, `Reembolso ${p.codigo}`, M, y, 20, negrito, VERMELHO); y -= 26;
        const linhasCapa = [
          ['Colaborador', `${p.solicitante_nome}${p.solicitante_email ? ` (${p.solicitante_email})` : ''}`],
          ['Enviado em', brDate(p.created_at.slice(0, 10))],
          ['Status', STATUS_LABEL[p.status] || p.status],
          ['PIX', `${p.pix_tipo || ''}: ${p.pix_chave || ''}`],
          ['Total declarado', brMoney(p.total_declarado)],
          ['Total aprovado', brMoney(p.total_aprovado)],
          ...(p.pago_em ? [['Pago em', brDate(p.pago_em)], ['Taxa do pagamento', `${brMoney(p.pagamento_taxa || 0)}${p.pagamento_taxa_obs ? ` (${p.pagamento_taxa_obs})` : ''}`],
            ['Total pago', brMoney(totalPago(p))]] : []),
        ];
        for (const [k, v] of linhasCapa) { escrever(capa, `${k}:`, M, y, 11, negrito); escrever(capa, v, M + 120, y, 11); y -= 17; }
        y -= 10;
        y = porCategoria(capa, notas, y);
        escrever(capa, `Notas aprovadas (${notas.length})`, M, y, 13, negrito); y -= 18;
        for (const n of notas) { if (y < M) break; escrever(capa, linhaNota(n), M, y, 9.5); y -= 14; }

        // uma página por nota: cabeçalho com os dados e a foto ajustada ao espaço
        const cabecalho = (pg, n, extra = '') => {
          const [w, h] = [pg.getWidth(), pg.getHeight()];
          pg.drawRectangle({ x: 0, y: h - 34, width: w, height: 34, color: rgb(1, 1, 1), opacity: 0.92 });
          escrever(pg, `${p.codigo} · ${p.solicitante_nome} · ${linhaNota(n)}${extra}`, 12, h - 22, 9.5, negrito);
        };
        const conteudos = await arquivos.lerVarios(notas.map((n) => n.arquivo));
        for (let i = 0; i < notas.length; i++) {
          const n = notas[i];
          const buf = conteudos[i];
          try {
            if (!buf) throw new Error('arquivo não encontrado');
            if (n.mime === 'application/pdf') {
              const origem = await PDFDocument.load(buf, { ignoreEncryption: true });
              const paginas = await doc.copyPages(origem, origem.getPageIndices());
              paginas.forEach((pg, k) => { doc.addPage(pg); cabecalho(pg, n, paginas.length > 1 ? ` · pág. ${k + 1}/${paginas.length}` : ''); });
              continue;
            }
            if (!['image/jpeg', 'image/png'].includes(n.mime)) throw new Error('formato sem suporte no PDF (veja o ZIP)');
            // PNG é descompactado inteiro na memória para entrar no PDF: foto gigante (ou enviada antes da conferência) fica de fora
            const dim = n.mime === 'image/png' ? arquivos.dimensoes(buf, n.mime) : null;
            if (n.mime === 'image/png' && (!dim || dim.w * dim.h > 16e6)) throw new Error('imagem grande demais para o PDF (veja o ZIP)');
            const img = n.mime === 'image/png' ? await doc.embedPng(buf) : await doc.embedJpg(buf);
            const pg = doc.addPage(A4);
            const areaW = A4[0] - 2 * M;
            const areaH = A4[1] - 2 * M - 30;
            const escala = Math.min(areaW / img.width, areaH / img.height, 1.5);
            const w = img.width * escala;
            const h = img.height * escala;
            pg.drawImage(img, { x: (A4[0] - w) / 2, y: M + (areaH - h) / 2, width: w, height: h });
            cabecalho(pg, n);
          } catch (e) {
            const pg = doc.addPage(A4);
            cabecalho(pg, n);
            escrever(pg, `Não foi possível incluir este arquivo: ${e.message}.`, M, A4[1] / 2, 12, fonte, rgb(0.7, 0.1, 0.1));
          }
        }
      }
      return Buffer.from(await doc.save());
    }

    // PDF de um pedido: capa e as notas APROVADAS (fotos e PDFs), uma por página. Recusadas e em análise não entram.
    r.get('/central/pedidos/:id/pdf', cen, ler(async (req, res) => {
      const p = await getPedido(db, req.params.id);
      const notas = await db.all("SELECT * FROM despesas_notas WHERE pedido_id = ? AND status = 'ok' ORDER BY id", p.id);
      if (!notas.length) throw new RuleError(`${p.codigo} ainda não tem nota aprovada para o PDF.`);
      const pdf = await montarPdf([{ p, notas }], { titulo: `${p.codigo} - ${p.solicitante_nome}` });
      await arquivos.entregarDownload(res, `${p.codigo}.pdf`, pdf, 'application/pdf');
    }));

    // PDF dos pagos no período (pela data do pagamento), de todos os colaboradores: só as notas aprovadas (as que foram pagas)
    r.get('/central/pagos.pdf', cen, ler(async (req, res) => {
      const { de, ate } = req.query;
      if (!isDate(de) || !isDate(ate)) throw new RuleError('Informe as datas de e até.');
      if (ate < de) throw new RuleError('A data final é antes da inicial.');
      const pedidos = await db.all("SELECT * FROM despesas_pedidos WHERE pago_em BETWEEN ? AND ? AND status IN ('aprovado','parcial') ORDER BY pago_em, id", de, ate);
      if (!pedidos.length) throw new RuleError(`Nenhum reembolso pago entre ${brDate(de)} e ${brDate(ate)}.`);
      const notas = await db.all(`SELECT * FROM despesas_notas WHERE pedido_id IN (${ids(pedidos.map((p) => p.id))}) AND status = 'ok' ORDER BY pedido_id, id`);
      if (notas.length > MAX_NOTAS_PDF) throw new RuleError(`São ${notas.length} notas nesse período (máximo ${MAX_NOTAS_PDF} por PDF). Escolha um período menor.`);
      // ?checar=1: só confere (a tela mostra o erro antes de abrir o download)
      if (req.query.checar) return res.json({ pedidos: pedidos.length, notas: notas.length });
      const grupos = pedidos.map((p) => ({ p, notas: notas.filter((n) => n.pedido_id === p.id) }));
      const aprovado = pedidos.reduce((s, p) => s + p.total_aprovado, 0);
      const taxas = pedidos.reduce((s, p) => s + (p.pagamento_taxa || 0), 0);
      const periodo = de === ate ? brDate(de) : `${brDate(de)} a ${brDate(ate)}`;
      const pdf = await montarPdf(grupos, {
        titulo: `Reembolsos pagos ${periodo}`,
        resumo: {
          titulo: `Reembolsos pagos · ${periodo}`,
          linhas: [`${pedidos.length} pedido(s) · ${notas.length} nota(s) aprovada(s)`,
            `Total aprovado ${brMoney(aprovado)} · Taxas ${brMoney(taxas)} · Total pago ${brMoney(aprovado + taxas)}`,
            `Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} por ${req.user.name}`],
        },
      });
      await arquivos.entregarDownload(res, `reembolsos-pagos_${de}_a_${ate}.pdf`, pdf, 'application/pdf');
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
      // aba "Pedidos": um por linha, com a taxa e o total pago (na aba Notas a taxa repetiria em cada nota)
      const pedidosRows = pedidos.filter((p) => p.status !== 'cancelado').map((p) => [p.codigo, p.solicitante_nome, p.created_at.slice(0, 10), STATUS_LABEL[p.status],
        p.total_declarado, p.total_aprovado, p.pix_tipo, p.pix_chave, ...pagto(p)]);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="despesas-${hoje()}.xlsx"`);
      res.send(files.xlsx([
        { name: 'Notas', columns: COLS, rows },
        { name: 'Pedidos', columns: [{ label: 'Pedido', width: 12 }, { label: 'Colaborador', width: 26 }, { label: 'Enviado em', type: 'date', width: 12 },
          { label: 'Status', width: 16 }, { label: 'Total declarado', type: 'money', width: 15 }, { label: 'Total aprovado', type: 'money', width: 15 },
          { label: 'PIX tipo' }, { label: 'PIX chave', width: 22 }, ...COLS_PAGTO], rows: pedidosRows },
      ]));
    }));
  },
};
