// Backend do sistema Nota NF — guarda os dados das NFs de semente de soja.
//
// Banco: Postgres (assíncrono). Dentro de uma transação (rotas com "h") use sempre o "t".
// A leitura por IA acontece sempre FORA de transação (pode demorar alguns segundos).
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import migrations from './migrations.js';
import relatorio from './relatorio.js';
import { lerNF } from './ia.js';
import {
  RuleError, isDate, hoje, soDigitos, fmtDoc, parseNumero, codigoNota, UFS, ids,
  classificarItem, totais, config, log, logs, duplicadosDe, alertas, chaveInfo, chaveValida, STATUS_LABEL,
  DISTRITOS, PARAMETROS, potencial, somaPotencial, folhaPotencial,
} from './regras.js';

const MIMES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const MAX_UPLOAD = 20 * 1024 * 1024;
const CAMPOS = ['numero_nf', 'serie', 'chave_acesso', 'emitente_nome', 'emitente_doc', 'produtor_nome', 'produtor_doc', 'data_emissao', 'municipio', 'uf', 'peso_liquido', 'distrito', 'obs_solicitante'];
/** Nome da foto dentro do ZIP e na coluna "Arquivo" do Excel: "NF 765432 - Produtor Fulano (NF-00005).jpg" (o código garante nome único). */
const limpaNome = (s) => String(s || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70);
const nomeFoto = (n) => `NF ${n.numero_nf || 's-n'} - ${limpaNome(n.produtor_nome) || 'sem produtor'} (${n.codigo})${MIMES[n.mime] || ''}`;
const fmtInt = (n) => Math.round(n || 0).toLocaleString('pt-BR');
const HTML = (corpo) => `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6">${corpo}</div>`;
const esc = (s) => String(s ?? '').replace(/</g, '&lt;');
const NAO_RASCUNHO = "status NOT IN ('rascunho')";

