// Backend do sistema Hospedagens (Viagens). Tudo deste sistema fica nesta pasta.
//
// Banco: Postgres (assíncrono). Dentro de uma transação (rotas com "h") use sempre o "t".
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import migrations from './migrations.js';
import relatorio from './relatorio.js';
import {
  RuleError, isDate, dias, brDate, lista, log, getPedido, getQuarto, salvarQuarto, enviarQuarto,
  checkout, cancelarHospede, prorrogar, quartoDoHospede, proximoCodigoQuarto, atualizarStatusAposEnvio,
  recalcDiariasDoHotel, recalcPedidoDatas, emailQuartos, TIPOS,
} from './rules.js';

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
const SOLIC_TIPOS = ['cancelar', 'prorrogar', 'checkout', 'editar'];
const EXTRATO_ST = ['Em Aberto', 'Pendente', 'Recebido - Parcial', 'Finalizado'];
const PAG_ST = ['Pendente', 'Em andamento', 'Pago'];
const MAX_UPLOAD = 15 * 1024 * 1024;
const HTML = (corpo) => `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px">${corpo}</div>`;

export default {
  banco: 'postgres',
  migrations,
  relatorio,

  async summary({ db, user, isCentral }) {
    const meu = isCentral ? '' : 'AND p.solicitante_id = ?';
    const args = isCentral ? [] : [user.id, user.id];
    const r = await db.get(`SELECT
      (SELECT COUNT(*) FROM hospedagens_pedidos p WHERE p.status IN ('pendente','ajustado') ${meu}) AS novos,
      (SELECT COUNT(*) FROM hospedagens_pedidos p WHERE p.status = 'em_andamento' ${meu}) AS andamento,
      (SELECT COUNT(*) FROM hospedagens_solicitacoes s ${isCentral ? '' : 'JOIN hospedagens_pedidos p ON p.id = s.pedido_id'}
        WHERE s.status = 'aberta' ${meu}) AS aj`, ...args, ...(isCentral ? [] : [user.id]));
    return `${r.novos} pedido(s) novo(s) · ${r.andamento} em andamento${r.aj ? ` · ${r.aj} ajuste(s) pendente(s)` : ''}`;
  },

  async notificacoes({ db, user, isCentral, isSolicitante }) {
    const out = [];
    if (isCentral) {
      const r = await db.get(`SELECT (SELECT COUNT(*) FROM hospedagens_pedidos WHERE status IN ('pendente','ajustado')) AS novos,
        (SELECT COUNT(*) FROM hospedagens_solicitacoes WHERE status = 'aberta') AS aj`);
      out.push({ central: true, qtd: r.novos, texto: 'pedido(s) de hospedagem novo(s) para montar' });
      out.push({ central: true, qtd: r.aj, texto: 'ajuste(s) pedido(s) pelos solicitantes' });
    }
    if (isSolicitante) {
      const r = await db.get(`SELECT (SELECT COUNT(*) FROM hospedagens_pedidos WHERE solicitante_id = ? AND status = 'rascunho') AS rascunhos,
        (SELECT COUNT(*) FROM hospedagens_solicitacoes s JOIN hospedagens_pedidos p ON p.id = s.pedido_id
          WHERE p.solicitante_id = ? AND s.status = 'recusada' AND s.resolvido_at >= now() - interval '7 days') AS recusados`, user.id, user.id);
      out.push({ link: 'solicitante', qtd: r.rascunhos, texto: 'rascunho(s) de hospedagem não enviado(s)' });
      out.push({ link: 'solicitante', qtd: r.recusados, texto: 'ajuste(s) de hospedagem não aprovado(s)' });
    }
    return out;
  },

  router(r, ctx) {
    const { db, requireRole, notify, filesDir } = ctx;
    const sol = requireRole('solicitante');
    const cen = requireRole('central');

    function erro(res, err) {
      if (err instanceof RuleError) return res.status(err.status).json({ error: err.message });
      console.error('[hospedagens]', err);
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

    // ------------------------------------------------------------ leitura (sempre em lote, sem consulta por linha)
    /** Quartos prontos para a tela: hotel, ocupantes e ajustes abertos de todos os quartos em 3 consultas. */
    async function quartosView(t, quartos) {
      if (!quartos.length) return [];
      const ids = lista(quartos.map((q) => q.id));
      const hoteis = new Map((await t.all(`SELECT id, nome, endereco, telefone FROM hospedagens_hoteis WHERE id IN (${lista(quartos.map((q) => q.hotel_id).filter(Boolean))})`)).map((x) => [x.id, x]));
      const occ = await t.all(`SELECT qh.quarto_id, h.id, h.nome, qh.slot, h.status FROM hospedagens_quarto_hospedes qh
        JOIN hospedagens_hospedes h ON h.id = qh.hospede_id WHERE qh.quarto_id IN (${ids}) ORDER BY qh.slot`);
      const abertas = new Map((await t.all(`SELECT quarto_id, COUNT(*) AS n FROM hospedagens_solicitacoes
        WHERE status = 'aberta' AND quarto_id IN (${ids}) GROUP BY quarto_id`)).map((x) => [x.quarto_id, x.n]));
      return quartos.map((q) => {
        const hotel = hoteis.get(q.hotel_id);
        const ocupantes = occ.filter((o) => o.quarto_id === q.id).map(({ quarto_id, ...o }) => o);
        const nd = dias(q.data_in, q.data_out);
        return {
          ...q,
          hotel_nome: hotel?.nome || '',
          hotel_endereco: hotel?.endereco || '',
          hotel_telefone: hotel?.telefone || '',
          ocupantes,
          tipo: TIPOS[ocupantes.length] || '—',
          dias: nd,
          total: nd * q.diaria,
          total_extra: nd * q.diaria + (q.fin_extra || 0),
          solicitacoes_abertas: abertas.get(q.id) || 0,
        };
      });
    }
    const quartoView = async (t, id) => (await quartosView(t, [await getQuarto(t, id)]))[0];

    /** Pedidos completos (quartos, hóspedes, ajustes e histórico) em 7 consultas, qualquer que seja a quantidade. */
    async function pedidosCompletos(t, pedidos) {
      if (!pedidos.length) return [];
      const ids = lista(pedidos.map((p) => p.id));
      const quartos = await quartosView(t, await t.all(`SELECT * FROM hospedagens_quartos WHERE pedido_id IN (${ids}) ORDER BY codigo, id`));
      const hospedes = await t.all(`SELECT * FROM hospedagens_hospedes WHERE pedido_id IN (${ids}) ORDER BY id`);
      const solicitacoes = await t.all(`
        SELECT s.*, hh.nome AS hospede_nome, q.codigo AS quarto_codigo FROM hospedagens_solicitacoes s
        LEFT JOIN hospedagens_hospedes hh ON hh.id = s.hospede_id
        LEFT JOIN hospedagens_quartos q ON q.id = s.quarto_id
        WHERE s.pedido_id IN (${ids}) ORDER BY (s.status = 'aberta') DESC, s.id DESC`);
      const historico = await t.all(`SELECT * FROM hospedagens_historico WHERE pedido_id IN (${ids}) ORDER BY id DESC`);
      return pedidos.map((p) => {
        const qs = quartos.filter((q) => q.pedido_id === p.id);
        return {
          ...p,
          quartos: qs,
          hospedes: hospedes.filter((x) => x.pedido_id === p.id).map((hh) => {
            const vivo = qs.find((q) => q.situacao !== 'finalizado' && q.ocupantes.some((o) => o.id === hh.id));
            const ultimo = [...qs].reverse().find((q) => q.ocupantes.some((o) => o.id === hh.id));
            return { ...hh, quarto_codigo: (vivo || ultimo)?.codigo || '', quarto_id: vivo?.id || null };
          }),
          solicitacoes: solicitacoes.filter((s) => s.pedido_id === p.id),
          historico: historico.filter((x) => x.pedido_id === p.id),
        };
      });
    }
    const pedidoCompleto = async (t, id) => (await pedidosCompletos(t, [await getPedido(t, id)]))[0];

    function assertDono(p, user) {
      if (p.solicitante_id !== user.id) throw new RuleError('Pedido não encontrado', 404);
    }
    const meu = async (t, req) => { const p = await getPedido(t, req.params.id); assertDono(p, req.user); return p; };

    // ------------------------------------------------------------ dados de apoio
    r.get('/opcoes', ler(async () => ({
      projetos: (await db.all('SELECT nome FROM hospedagens_projetos WHERE ativo ORDER BY id')).map((x) => x.nome),
      ufs: UFS,
      extratoStatus: EXTRATO_ST,
      pagamentoStatus: PAG_ST,
    })));

    r.get('/pessoas', ler((req) => {
      const q = `%${String(req.query.q || '').trim()}%`;
      return db.all(`
        SELECT id, nome, email, funcao, cidade FROM hospedagens_pessoas
        WHERE ativo AND (nome ILIKE ? OR COALESCE(email,'') ILIKE ? OR COALESCE(funcao,'') ILIKE ? OR COALESCE(cidade,'') ILIKE ?)
        ORDER BY nome LIMIT 50
      `, q, q, q, q);
    }));

    r.post('/pessoas', h(async (req, t) => {
      const nome = String(req.body?.nome || '').trim();
      if (!nome) throw new RuleError('Informe o nome');
      if (await t.get('SELECT 1 FROM hospedagens_pessoas WHERE lower(nome) = lower(?) AND ativo', nome)) throw new RuleError('Já existe uma pessoa com esse nome no banco.');
      const { email, funcao, cidade } = req.body;
      return t.get('INSERT INTO hospedagens_pessoas (nome, email, funcao, cidade) VALUES (?, ?, ?, ?) RETURNING id, nome, email, funcao, cidade',
        nome, email || null, funcao || null, cidade || null);
    }));

    // ============================================================ SOLICITANTE
    function validarPedido(b) {
      const cidade = String(b.cidade || '').trim();
      if (!cidade) throw new RuleError('Informe a cidade.');
      if (!UFS.includes(b.uf)) throw new RuleError('Informe o estado (UF).');
      if (!isDate(b.data_inicio) || !isDate(b.data_fim)) throw new RuleError('Informe check-in e check-out.');
      if (b.data_fim <= b.data_inicio) throw new RuleError('Check-out precisa ser depois do check-in.');
      const hospedes = Array.isArray(b.hospedes) ? b.hospedes : [];
      if (!hospedes.length) throw new RuleError('Anexe pelo menos uma pessoa.');
      const nomes = new Set();
      for (const x of hospedes) {
        const n = String(x.nome || '').trim().toLowerCase();
        if (!n) throw new RuleError('Hóspede sem nome.');
        if (nomes.has(n)) throw new RuleError(`${x.nome} está repetido na lista.`);
        nomes.add(n);
      }
      return { cidade, hospedes };
    }

    async function gravarHospedes(t, pedidoId, hospedes) {
      await t.run('DELETE FROM hospedagens_hospedes WHERE pedido_id = ?', pedidoId);
      await t.run(`INSERT INTO hospedagens_hospedes (pedido_id, pessoa_id, nome, email, tipo) VALUES ${hospedes.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
        ...hospedes.flatMap((x) => [pedidoId, Number(x.pessoa_id) || null, String(x.nome).trim(), x.email || null, x.tipo === 'open' ? 'open' : 'colaborador']));
    }

    r.get('/meus', sol, ler(async (req) => pedidosCompletos(db, await db.all('SELECT * FROM hospedagens_pedidos WHERE solicitante_id = ? ORDER BY id DESC', req.user.id))));

    r.post('/meus', sol, h(async (req, t) => {
      const b = req.body || {};
      const { cidade, hospedes } = validarPedido(b);
      const status = b.rascunho ? 'rascunho' : 'pendente';
      const { id } = await t.get(`
        INSERT INTO hospedagens_pedidos (solicitante_id, solicitante_nome, solicitante_email, cidade, uf, data_inicio, data_fim, projeto, garagem, obs, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
      `, req.user.id, req.user.name, req.user.email, cidade, b.uf, b.data_inicio, b.data_fim, b.projeto || null, b.garagem || 'sem', b.obs || null, status);
      const codigo = `VG-${String(id).padStart(4, '0')}`;
      await t.run('UPDATE hospedagens_pedidos SET codigo = ? WHERE id = ?', codigo, id);
      await gravarHospedes(t, id, hospedes);
      await log(t, id, req.user, status === 'rascunho' ? 'Rascunho salvo' : 'Pedido enviado', hospedes.map((x) => x.nome).join(', '));
      return { id, codigo };
    }));

    r.put('/meus/:id', sol, h(async (req, t) => {
      const p = await meu(t, req);
      if (!['rascunho', 'pendente', 'ajustado'].includes(p.status)) throw new RuleError('Este pedido já está com a central. Use os pedidos de ajuste por hóspede.');
      if (await t.get('SELECT 1 FROM hospedagens_quartos WHERE pedido_id = ? LIMIT 1', p.id)) throw new RuleError('A central já começou a montar os quartos. Use os pedidos de ajuste por hóspede.');
      const b = req.body || {};
      const { cidade, hospedes } = validarPedido(b);
      const status = b.rascunho ? 'rascunho' : p.status === 'rascunho' ? 'pendente' : 'ajustado';
      await t.run(`
        UPDATE hospedagens_pedidos SET cidade = ?, uf = ?, data_inicio = ?, data_fim = ?, projeto = ?, garagem = ?, obs = ?, status = ?, updated_at = now()
        WHERE id = ?
      `, cidade, b.uf, b.data_inicio, b.data_fim, b.projeto || null, b.garagem || 'sem', b.obs || null, status, p.id);
      await gravarHospedes(t, p.id, hospedes);
      await log(t, p.id, req.user, status === 'rascunho' ? 'Rascunho salvo' : status === 'pendente' ? 'Pedido enviado' : 'Pedido ajustado', hospedes.map((x) => x.nome).join(', '));
      return { id: p.id, codigo: p.codigo };
    }));

    r.delete('/meus/:id', sol, h(async (req, t) => {
      const p = await meu(t, req);
      if (p.status !== 'rascunho') throw new RuleError('Só rascunhos podem ser excluídos.');
      await t.run('DELETE FROM hospedagens_pedidos WHERE id = ?', p.id);
    }));

    r.post('/meus/:id/cancelar', sol, h(async (req, t) => {
      const p = await meu(t, req);
      if (['finalizado', 'cancelado'].includes(p.status)) throw new RuleError('Este pedido não pode ser cancelado.');
      if (!(await t.get('SELECT 1 FROM hospedagens_quartos WHERE pedido_id = ? AND enviado LIMIT 1', p.id))) {
        await t.run('DELETE FROM hospedagens_quartos WHERE pedido_id = ?', p.id);
        await t.run("UPDATE hospedagens_hospedes SET status = 'cancelado' WHERE pedido_id = ?", p.id);
        await t.run("UPDATE hospedagens_pedidos SET status = 'cancelado', updated_at = now() WHERE id = ?", p.id);
        await log(t, p.id, req.user, 'Pedido cancelado pelo solicitante');
        return { direto: true };
      }
      if (!(await t.get("SELECT 1 FROM hospedagens_solicitacoes WHERE pedido_id = ? AND tipo = 'cancelar_pedido' AND status = 'aberta'", p.id))) {
        await t.run("INSERT INTO hospedagens_solicitacoes (pedido_id, tipo, obs, criado_por) VALUES (?, 'cancelar_pedido', ?, ?)", p.id, req.body?.obs || null, req.user.id);
        await log(t, p.id, req.user, 'Pediu cancelamento do pedido');
      }
      return { direto: false };
    }));

    // Pedido de ajuste por hóspede
    r.post('/meus/:id/solicitacoes', sol, h(async (req, t) => {
      const p = await meu(t, req);
      if (['rascunho', 'finalizado', 'cancelado'].includes(p.status)) throw new RuleError('Este pedido não aceita ajustes.');
      const { hospede_id, tipo, data, obs } = req.body || {};
      if (!SOLIC_TIPOS.includes(tipo)) throw new RuleError('Tipo de ajuste inválido.');
      const hh = await t.get('SELECT id, nome, status FROM hospedagens_hospedes WHERE id = ? AND pedido_id = ?', Number(hospede_id) || 0, p.id);
      if (!hh) throw new RuleError('Hóspede não encontrado neste pedido.');
      if (hh.status !== 'ativo') throw new RuleError(`${hh.nome} já está com status ${hh.status}.`);
      if ((tipo === 'prorrogar' || tipo === 'checkout') && !isDate(data)) {
        throw new RuleError(tipo === 'checkout' ? 'Informe a data do check-out.' : 'Informe até quando quer prorrogar.');
      }
      if (tipo === 'editar' && !String(obs || '').trim()) throw new RuleError('Descreva o que precisa ser editado.');
      const q = await quartoDoHospede(t, hh.id);
      if ((tipo === 'prorrogar' || tipo === 'checkout') && !q) throw new RuleError(`${hh.nome} ainda não está em um quarto. Use "Editar" para pedir mudança de datas.`);
      if (q && tipo === 'prorrogar' && data <= q.data_in) throw new RuleError('A data precisa ser depois do check-in.');
      if (q && tipo === 'checkout' && data < q.data_in) throw new RuleError('A data é antes do check-in.');
      await t.run("UPDATE hospedagens_solicitacoes SET status = 'retirada' WHERE hospede_id = ? AND tipo = ? AND status = 'aberta'", hh.id, tipo);
      await t.run('INSERT INTO hospedagens_solicitacoes (pedido_id, quarto_id, hospede_id, tipo, data, obs, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)',
        p.id, q?.id ?? null, hh.id, tipo, isDate(data) ? data : null, obs || null, req.user.id);
      const rot = { cancelar: 'Cancelar', prorrogar: 'Prorrogar', checkout: 'Check-out', editar: 'Editar' }[tipo];
      await log(t, p.id, req.user, `Pediu ajuste: ${rot}`, `${hh.nome}${isDate(data) ? ` · ${brDate(data)}` : ''}${obs ? ` · ${obs}` : ''}`);
    }));

    r.delete('/meus/solicitacoes/:sid', sol, h(async (req, t) => {
      const s = await t.get('SELECT s.id, s.pedido_id, s.status, p.solicitante_id FROM hospedagens_solicitacoes s JOIN hospedagens_pedidos p ON p.id = s.pedido_id WHERE s.id = ?', Number(req.params.sid) || 0);
      if (!s || s.solicitante_id !== req.user.id) throw new RuleError('Ajuste não encontrado', 404);
      if (s.status !== 'aberta') throw new RuleError('Este ajuste já foi tratado pela central.');
      await t.run("UPDATE hospedagens_solicitacoes SET status = 'retirada' WHERE id = ?", s.id);
      await log(t, s.pedido_id, req.user, 'Retirou pedido de ajuste');
    }));

    // ============================================================ CENTRAL
    r.get('/central/pedidos', cen, ler(() => db.all(`
      SELECT p.*,
        (SELECT COUNT(*) FROM hospedagens_hospedes h WHERE h.pedido_id = p.id AND h.status <> 'cancelado') AS n_hospedes,
        (SELECT COUNT(DISTINCT qh.hospede_id) FROM hospedagens_quarto_hospedes qh JOIN hospedagens_quartos q ON q.id = qh.quarto_id
           JOIN hospedagens_hospedes h ON h.id = qh.hospede_id WHERE q.pedido_id = p.id AND h.status <> 'cancelado') AS n_alocados,
        (SELECT COUNT(*) FROM hospedagens_solicitacoes s WHERE s.pedido_id = p.id AND s.status = 'aberta') AS n_ajustes,
        (SELECT string_agg(h.nome, '|' ORDER BY h.id) FROM hospedagens_hospedes h WHERE h.pedido_id = p.id) AS colaboradores,
        (SELECT string_agg(DISTINCT ht.nome, ',') FROM hospedagens_quartos q JOIN hospedagens_hoteis ht ON ht.id = q.hotel_id WHERE q.pedido_id = p.id) AS hoteis
      FROM hospedagens_pedidos p WHERE p.status <> 'rascunho'
      ORDER BY p.id DESC
    `)));

    r.get('/central/pedidos/:id', cen, ler((req) => pedidoCompleto(db, req.params.id)));

    r.get('/pedidos/:id', sol, ler(async (req) => {
      const p = await pedidoCompleto(db, req.params.id);
      assertDono(p, req.user);
      return p;
    }));

    const pedidoAberto = async (t, id) => {
      const p = await getPedido(t, id);
      if (['finalizado', 'cancelado'].includes(p.status)) throw new RuleError('Pedido encerrado. Reabra para alterar.');
      return p;
    };

    r.post('/central/pedidos/:id/quartos', cen, h(async (req, t) => {
      const p = await pedidoAberto(t, req.params.id);
      const codigo = await proximoCodigoQuarto(t, p.id);
      const { id } = await t.get('INSERT INTO hospedagens_quartos (pedido_id, codigo, data_in, data_out) VALUES (?, ?, ?, ?) RETURNING id', p.id, codigo, p.data_inicio, p.data_fim);
      await log(t, p.id, req.user, 'Quarto criado', codigo);
      return { id, codigo };
    }));

    r.put('/central/quartos/:qid', cen, h(async (req, t) => {
      const q = await salvarQuarto(t, req.params.qid, req.body || {});
      const view = await quartoView(t, q.id);
      await log(t, q.pedido_id, req.user, 'Quarto salvo', `${q.codigo} · ${view.ocupantes.map((o) => o.nome).join(', ') || 'sem hóspedes'}`);
      return view;
    }));

    r.delete('/central/quartos/:qid', cen, h(async (req, t) => {
      const q = await getQuarto(t, req.params.qid);
      const anexos = await t.all('SELECT arquivo FROM hospedagens_anexos WHERE quarto_id = ?', q.id);
      await t.run('DELETE FROM hospedagens_quartos WHERE id = ?', q.id);
      await recalcPedidoDatas(t, q.pedido_id);
      await log(t, q.pedido_id, req.user, 'Quarto apagado', q.codigo);
      for (const a of anexos) fs.rm(path.join(filesDir, a.arquivo), { force: true }, () => {});
    }));

    /** E-mail ao solicitante com a situação atual dos quartos indicados. */
    async function enviarEmail(t, pedidoId, quartoIds, titulo) {
      const p = await getPedido(t, pedidoId);
      const quartos = await quartosView(t, await t.all(`SELECT * FROM hospedagens_quartos WHERE id IN (${lista(quartoIds)}) ORDER BY codigo, id`));
      const { subject, html } = emailQuartos(p, quartos, titulo);
      return notify(p.solicitante_email, subject, html, t);
    }

    r.post('/central/quartos/:qid/enviar', cen, h(async (req, t) => {
      const q = await enviarQuarto(t, req.params.qid);
      await atualizarStatusAposEnvio(t, q.pedido_id);
      const email = await enviarEmail(t, q.pedido_id, [q.id], 'Confirmação de Reserva');
      await log(t, q.pedido_id, req.user, 'Quarto enviado', q.codigo);
      return { email };
    }));

    const NAO_ENVIADO = "(NOT enviado OR situacao = 'alterado')";

    r.post('/central/pedidos/:id/enviar-tudo', cen, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      const pend = await t.all(`SELECT id FROM hospedagens_quartos WHERE pedido_id = ? AND ${NAO_ENVIADO}`, p.id);
      if (!pend.length) throw new RuleError('Não há quartos novos ou alterados para enviar.');
      for (const x of pend) await enviarQuarto(t, x.id);
      await atualizarStatusAposEnvio(t, p.id);
      const email = await enviarEmail(t, p.id, pend.map((x) => x.id), 'Confirmação de Reserva');
      await log(t, p.id, req.user, 'Quartos enviados', `${pend.length} quarto(s)`);
      return { enviados: pend.length, email };
    }));

    r.post('/central/pedidos/:id/finalizar', cen, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      const c = await t.get(`SELECT
        (SELECT COUNT(*) FROM hospedagens_solicitacoes WHERE pedido_id = ? AND status = 'aberta') AS ajustes,
        (SELECT COUNT(*) FROM hospedagens_quartos WHERE pedido_id = ? AND ${NAO_ENVIADO}) AS nao_enviados,
        (SELECT COUNT(*) FROM hospedagens_quartos WHERE pedido_id = ?) AS quartos`, p.id, p.id, p.id);
      if (c.ajustes) throw new RuleError('Há ajustes pendentes do solicitante. Trate-os antes de finalizar.');
      if (c.nao_enviados) throw new RuleError('Há quartos não enviados ao solicitante.');
      if (!c.quartos) throw new RuleError('O pedido não tem quartos.');
      await t.run("UPDATE hospedagens_pedidos SET status = 'finalizado', updated_at = now() WHERE id = ?", p.id);
      await log(t, p.id, req.user, 'Pedido finalizado');
    }));

    r.post('/central/pedidos/:id/reabrir', cen, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      if (p.status !== 'finalizado') throw new RuleError('Só pedidos finalizados podem ser reabertos.');
      await t.run("UPDATE hospedagens_pedidos SET status = 'em_andamento', updated_at = now() WHERE id = ?", p.id);
      await log(t, p.id, req.user, 'Pedido reaberto');
    }));

    r.post('/central/quartos/:qid/checkout', cen, h(async (req, t) => {
      const q = await getQuarto(t, req.params.qid);
      const { data, hospedes, todos } = req.body || {};
      const ids = todos ? (await t.all('SELECT hospede_id FROM hospedagens_quarto_hospedes WHERE quarto_id = ?', q.id)).map((o) => o.hospede_id) : (hospedes || []).map(Number);
      const out = await checkout(t, q.id, ids, data);
      await log(t, q.pedido_id, req.user, 'Check-out', `${q.codigo} · ${out.nomes} · ${brDate(data)}`);
      await enviarEmail(t, q.pedido_id, [q.id, ...(out.novoId ? [out.novoId] : [])], 'Confirmação de Alteração');
      return out;
    }));

    const ajusteAberto = async (t, id) => {
      const s = await t.get('SELECT * FROM hospedagens_solicitacoes WHERE id = ?', Number(id) || 0);
      if (!s || s.status !== 'aberta') throw new RuleError('Ajuste não encontrado ou já tratado.', 404);
      return s;
    };

    r.post('/central/solicitacoes/:sid/confirmar', cen, h(async (req, t) => {
      const s = await ajusteAberto(t, req.params.sid);
      const hh = s.hospede_id ? await t.get('SELECT nome FROM hospedagens_hospedes WHERE id = ?', s.hospede_id) : null;
      let msg = '';
      let titulo = 'Confirmação de Alteração';
      const afetados = [];
      if (s.tipo === 'cancelar_pedido') {
        await t.run('DELETE FROM hospedagens_quartos WHERE pedido_id = ? AND NOT enviado', s.pedido_id);
        await t.run("UPDATE hospedagens_quartos SET situacao = 'finalizado' WHERE pedido_id = ?", s.pedido_id);
        await t.run("UPDATE hospedagens_hospedes SET status = 'cancelado' WHERE pedido_id = ? AND status = 'ativo'", s.pedido_id);
        await t.run("UPDATE hospedagens_pedidos SET status = 'cancelado', updated_at = now() WHERE id = ?", s.pedido_id);
        await t.run("UPDATE hospedagens_solicitacoes SET status = 'confirmada', resolvido_por = ?, resolvido_at = now() WHERE pedido_id = ? AND status = 'aberta'", req.user.id, s.pedido_id);
        msg = 'Pedido cancelado';
      } else if (s.tipo === 'cancelar') {
        const out = await cancelarHospede(t, s.hospede_id);
        msg = `${out.nome} cancelado${out.removido ? ' · quarto removido' : ''}`;
      } else if (s.tipo === 'prorrogar' || s.tipo === 'checkout') {
        const q = await quartoDoHospede(t, s.hospede_id);
        if (!q) throw new RuleError('Hóspede não está em um quarto ativo.');
        if (s.tipo === 'prorrogar') {
          await prorrogar(t, q.id, s.data);
          afetados.push(q.id);
          titulo = 'Confirmação de Prorrogação';
          msg = `${hh.nome} · prorrogado até ${brDate(s.data)}`;
        } else {
          const out = await checkout(t, q.id, [s.hospede_id], s.data);
          afetados.push(q.id, ...(out.novoId ? [out.novoId] : []));
          msg = `${hh.nome} · check-out em ${brDate(s.data)}`;
        }
      } else {
        msg = `${hh?.nome || ''} · edição tratada`;
      }
      if (s.tipo !== 'cancelar_pedido') {
        await t.run("UPDATE hospedagens_solicitacoes SET status = 'confirmada', resposta = ?, resolvido_por = ?, resolvido_at = now() WHERE id = ?", req.body?.resposta || null, req.user.id, s.id);
      }
      await log(t, s.pedido_id, req.user, 'Ajuste confirmado', msg);
      if (afetados.length) await enviarEmail(t, s.pedido_id, afetados, titulo);
      else {
        const p = await getPedido(t, s.pedido_id);
        await notify(p.solicitante_email, `Hospedagem - Ajuste confirmado · ${p.codigo}`, HTML(`Pedido <b>${p.codigo}</b>: ${msg.replace(/</g, '&lt;')}.`), t);
      }
      return { mensagem: msg };
    }));

    r.post('/central/solicitacoes/:sid/recusar', cen, h(async (req, t) => {
      const s = await ajusteAberto(t, req.params.sid);
      const resposta = String(req.body?.resposta || '').trim();
      await t.run("UPDATE hospedagens_solicitacoes SET status = 'recusada', resposta = ?, resolvido_por = ?, resolvido_at = now() WHERE id = ?", resposta || null, req.user.id, s.id);
      const p = await getPedido(t, s.pedido_id);
      await log(t, p.id, req.user, 'Ajuste desconsiderado', resposta);
      await notify(p.solicitante_email, `Hospedagem - Ajuste não aprovado · ${p.codigo}`,
        HTML(`Pedido <b>${p.codigo}</b>: seu pedido de ajuste não foi aprovado.${resposta ? `<br>Motivo: ${resposta.replace(/</g, '&lt;')}` : ''}`), t);
    }));

    // ------------------------------------------------------------ hotéis
    function lerHotel(b) {
      const nome = String(b.nome || '').trim();
      const cidade = String(b.cidade || '').trim();
      if (!nome || !cidade) throw new RuleError('Nome e cidade do hotel são obrigatórios.');
      if (!UFS.includes(b.uf)) throw new RuleError('Informe a UF do hotel.');
      const num = (v) => Math.max(0, Number(String(v ?? '').replace(',', '.')) || 0);
      return [nome, cidade, b.uf, b.endereco || null, b.email || null, b.telefone || null,
        num(b.valor_s), num(b.valor_d), num(b.valor_t), num(b.valor_q), Math.round(num(b.quartos)),
        ['gratis', 'paga', 'nao'].includes(b.garagem) ? b.garagem : 'gratis',
        b.garagem === 'paga' ? num(b.garagem_valor) : null, b.obs || null];
    }

    r.get('/central/hoteis', cen, ler(() => db.all(`
      SELECT h.*, (SELECT COUNT(*) FROM hospedagens_quartos q WHERE q.hotel_id = h.id) AS usos
      FROM hospedagens_hoteis h WHERE h.ativo ORDER BY h.uf, h.cidade, h.nome
    `)));

    r.get('/central/hoteis/busca', cen, ler((req) => {
      const q = `%${String(req.query.q || '').trim()}%`;
      return db.all(`
        SELECT id, nome, cidade, uf, valor_s, valor_d, valor_t, valor_q FROM hospedagens_hoteis
        WHERE ativo AND (nome ILIKE ? OR cidade ILIKE ?)
        ORDER BY (cidade = ?) DESC, nome LIMIT 30
      `, q, q, String(req.query.cidade || ''));
    }));

    r.post('/central/hoteis', cen, h(async (req, t) => t.get(`INSERT INTO hospedagens_hoteis
      (nome, cidade, uf, endereco, email, telefone, valor_s, valor_d, valor_t, valor_q, quartos, garagem, garagem_valor, obs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, ...lerHotel(req.body || {}))));

    r.put('/central/hoteis/:id', cen, h(async (req, t) => {
      const v = lerHotel(req.body || {});
      const id = Number(req.params.id) || 0;
      const info = await t.run(`UPDATE hospedagens_hoteis SET nome = ?, cidade = ?, uf = ?, endereco = ?, email = ?, telefone = ?, valor_s = ?, valor_d = ?,
        valor_t = ?, valor_q = ?, quartos = ?, garagem = ?, garagem_valor = ?, obs = ?, updated_at = now() WHERE id = ?`, ...v, id);
      if (!info.rowCount) throw new RuleError('Hotel não encontrado', 404);
      // quartos ainda não finalizados herdam o novo valor (exceto diária manual)
      return { atualizados: await recalcDiariasDoHotel(t, id) };
    }));

    r.delete('/central/hoteis/:id', cen, h(async (req, t) => {
      await t.run('UPDATE hospedagens_hoteis SET ativo = FALSE, updated_at = now() WHERE id = ?', Number(req.params.id) || 0);
    }));

    // Colar do Excel: Nome | ... | UF | Cidade | ... | Contato | E-mail | Endereço (colunas 1,3,4,8,9,10)
    // ou formato simples: Nome | Cidade | UF | Endereço | E-mail | Telefone | Simples | Duplo | Triplo | Quádruplo
    r.post('/central/hoteis/importar', cen, h(async (req, t) => {
      const linhas = String(req.body?.texto || '').split(/\r?\n/).map((l) => l.split('\t').map((c) => c.trim())).filter((c) => c.some(Boolean));
      // hotéis já cadastrados lidos uma vez (não uma consulta por linha colada)
      const chave = (nome, cidade) => `${String(nome).toLowerCase()}|${String(cidade).toLowerCase()}`;
      const jaTem = new Set((await t.all('SELECT nome, cidade FROM hospedagens_hoteis WHERE ativo')).map((x) => chave(x.nome, x.cidade)));
      const num = (v) => Number(String(v || '').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
      const novos = []; let dup = 0; const erros = [];
      linhas.forEach((c, i) => {
        let row;
        if (c.length >= 10 && UFS.includes((c[2] || '').toUpperCase())) {
          row = [c[0], c[3], c[2].toUpperCase(), c[9], c[8], c[7], 0, 0, 0, 0];
        } else if (c.length >= 3 && UFS.includes((c[2] || '').toUpperCase())) {
          row = [c[0], c[1], c[2].toUpperCase(), c[3] || null, c[4] || null, c[5] || null, num(c[6]), num(c[7]), num(c[8]), num(c[9])];
        } else {
          if (i === 0 && /nome/i.test(c[0])) return; // cabeçalho
          erros.push(`Linha ${i + 1}: formato não reconhecido`);
          return;
        }
        if (!row[0] || !row[1]) { erros.push(`Linha ${i + 1}: sem nome ou cidade`); return; }
        if (jaTem.has(chave(row[0], row[1]))) { dup++; return; }
        jaTem.add(chave(row[0], row[1]));
        novos.push(row);
      });
      for (let i = 0; i < novos.length; i += 200) {
        const lote = novos.slice(i, i + 200);
        await t.run(`INSERT INTO hospedagens_hoteis (nome, cidade, uf, endereco, email, telefone, valor_s, valor_d, valor_t, valor_q)
          VALUES ${lote.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`, ...lote.flat());
      }
      return { importados: novos.length, duplicados: dup, erros };
    }));

    // ------------------------------------------------------------ financeiro
    r.get('/central/financeiro', cen, ler(async () => {
      const rows = await db.all(`
        SELECT q.*, p.codigo AS pedido_codigo, p.cidade, p.uf, p.projeto, p.solicitante_nome, p.status AS pedido_status,
               (SELECT COUNT(*) FROM hospedagens_anexos a WHERE a.quarto_id = q.id) AS n_anexos
        FROM hospedagens_quartos q JOIN hospedagens_pedidos p ON p.id = q.pedido_id
        WHERE p.status <> 'rascunho' ORDER BY q.data_in DESC NULLS LAST, p.id DESC, q.codigo
      `);
      return quartosView(db, rows);
    }));

    r.put('/central/quartos/:qid/financeiro', cen, h(async (req, t) => {
      const q = await getQuarto(t, req.params.qid);
      const b = req.body || {};
      const d = (v) => (isDate(v) ? v : null);
      const st = EXTRATO_ST.includes(b.fin_extrato_status) ? b.fin_extrato_status : 'Em Aberto';
      const parcial = st === 'Recebido - Parcial';
      if (parcial && d(b.fin_extrato_ini) && d(b.fin_extrato_fim) && b.fin_extrato_fim < b.fin_extrato_ini) {
        throw new RuleError('Extrato parcial: o fim não pode ser antes do início.');
      }
      await t.run(`UPDATE hospedagens_quartos SET fin_extra = ?, fin_extra_obs = ?, fin_extrato_id = ?, fin_extrato_status = ?, fin_extrato_ini = ?,
        fin_extrato_fim = ?, fin_dt_solicitacao = ?, fin_po = ?, fin_dt_abertura = ?, fin_dt_nf = ?, fin_nf = ?, fin_vencimento = ?,
        fin_status_pg = ?, fin_obs = ?, updated_at = now() WHERE id = ?`,
      Number(String(b.fin_extra ?? '0').replace(',', '.')) || 0, b.fin_extra_obs || null, b.fin_extrato_id || null, st,
      parcial ? d(b.fin_extrato_ini) : null, parcial ? d(b.fin_extrato_fim) : null, d(b.fin_dt_solicitacao), b.fin_po || null,
      d(b.fin_dt_abertura), d(b.fin_dt_nf), b.fin_nf || null, d(b.fin_vencimento),
      PAG_ST.includes(b.fin_status_pg) ? b.fin_status_pg : 'Pendente', b.fin_obs || null, q.id);
      await log(t, q.pedido_id, req.user, 'Financeiro atualizado', q.codigo);
      return quartoView(t, q.id);
    }));

    // ------------------------------------------------------------ anexos (PDF / imagem)
    // TODO(migração): os arquivos ainda ficam em disco local; passam para o Supabase Storage na etapa de arquivos.
    const OK_MIME = /^(application\/pdf|image\/(png|jpe?g|gif|webp|bmp))$/;

    r.get('/central/quartos/:qid/anexos', cen, ler((req) => db.all('SELECT id, nome, mime, tamanho, created_at FROM hospedagens_anexos WHERE quarto_id = ? ORDER BY id', Number(req.params.qid) || 0)));

    r.post('/central/quartos/:qid/anexos', cen, express.raw({ type: () => true, limit: MAX_UPLOAD }), async (req, res) => {
      let arquivo = null;
      try {
        const q = await getQuarto(db, req.params.qid);
        const nome = path.basename(String(req.query.nome || 'arquivo')).slice(0, 200);
        const mime = String(req.headers['content-type'] || '').split(';')[0];
        if (!OK_MIME.test(mime)) throw new RuleError('Envie PDF ou imagem.');
        if (!req.body?.length) throw new RuleError('Arquivo vazio.');
        arquivo = `${q.id}-${crypto.randomBytes(8).toString('hex')}${path.extname(nome).toLowerCase()}`;
        await fs.promises.writeFile(path.join(filesDir, arquivo), req.body);
        const x = await db.get('INSERT INTO hospedagens_anexos (quarto_id, nome, mime, arquivo, tamanho, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
          q.id, nome, mime, arquivo, req.body.length, req.user.id);
        res.status(201).json({ id: x.id, nome, mime, tamanho: req.body.length });
      } catch (e) {
        if (arquivo) fs.rm(path.join(filesDir, arquivo), { force: true }, () => {});
        erro(res, e);
      }
    });

    r.get('/central/anexos/:aid', cen, async (req, res) => {
      try {
        const a = await db.get('SELECT nome, mime, arquivo FROM hospedagens_anexos WHERE id = ?', Number(req.params.aid) || 0);
        if (!a) return res.status(404).json({ error: 'Anexo não encontrado' });
        res.setHeader('Content-Type', a.mime || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.nome)}`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.sendFile(path.join(filesDir, a.arquivo));
      } catch (e) { erro(res, e); }
    });

    r.delete('/central/anexos/:aid', cen, h(async (req, t) => {
      const a = await t.get('DELETE FROM hospedagens_anexos WHERE id = ? RETURNING arquivo', Number(req.params.aid) || 0);
      if (!a) throw new RuleError('Anexo não encontrado', 404);
      fs.rm(path.join(filesDir, a.arquivo), { force: true }, () => {});
    }));
  },
};