export default {
  banco: 'postgres',
  migrations,
  relatorio,

  async summary({ db, user, isCentral }) {
    if (isCentral) {
      const r = await db.get(`SELECT (SELECT COUNT(*) FROM nota_nf_notas WHERE status = 'aguardando') AS n,
        (SELECT COALESCE(SUM(i.quantidade), 0) FROM nota_nf_itens i JOIN nota_nf_notas n ON n.id = i.nota_id WHERE n.status = 'validada' AND i.incluido) AS q`);
      return `${r.n} NF(s) aguardando · ${fmtInt(r.q)} sacos de soja validados`;
    }
    const r = await db.get(`SELECT COUNT(*) FILTER (WHERE status = 'aguardando') AS a, COUNT(*) FILTER (WHERE status = 'validada') AS v,
      COUNT(*) FILTER (WHERE status = 'recusada') AS x FROM nota_nf_notas WHERE dono_id = ?`, user.id);
    return `${r.a} aguardando · ${r.v} validada(s)${r.x ? ` · ${r.x} recusada(s)` : ''}`;
  },

  async notificacoes({ db, user, isCentral, isSolicitante }) {
    const out = [];
    if (isCentral) {
      const r = await db.get("SELECT COUNT(*) AS n FROM nota_nf_notas WHERE status = 'aguardando'");
      out.push({ central: true, qtd: r.n, texto: 'NF(s) de soja para validar' });
    }
    if (isSolicitante) {
      const r = await db.get(`SELECT
        (SELECT COUNT(*) FROM nota_nf_notas n WHERE n.dono_id = ? AND n.status = 'recusada'
          AND NOT EXISTS (SELECT 1 FROM nota_nf_notas s WHERE s.substitui_id = n.id AND s.status <> 'rascunho')) AS recusadas,
        (SELECT COUNT(*) FROM nota_nf_notas WHERE dono_id = ? AND status = 'rascunho' AND substitui_id IS NULL) AS rascunhos`, user.id, user.id);
      out.push({ link: 'solicitante/minhas', qtd: r.recusadas, texto: 'NF(s) recusada(s) — envie outra foto' });
      out.push({ link: 'solicitante', qtd: r.rascunhos, texto: 'NF(s) ainda não enviada(s)' });
    }
    return out;
  },

  router(r, ctx) {
    const { db, requireRole, arquivos, ai, files, notify, limitar } = ctx;
    const sol = requireRole('solicitante');
    const cen = requireRole('central');
    const isCentral = (req) => ['central', 'ambos'].includes(req.moduleRole);

    function erro(res, err) {
      if (err instanceof RuleError) return res.status(err.status).json({ error: err.message });
      console.error('[nota_nf]', err);
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
    const getNota = async (t, id) => {
      const n = await t.get('SELECT * FROM nota_nf_notas WHERE id = ?', Number(id) || 0);
      if (!n) throw new RuleError('NF não encontrada', 404);
      return n;
    };
    const comTotais = (i) => ({ ...i, total_sementes: Math.round((i.quantidade || 0) * (i.sementes_por_unidade || 0)), viaveis: Math.round((i.quantidade || 0) * (i.sementes_por_unidade || 0) * (i.germinacao || 0) / 100) });
    /** Itens de várias NFs numa consulta: Map(id da nota → itens). */
    async function itensPorNota(t, notas) {
      const m = new Map(notas.map((n) => [n.id, []]));
      if (!notas.length) return m;
      for (const i of await t.all(`SELECT * FROM nota_nf_itens WHERE nota_id IN (${ids(notas.map((n) => n.id))}) ORDER BY nota_id, ordem, id`)) m.get(i.nota_id).push(comTotais(i));
      return m;
    }
    /** NFs prontas para a tela: itens, totais, alertas e (se completo) parecidas e histórico — tudo em poucas consultas. */
    async function notasView(t, notas, { completo = false } = {}) {
      if (!notas.length) return [];
      const [cfg, itens, dups] = await Promise.all([config(t), itensPorNota(t, notas), duplicadosDe(t, notas)]);
      const historico = completo ? await t.all(`SELECT * FROM nota_nf_historico WHERE nota_id IN (${ids(notas.map((n) => n.id))}) ORDER BY id DESC`) : [];
      return notas.map((n) => {
        const pot = potencial(itens.get(n.id), n, cfg);
        const its = itens.get(n.id).map((i, k) => ({ ...i, spu_efetivo: pot[k].spu, spu_origem: pot[k].origem, area_potencial: pot[k].area_potencial, volume_potencial: pot[k].volume_potencial }));
        const ch = chaveInfo(n.chave_acesso);
        return {
          ...n, ia_json: undefined,
          emitente_doc_fmt: fmtDoc(n.emitente_doc), produtor_doc_fmt: fmtDoc(n.produtor_doc),
          chave_ok: chaveValida(n.chave_acesso), chave_uf: ch?.uf || null,
          itens: its, totais: { ...totais(its), ...somaPotencial(pot) }, alertas: alertas(n, its, cfg, dups.get(n.id).length),
          duplicados: completo ? dups.get(n.id) : undefined,
          historico: completo ? historico.filter((x) => x.nota_id === n.id) : undefined,
        };
      });
    }
    const notaView = async (t, id, opts) => (await notasView(t, [await getNota(t, id)], opts))[0];

    async function gravarItens(t, notaId, itens, cfg, germGeral = null) {
      await t.run('DELETE FROM nota_nf_itens WHERE nota_id = ?', notaId);
      const lst = (itens || []).filter((i) => String(i.descricao || '').trim()).map((raw, k) => [k, classificarItem(raw, cfg, germGeral)]);
      if (!lst.length) return;
      await t.run(`INSERT INTO nota_nf_itens (nota_id, ordem, descricao, cultivar, unidade, quantidade, sementes_por_unidade, germinacao, germinacao_padrao, incluido, motivo_exclusao)
        VALUES ${lst.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
      ...lst.flatMap(([k, i]) => [notaId, k, i.descricao, i.cultivar, i.unidade, i.quantidade, i.sementes_por_unidade, i.germinacao, i.germinacao_padrao, i.incluido, i.motivo_exclusao]));
    }

    function lerCampos(b) {
      const out = {};
      for (const k of CAMPOS) {
        if (!(k in b)) continue;
        let v = b[k];
        if (['numero_nf', 'serie'].includes(k)) v = soDigitos(v).replace(/^0+/, '') || null;
        else if (['chave_acesso', 'emitente_doc', 'produtor_doc'].includes(k)) v = soDigitos(v) || null;
        else if (k === 'data_emissao') { if (v && !isDate(v)) throw new RuleError('Data de emissão inválida.'); v = v || null; }
        else if (k === 'uf') { v = String(v || '').toUpperCase(); if (v && !UFS.includes(v)) throw new RuleError('UF inválida.'); v = v || null; }
        else if (k === 'distrito') { v = String(v || '').trim(); if (v && !DISTRITOS.includes(v)) throw new RuleError('Distrito inválido.'); v = v || null; }
        else if (k === 'peso_liquido') v = parseNumero(v);
        else v = String(v ?? '').trim() || null;
        out[k] = v;
      }
      return out; // as chaves vêm só de CAMPOS (nomes de coluna fixos)
    }
    async function atualizar(t, n, b, { central = false } = {}) {
      const c = lerCampos(b);
      const mud = Object.keys(c).filter((k) => String(c[k] ?? '') !== String(n[k] ?? ''));
      if (mud.length) {
        await t.run(`UPDATE nota_nf_notas SET ${mud.map((k) => `${k} = ?`).join(', ')}${central ? ', editado_central = TRUE' : ''}, updated_at = now() WHERE id = ?`, ...mud.map((k) => c[k]), n.id);
      }
      if (Array.isArray(b.itens)) await gravarItens(t, n.id, b.itens, await config(t));
      return mud;
    }

    r.get('/config', ler(async () => ({ ...(await config(db)), ia: ai.status(), ufs: UFS, distritos: DISTRITOS })));

    // TODO(migração): os arquivos ainda ficam em disco local; passam para o Supabase Storage na etapa de arquivos.
    r.get('/arquivo/:id', async (req, res) => {
      try {
        const n = await db.get('SELECT codigo, mime, arquivo, dono_id FROM nota_nf_notas WHERE id = ?', Number(req.params.id) || 0);
        if (!n || (n.dono_id !== req.user.id && !isCentral(req))) return res.status(404).json({ error: 'Arquivo não encontrado' });
        res.setHeader('Content-Type', n.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="${n.codigo}${MIMES[n.mime] || ''}"`);
        await arquivos.enviar(res, n.arquivo);
      } catch (e) { erro(res, e); }
    });

    r.get('/notas/:id', ler(async (req) => {
      const n = await getNota(db, req.params.id);
      if (n.dono_id !== req.user.id && !isCentral(req)) throw new RuleError('NF não encontrada', 404);
      return (await notasView(db, [n], { completo: true }))[0];
    }));

    // ============================================================ SOLICITANTE
    r.post('/notas', sol, limitar({ nome: 'envio', max: 40 }), express.raw({ type: () => true, limit: MAX_UPLOAD }), async (req, res) => {
      let arquivo = null;
      try {
        const mime = String(req.headers['content-type'] || '').split(';')[0];
        if (!MIMES[mime]) throw new RuleError('Envie foto (JPG, PNG, WEBP) ou PDF da NF.');
        if (!req.body?.length) throw new RuleError('Arquivo vazio.');
        let substitui = null;
        if (req.query.substitui) {
          substitui = await getNota(db, req.query.substitui);
          if (substitui.dono_id !== req.user.id || substitui.status !== 'recusada') throw new RuleError('Só é possível substituir uma NF recusada sua.');
        }
        const hash = crypto.createHash('sha256').update(req.body).digest('hex');
        const hashOriginal = /^[a-f0-9]{64}$/.test(String(req.headers['x-hash-original'] || '')) ? req.headers['x-hash-original'] : null;
        arquivo = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${MIMES[mime]}`;
        await arquivos.salvar(arquivo, req.body, mime);

        const lido = await lerNF(ai, req.body, mime); // fora de transação

        const { id, descartados } = await db.tx(async (t) => {
          const velhas = substitui
            ? (await t.all("DELETE FROM nota_nf_notas WHERE substitui_id = ? AND status = 'rascunho' RETURNING arquivo", substitui.id)).map((x) => x.arquivo) : [];
          const x = await t.get(`INSERT INTO nota_nf_notas (dono_id, dono_nome, dono_email, substitui_id, arquivo, nome_original, mime, tamanho, hash, hash_original,
              ia_status, ia_json, ia_obs, numero_nf, serie, chave_acesso, emitente_nome, emitente_doc, produtor_nome, produtor_doc, data_emissao, municipio, uf, peso_liquido)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          req.user.id, req.user.name, req.user.email, substitui?.id ?? null, arquivo, path.basename(String(req.query.nome || 'nf')).slice(0, 200),
          mime, req.body.length, hash, hashOriginal, lido.ia_status, lido.ia_json ?? null, lido.ia_obs ?? null,
          lido.numero_nf ?? null, lido.serie ?? null, lido.chave_acesso ?? null, lido.emitente_nome ?? null, lido.emitente_doc ?? null,
          lido.produtor_nome ?? null, lido.produtor_doc ?? null, lido.data_emissao ?? null, lido.municipio ?? null, lido.uf ?? null, lido.peso_liquido ?? null);
          await t.run('UPDATE nota_nf_notas SET codigo = ? WHERE id = ?', codigoNota(x.id), x.id);
          if (lido.itens?.length) await gravarItens(t, x.id, lido.itens, await config(t), lido.germinacao_geral);
          if (substitui) await log(t, substitui.id, req.user, 'Nova foto enviada', `${codigoNota(x.id)} substitui ${substitui.codigo}`);
          return { id: x.id, descartados: velhas };
        });
        for (const a of descartados) arquivos.apagar(a);
        res.status(201).json(await notaView(db, id));
      } catch (err) {
        if (arquivo) arquivos.apagar(arquivo);
        erro(res, err);
      }
    });

    r.get('/rascunhos', sol, ler(async (req) => notasView(db,
      await db.all("SELECT * FROM nota_nf_notas WHERE dono_id = ? AND status = 'rascunho' AND substitui_id IS NULL ORDER BY id", req.user.id))));

    const meuRascunho = async (t, req, msg) => {
      const n = await getNota(t, req.params.id);
      if (n.dono_id !== req.user.id || n.status !== 'rascunho') throw new RuleError(msg);
      return n;
    };

    r.patch('/notas/:id', sol, h(async (req, t) => {
      const n = await meuRascunho(t, req, 'Esta NF não pode mais ser alterada.');
      await atualizar(t, n, req.body || {});
      return notaView(t, n.id);
    }));

    r.delete('/notas/:id', sol, h(async (req, t) => {
      const n = await meuRascunho(t, req, 'Esta NF não pode ser excluída.');
      await t.run('DELETE FROM nota_nf_notas WHERE id = ?', n.id);
      arquivos.apagar(n.arquivo);
    }));

    function validarEnvio(n, itens, { exigeDistrito = false } = {}) {
      if (!n.numero_nf) throw new RuleError(`${n.codigo}: informe o número da NF.`);
      if (!n.emitente_nome) throw new RuleError(`${n.codigo}: informe o emitente.`);
      if (!n.produtor_nome) throw new RuleError(`${n.codigo}: informe o produtor.`);
      if (!isDate(n.data_emissao)) throw new RuleError(`${n.codigo}: informe a data de emissão.`);
      if (exigeDistrito && !n.distrito) throw new RuleError(`${n.codigo}: escolha o distrito.`);
      const inc = itens.filter((i) => i.incluido);
      if (!inc.length) throw new RuleError(`${n.codigo}: nenhum item de semente de soja.`);
      if (inc.some((i) => !(i.quantidade > 0))) throw new RuleError(`${n.codigo}: há item de soja sem quantidade.`);
    }

    // Envia uma ou várias NFs (rascunho) para a central
    r.post('/enviar', sol, h(async (req, t) => {
      const sel = [...new Set((req.body?.notas || []).map(Number))];
      if (!sel.length) throw new RuleError('Adicione ao menos uma NF.');
      const notas = await t.all(`SELECT * FROM nota_nf_notas WHERE id IN (${ids(sel)}) ORDER BY id`);
      if (notas.length !== sel.length) throw new RuleError('NF não encontrada', 404);
      const itens = await itensPorNota(t, notas);
      for (const n of notas) {
        if (n.dono_id !== req.user.id || n.status !== 'rascunho') throw new RuleError('Uma das NFs não pode ser enviada.');
        validarEnvio(n, itens.get(n.id), { exigeDistrito: true });
      }
      await t.run(`UPDATE nota_nf_notas SET status = 'aguardando', enviado_at = now(), updated_at = now() WHERE id IN (${ids(sel)})`);
      const subst = notas.filter((n) => n.substitui_id).map((n) => n.substitui_id);
      if (subst.length) await t.run(`UPDATE nota_nf_notas SET status = 'substituida' WHERE id IN (${ids(subst)})`);
      await logs(t, req.user, notas.map((n) => [n.id, n.substitui_id ? 'NF reenviada' : 'NF enviada', `NF ${n.numero_nf} · ${n.produtor_nome}`]));
      return { enviadas: notas.length };
    }));

    r.get('/minhas', sol, ler(async (req) => {
      const notas = await notasView(db, await db.all("SELECT * FROM nota_nf_notas WHERE dono_id = ? AND status <> 'rascunho' ORDER BY COALESCE(enviado_at, created_at) DESC, id DESC", req.user.id));
      // a substituta (rascunho) de cada NF recusada, numa consulta só
      const subs = new Map((await db.all("SELECT substitui_id, MIN(id) AS id FROM nota_nf_notas WHERE dono_id = ? AND status = 'rascunho' AND substitui_id IS NOT NULL GROUP BY substitui_id", req.user.id))
        .map((x) => [x.substitui_id, x.id]));
      return notas.map((n) => ({ ...n, substituta: subs.get(n.id) ?? null }));
    }));

    r.post('/notas/:id/cancelar', sol, h(async (req, t) => {
      const n = await getNota(t, req.params.id);
      if (n.dono_id !== req.user.id || n.status !== 'aguardando') throw new RuleError('Só NFs aguardando a central podem ser canceladas.');
      await t.run("UPDATE nota_nf_notas SET status = 'cancelada', updated_at = now() WHERE id = ?", n.id);
      await log(t, n.id, req.user, 'NF cancelada pelo solicitante');
    }));

    // ============================================================ CENTRAL
    r.get('/central/notas', cen, ler(async () => notasView(db,
      await db.all(`SELECT * FROM nota_nf_notas WHERE ${NAO_RASCUNHO} ORDER BY COALESCE(enviado_at, created_at) DESC, id DESC`))));

    const emAnalise = async (t, id) => {
      const n = await getNota(t, id);
      if (!['aguardando', 'validada', 'recusada'].includes(n.status)) throw new RuleError('Esta NF não está em análise.');
      return n;
    };

    r.patch('/central/notas/:id', cen, h(async (req, t) => {
      const n = await emAnalise(t, req.params.id);
      const mud = await atualizar(t, n, req.body || {}, { central: true });
      const itensMudaram = Array.isArray(req.body?.itens);
      if (itensMudaram) await t.run('UPDATE nota_nf_notas SET editado_central = TRUE WHERE id = ?', n.id);
      await log(t, n.id, req.user, 'Dados editados pela central', [...mud, ...(itensMudaram ? ['itens'] : [])].join(', '));
      return notaView(t, n.id, { completo: true });
    }));

    const avisar = (t, n, assunto, corpo) => notify(n.dono_email, `Nota NF - ${n.codigo}: ${assunto}`, HTML(`Olá, ${esc(n.dono_nome)}.<br>${corpo}<br><br>QIMA HUB · Nota NF`), t);

    r.post('/central/notas/:id/validar', cen, h(async (req, t) => {
      const n = await emAnalise(t, req.params.id);
      validarEnvio(n, (await itensPorNota(t, [n])).get(n.id));
      await t.run("UPDATE nota_nf_notas SET status = 'validada', motivo_recusa = NULL, analisado_por = ?, analisado_at = now() WHERE id = ?", req.user.id, n.id);
      await log(t, n.id, req.user, 'NF validada');
      await avisar(t, n, 'validada', `A NF <b>${esc(n.numero_nf)}</b> (${esc(n.produtor_nome)}) foi validada pela central.`);
    }));

    r.post('/central/notas/:id/recusar', cen, h(async (req, t) => {
      const n = await emAnalise(t, req.params.id);
      const motivo = String(req.body?.motivo || '').trim();
      if (!motivo) throw new RuleError('Informe o motivo da recusa.');
      await t.run("UPDATE nota_nf_notas SET status = 'recusada', motivo_recusa = ?, analisado_por = ?, analisado_at = now() WHERE id = ?", motivo, req.user.id, n.id);
      await log(t, n.id, req.user, 'NF recusada', motivo);
      await avisar(t, n, 'recusada', `A NF <b>${esc(n.numero_nf || n.codigo)}</b> foi recusada: ${esc(motivo)}<br>Você pode enviar outra foto pelo QIMA HUB.`);
    }));

    r.post('/central/notas/:id/reabrir', cen, h(async (req, t) => {
      const n = await emAnalise(t, req.params.id);
      await t.run("UPDATE nota_nf_notas SET status = 'aguardando', motivo_recusa = NULL WHERE id = ?", n.id);
      await log(t, n.id, req.user, 'Voltou para análise');
    }));

    r.put('/central/notas/:id/obs', cen, h(async (req, t) => {
      const n = await getNota(t, req.params.id);
      const obs = String(req.body?.obs_central || '').trim() || null;
      await t.run('UPDATE nota_nf_notas SET obs_central = ?, updated_at = now() WHERE id = ?', obs, n.id);
      await log(t, n.id, req.user, 'Observação da central', obs || '(removida)');
    }));

    // Parâmetros do sistema (só os enviados são alterados). As faixas aceitas evitam erro de digitação.
    const FAIXAS = {
      germinacao_padrao: [1, 100, 'Germinação padrão'], espacamento_m: [0.1, 3, 'Espaçamento (m)'], sementes_por_metro: [1, 50, 'Sementes por metro'],
      produtividade_sc_ha: [1, 300, 'Produtividade (sc/ha)'], kg_por_saca: [1, 100, 'Kg por saca'], pms_g: [50, 600, 'Peso de mil sementes (g)'],
    };
    r.put('/central/config', cen, h(async (req, t) => {
      const b = req.body || {};
      const novos = [];
      for (const [k, [min, max, rotulo]] of Object.entries(FAIXAS)) {
        if (!(k in b)) continue;
        const v = Number(String(b[k]).replace(',', '.'));
        if (!(v >= min && v <= max)) throw new RuleError(`${rotulo}: informe um valor entre ${min} e ${max}.`);
        novos.push([k, String(v)]);
      }
      if (!novos.length) throw new RuleError('Nada para salvar.');
      for (const [k, v] of novos) await t.run('INSERT INTO nota_nf_config (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor', k, v);
      return { ...(await config(t)), padrao: PARAMETROS };
    }));

    // ------------------------------------------------------------ exportação (Excel + fotos)
    async function selecionar(q) {
      const st = String(q.status || '');
      const de = isDate(q.de) ? q.de : null;
      const ate = isDate(q.ate) ? q.ate : null;
      const sel = String(q.ids || '').split(',').map(Number).filter(Boolean);
      return (await db.all("SELECT * FROM nota_nf_notas WHERE status IN ('aguardando','validada','recusada') ORDER BY data_emissao, id"))
        .filter((n) => (!sel.length || sel.includes(n.id)) && (!st || n.status === st)
          && (!de || (n.data_emissao || '') >= de) && (!ate || (n.data_emissao || '') <= ate));
    }
    const COL_ITENS = [
      { label: 'ID NF', width: 11 }, { label: 'Arquivo', width: 22 }, { label: 'Status', width: 14 }, { label: 'Nº NF', width: 9 }, { label: 'Série', width: 6 },
      { label: 'Data emissão', width: 12, type: 'date' }, { label: 'Emitente', width: 32 }, { label: 'CNPJ emitente', width: 20 },
      { label: 'Produtor', width: 28 }, { label: 'CPF/CNPJ produtor', width: 20 }, { label: 'Município', width: 18 }, { label: 'UF', width: 5 },
      { label: 'Chave de acesso', width: 48 }, { label: 'Peso líquido NF (kg)', width: 14 }, { label: 'Descrição do produto', width: 50 },
      { label: 'Cultivar', width: 16 }, { label: 'Unidade', width: 8 }, { label: 'Quantidade', width: 11 }, { label: 'Sementes por unidade', width: 14 },
      { label: 'Germinação (%)', width: 12 }, { label: 'Germinação padrão?', width: 12 }, { label: 'Total de sementes', width: 16 }, { label: 'Sementes viáveis', width: 16 },
      { label: 'Enviado por', width: 22 }, { label: 'Enviado em', width: 12, type: 'date' },
    ];
    const COL_IGN = [{ label: 'ID NF', width: 11 }, { label: 'Nº NF', width: 9 }, { label: 'Produtor', width: 28 }, { label: 'Descrição', width: 50 }, { label: 'Unidade', width: 8 }, { label: 'Quantidade', width: 11 }, { label: 'Motivo', width: 24 }];

    async function planilha(notas) {
      const itens = await itensPorNota(db, notas);
      const rows = []; const ign = [];
      for (const n of notas) {
        for (const i of itens.get(n.id)) {
          if (i.incluido) {
            rows.push([n.codigo, `fotos/${nomeFoto(n)}`, STATUS_LABEL[n.status], n.numero_nf, n.serie, n.data_emissao, n.emitente_nome, fmtDoc(n.emitente_doc),
              n.produtor_nome, fmtDoc(n.produtor_doc), n.municipio, n.uf, n.chave_acesso, n.peso_liquido, i.descricao, i.cultivar, i.unidade, i.quantidade,
              i.sementes_por_unidade, i.germinacao, i.germinacao_padrao ? 'Sim' : 'Não', i.total_sementes, i.viaveis, n.dono_nome, (n.enviado_at || '').slice(0, 10)]);
          } else ign.push([n.codigo, n.numero_nf, n.produtor_nome, i.descricao, i.unidade, i.quantidade, i.motivo_exclusao]);
        }
      }
      return files.xlsx([await folhaPotencial(db, notas), { name: 'Itens de soja', columns: COL_ITENS, rows }, { name: 'Itens ignorados', columns: COL_IGN, rows: ign }]);
    }

    r.get('/central/exportar', cen, ler(async (req, res) => {
      const xlsx = await planilha(await selecionar(req.query));
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="notas-nf-soja-${hoje()}.xlsx"`);
      res.send(xlsx);
    }));

    r.get('/central/zip', cen, ler(async (req, res) => {
      const notas = await selecionar(req.query);
      if (!notas.length) throw new RuleError('Nenhuma NF selecionada.');
      const pasta = `notas-nf-${hoje()}`;
      const entradas = [{ name: `${pasta}/notas-nf-soja.xlsx`, data: await planilha(notas) }];
      const fotos = await arquivos.lerVarios(notas.map((n) => n.arquivo));
      notas.forEach((n, i) => { if (fotos[i]) entradas.push({ name: `${pasta}/fotos/${nomeFoto(n)}`, data: fotos[i] }); }); // arquivo ausente: segue sem ele
      await arquivos.entregarDownload(res, `${pasta}.zip`, files.zip(entradas));
    }));
  },
};
