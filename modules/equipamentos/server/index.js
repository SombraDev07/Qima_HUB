// Backend do sistema Equipamentos.
//  Operação (solicitante): pede equipamentos, acompanha, pede troca/devolução e troca o responsável.
//  Administrativo (central): cadastra o parque, reserva e envia os equipamentos de cada pedido,
//  vincula usuários, confirma devoluções e dá baixa.
//
// Banco: Postgres (assíncrono). Dentro de uma transação (rotas com "h") use sempre o "t".
import migrations from './migrations.js';
import relatorio from './relatorio.js';
import {
  RuleError, TIPOS, BASES, STATUS_EQ, STATUS_REQ, VALOR_MAX, isDate, hoje, txt, txtLivre, dataOuNula, esc, codigoSolicitacao,
  ids, lerCpf, lerItens, necessidades, tipoValido, baseValida,
} from './regras.js';

const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v ?? []);

// Solicitação com os itens e o nº de equipamentos já anexados, numa consulta só.
const SOLIC = `
  SELECT s.*,
    COALESCE((SELECT json_agg(json_build_object('tipo', i.tipo, 'qtd', i.qtd, 'motivo', i.motivo) ORDER BY i.id)
      FROM equipamentos_solicitacao_itens i WHERE i.solicitacao_id = s.id), '[]'::json) AS itens,
    (SELECT COUNT(*) FROM equipamentos_itens e WHERE e.solicitacao_id = s.id) AS anexados
  FROM equipamentos_solicitacoes s`;
const solic = (s) => ({ ...s, itens: json(s.itens), status_label: STATUS_REQ[s.status] || s.status, precisa: 0 });
const comNecessidade = (s) => { const x = solic(s); x.precisa = Object.values(necessidades(x.itens)).reduce((a, b) => a + b, 0); return x; };

const EQ_COLS = 'id, tipo, modelo, patrimonio, serie, status, base, data_compra, valor, colaborador, projeto, superior, inicio, fim, obs, solicitacao_id, solicitante_id';
const eq = (e) => ({ ...e, valor: Number(e.valor) || 0, status_label: STATUS_EQ[e.status] || e.status });

export default {
  banco: 'postgres',
  migrations,
  relatorio,

  async summary({ db, user, isCentral }) {
    if (isCentral) {
      const r = await db.get(`SELECT
        (SELECT COUNT(*) FROM equipamentos_solicitacoes WHERE status = 'enviado') AS abertas,
        (SELECT COUNT(*) FROM equipamentos_itens WHERE status = 'estoque') AS estoque,
        (SELECT COUNT(*) FROM equipamentos_itens WHERE status = 'devolucao_pendente') AS devolucoes`);
      return `${r.abertas} aguardando reserva · ${r.estoque} em estoque${r.devolucoes ? ` · ${r.devolucoes} devolução(ões)` : ''}`;
    }
    const r = await db.get(`SELECT COUNT(*) FILTER (WHERE status IN ('enviado','reservado')) AS andamento, COUNT(*) FILTER (WHERE status = 'em_uso') AS uso,
      COUNT(*) FILTER (WHERE status = 'rascunho') AS rasc FROM equipamentos_solicitacoes WHERE solicitante_id = ?`, user.id);
    return `${r.andamento} em andamento · ${r.uso} em uso${r.rasc ? ` · ${r.rasc} rascunho(s)` : ''}`;
  },

  async notificacoes({ db, user, isCentral, isSolicitante }) {
    const out = [];
    if (isCentral) {
      const r = await db.get(`SELECT (SELECT COUNT(*) FROM equipamentos_solicitacoes WHERE status = 'enviado') AS abertas,
        (SELECT COUNT(*) FROM equipamentos_itens WHERE status = 'devolucao_pendente') AS devolucoes`);
      out.push({ central: true, qtd: r.abertas, texto: 'solicitação(ões) aguardando reserva' });
      out.push({ central: true, qtd: r.devolucoes, texto: 'equipamento(s) com devolução pendente' });
    }
    if (isSolicitante) {
      const r = await db.get("SELECT COUNT(*) AS n FROM equipamentos_solicitacoes WHERE solicitante_id = ? AND status = 'rascunho'", user.id);
      out.push({ link: 'solicitante', qtd: r.n, texto: 'rascunho(s) esperando envio' });
    }
    return out;
  },

  router(r, ctx) {
    const { db, requireRole, notify, usuariosComPerfil } = ctx;
    const sol = requireRole('solicitante'); // a central também passa (cria os próprios pedidos)
    const cen = requireRole('central');

    function erro(res, err) {
      if (err instanceof RuleError) return res.status(err.status).json({ error: err.message, ...err.extra });
      console.error('[equipamentos]', err);
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

    // ------------------------------------------------------------ e-mails (caixa de saída)
    const mail = (corpo) => `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6">${corpo}</div>`;
    const paraCentral = async (t, assunto, corpo) => {
      for (const u of await usuariosComPerfil('central', t)) await notify(u.email, `QIMA Equipamentos · ${assunto}`, mail(corpo), t);
    };

    // ------------------------------------------------------------ utilidades
    const lista = (v) => ids(v).join(',') || '0'; // ids numéricos, seguros para IN (...)
    const historico = (t, idsEq, acao, detalhe, user) => (idsEq.length
      ? t.run(`INSERT INTO equipamentos_historico (equipamento_id, acao, detalhe, usuario_nome) SELECT id, ?, ?, ? FROM equipamentos_itens WHERE id IN (${lista(idsEq)})`,
        acao, detalhe || null, user?.name || 'Sistema')
      : null);

    /** Solicitações pendentes voltam a "enviado" ou "reservado" conforme os equipamentos anexados. */
    const reavaliar = (t, solIds) => (ids(solIds).length ? t.run(`
      UPDATE equipamentos_solicitacoes s SET updated_at = now(), status = CASE WHEN EXISTS (
        SELECT 1 FROM (SELECT tipo, SUM(qtd) AS n FROM equipamentos_solicitacao_itens WHERE solicitacao_id = s.id GROUP BY tipo) need
        WHERE need.n > (SELECT COUNT(*) FROM equipamentos_itens e WHERE e.solicitacao_id = s.id AND e.tipo = need.tipo)
      ) THEN 'enviado' ELSE 'reservado' END
      WHERE s.id IN (${lista(solIds)}) AND s.status IN ('enviado','reservado')`) : null);

    /** Solicitações em uso sem nenhum equipamento sobrando viram "devolvido". */
    const fecharDevolvidas = (t, solIds) => (ids(solIds).length ? t.run(`
      UPDATE equipamentos_solicitacoes s SET status = 'devolvido', updated_at = now()
      WHERE s.id IN (${lista(solIds)}) AND s.status IN ('em_uso','devolucao_pendente')
        AND NOT EXISTS (SELECT 1 FROM equipamentos_itens e WHERE e.solicitacao_id = s.id)`) : null);

    const getSolicitacao = async (t, id, lock = false) => {
      const s = await t.get(`${SOLIC} WHERE s.id = ?${lock ? ' FOR UPDATE OF s' : ''}`, Number(id) || 0);
      if (!s) throw new RuleError('Solicitação não encontrada', 404);
      return comNecessidade(s);
    };
    const minha = async (t, req, id, lock = false) => {
      const s = await getSolicitacao(t, id, lock);
      if (s.solicitante_id !== req.user.id) throw new RuleError('Solicitação não encontrada', 404);
      return s;
    };

    function lerPedido(b) {
      const projeto = txt(b.projeto, 80);
      if (!projeto) throw new RuleError('Informe o projeto.');
      if (!baseValida(b.base)) throw new RuleError('Escolha a base de entrega.');
      const retirada = dataOuNula(b.retirada), devolucao = dataOuNula(b.devolucao);
      if (retirada && devolucao && devolucao < retirada) throw new RuleError('A devolução não pode ser antes da retirada.');
      const nome = txt(b.colaborador, 120);
      return { projeto, base: b.base, retirada, devolucao, obs: txtLivre(b.obs, 500), colaborador: nome, cpf: lerCpf(b.cpf), itens: lerItens(b.itens) };
    }
    async function gravarItens(t, solId, itens) {
      await t.run('DELETE FROM equipamentos_solicitacao_itens WHERE solicitacao_id = ?', solId);
      for (const i of itens) await t.run('INSERT INTO equipamentos_solicitacao_itens (solicitacao_id, tipo, motivo, qtd) VALUES (?, ?, ?, ?)', solId, i.tipo, i.motivo, i.qtd);
    }
    async function criarRascunho(t, user, d, origemId = null) {
      const x = await t.get(`INSERT INTO equipamentos_solicitacoes (solicitante_id, solicitante_nome, solicitante_email, colaborador, cpf, projeto, base, retirada, devolucao, obs, origem_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, user.id, user.name, user.email, d.colaborador, d.cpf, d.projeto, d.base, d.retirada, d.devolucao, d.obs, origemId);
      await t.run('UPDATE equipamentos_solicitacoes SET codigo = ? WHERE id = ?', codigoSolicitacao(x.id), x.id);
      await gravarItens(t, x.id, d.itens);
      return x.id;
    }

    /** Dados do novo responsável (usado pela Operação e pela Central). */
    function lerResponsavel(b) {
      const nome = txt(b.nome, 120);
      if (!nome) throw new RuleError('Informe o responsável.');
      const inicio = dataOuNula(b.inicio) || hoje(), fim = dataOuNula(b.fim);
      if (fim && fim < inicio) throw new RuleError('A data de fim não pode ser antes do início.');
      return { nome, projeto: txt(b.projeto, 80), superior: txt(b.superior, 80), inicio, fim };
    }

    // ------------------------------------------------------------ configuração
    // Projetos = a mesma lista da Central de Viagens (Hospedagens)
    r.get('/config', ler(async () => ({
      tipos: TIPOS, bases: BASES, status_eq: STATUS_EQ, status_req: STATUS_REQ,
      projetos: (await db.all('SELECT nome FROM hospedagens_projetos WHERE ativo ORDER BY id')).map((x) => x.nome),
    })));

    // ============================================================ OPERAÇÃO (solicitante)
    r.get('/minhas', sol, ler(async (req) => (await db.all(`${SOLIC} WHERE s.solicitante_id = ? ORDER BY s.id DESC LIMIT 400`, req.user.id)).map(comNecessidade)));

    r.post('/solicitacoes', sol, h(async (req, t) => {
      const d = lerPedido(req.body || {});
      const id = await criarRascunho(t, req.user, d);
      return comNecessidade(await t.get(`${SOLIC} WHERE s.id = ?`, id));
    }));

    r.put('/solicitacoes/:id', sol, h(async (req, t) => {
      const s = await minha(t, req, req.params.id, true);
      if (s.status !== 'rascunho') throw new RuleError('Só dá para editar solicitações em rascunho.');
      const d = lerPedido(req.body || {});
      await t.run(`UPDATE equipamentos_solicitacoes SET colaborador = ?, cpf = ?, projeto = ?, base = ?, retirada = ?, devolucao = ?, obs = ?, updated_at = now() WHERE id = ?`,
        d.colaborador, d.cpf, d.projeto, d.base, d.retirada, d.devolucao, d.obs, s.id);
      await gravarItens(t, s.id, d.itens);
      return comNecessidade(await t.get(`${SOLIC} WHERE s.id = ?`, s.id));
    }));

    r.post('/solicitacoes/:id/excluir', sol, h(async (req, t) => {
      const s = await minha(t, req, req.params.id, true);
      if (s.status !== 'rascunho') throw new RuleError('Só dá para excluir rascunhos.');
      await t.run('DELETE FROM equipamentos_solicitacoes WHERE id = ?', s.id);
    }));

    // envia todos os rascunhos (ou só os ids informados) para o Administrativo
    r.post('/solicitacoes/enviar', sol, h(async (req, t) => {
      const so = ids(req.body?.ids);
      const rows = await t.all(`UPDATE equipamentos_solicitacoes SET status = 'enviado', enviado_at = now(), updated_at = now()
        WHERE solicitante_id = ? AND status = 'rascunho'${so.length ? ` AND id IN (${lista(so)})` : ''} RETURNING id, codigo, projeto, base`, req.user.id);
      if (!rows.length) throw new RuleError('Não há rascunhos para enviar.');
      const linhas = rows.map((x) => `<li><b>${esc(x.codigo)}</b> · ${esc(x.projeto)} · ${esc(x.base)}</li>`).join('');
      await paraCentral(t, `${rows.length} solicitação(ões) nova(s)`, `<p>${esc(req.user.name)} enviou ${rows.length} solicitação(ões) de equipamento:</p><ul>${linhas}</ul>`);
      return { enviadas: rows.length };
    }));

    // troca = cópia da solicitação como novo rascunho
    r.post('/solicitacoes/troca', sol, h(async (req, t) => {
      const so = ids(req.body?.ids);
      if (!so.length) throw new RuleError('Selecione as solicitações.');
      const origens = await t.all(`${SOLIC} WHERE s.solicitante_id = ? AND s.id IN (${lista(so)}) ORDER BY s.id`, req.user.id);
      if (!origens.length) throw new RuleError('Solicitação não encontrada', 404);
      for (const o of origens.map(comNecessidade)) {
        await criarRascunho(t, req.user, {
          colaborador: o.colaborador, cpf: o.cpf, projeto: o.projeto, base: o.base, retirada: hoje(), devolucao: o.devolucao,
          obs: `Troca da ${o.codigo}`, itens: o.itens.map((i) => ({ tipo: i.tipo, qtd: i.qtd, motivo: 'Troca' })),
        }, o.id);
      }
      return { criadas: origens.length };
    }));

    // troca o colaborador da solicitação (e dos equipamentos que já estão com ele)
    r.post('/solicitacoes/substituir', sol, h(async (req, t) => {
      const so = ids(req.body?.ids);
      const nome = txt(req.body?.nome, 120);
      if (!so.length) throw new RuleError('Selecione as solicitações.');
      if (!nome) throw new RuleError('Informe o novo colaborador.');
      const cpf = lerCpf(req.body?.cpf);
      const rows = await t.all(`UPDATE equipamentos_solicitacoes SET colaborador = ?, cpf = ?, updated_at = now()
        WHERE solicitante_id = ? AND status <> 'devolvido' AND id IN (${lista(so)}) RETURNING id`, nome, cpf, req.user.id);
      if (!rows.length) throw new RuleError('Solicitação não encontrada', 404);
      const afetados = await t.all(`UPDATE equipamentos_itens SET colaborador = ?, updated_at = now()
        WHERE solicitacao_id IN (${lista(rows.map((x) => x.id))}) AND status IN ('em_uso','devolucao_pendente') RETURNING id`, nome);
      await historico(t, afetados.map((x) => x.id), 'Responsável substituído', `Novo responsável: ${nome}`, req.user);
      return { alteradas: rows.length };
    }));

    r.post('/solicitacoes/devolver', sol, h(async (req, t) => {
      const so = ids(req.body?.ids);
      if (!so.length) throw new RuleError('Selecione as solicitações.');
      const rows = await t.all(`UPDATE equipamentos_solicitacoes SET status = 'devolucao_pendente', updated_at = now()
        WHERE solicitante_id = ? AND status = 'em_uso' AND id IN (${lista(so)}) RETURNING id, codigo`, req.user.id);
      if (!rows.length) throw new RuleError('Nenhuma das solicitações está em uso.');
      const afetados = await t.all(`UPDATE equipamentos_itens SET status = 'devolucao_pendente', updated_at = now()
        WHERE solicitacao_id IN (${lista(rows.map((x) => x.id))}) AND status = 'em_uso' RETURNING id`);
      await historico(t, afetados.map((x) => x.id), 'Devolução solicitada', `Pedida por ${req.user.name}`, req.user);
      await paraCentral(t, `Devolução pedida (${rows.length})`, `<p>${esc(req.user.name)} pediu a devolução de: ${rows.map((x) => `<b>${esc(x.codigo)}</b>`).join(', ')}.</p>`);
      return { devolucoes: rows.length };
    }));

    // ---- responsáveis: equipamentos que estão com pessoas, dos pedidos deste solicitante
    r.get('/responsaveis', sol, ler(async (req) => (await db.all(`SELECT ${EQ_COLS} FROM equipamentos_itens
      WHERE solicitante_id = ? AND status IN ('em_uso','devolucao_pendente') ORDER BY colaborador, tipo, id LIMIT 2000`, req.user.id)).map(eq)));

    const meusEquip = (t, req, so) => t.all(`SELECT ${EQ_COLS} FROM equipamentos_itens
      WHERE solicitante_id = ? AND status IN ('em_uso','devolucao_pendente') AND id IN (${lista(so)})`, req.user.id);

    r.post('/responsaveis/usuario', sol, h(async (req, t) => {
      const so = ids(req.body?.ids);
      if (!so.length) throw new RuleError('Selecione os equipamentos.');
      const d = lerResponsavel(req.body || {});
      const alvo = await meusEquip(t, req, so);
      if (!alvo.length) throw new RuleError('Equipamento não encontrado', 404);
      await t.run(`UPDATE equipamentos_itens SET colaborador = ?, projeto = COALESCE(?, projeto), superior = COALESCE(?, superior), inicio = ?, fim = ?, updated_at = now()
        WHERE id IN (${lista(alvo.map((x) => x.id))})`, d.nome, d.projeto, d.superior, d.inicio, d.fim);
      await historico(t, alvo.map((x) => x.id), 'Responsável substituído', `Novo responsável: ${d.nome}`, req.user);
      return { alterados: alvo.length };
    }));

    r.post('/responsaveis/devolver', sol, h(async (req, t) => {
      const so = ids(req.body?.ids);
      if (!so.length) throw new RuleError('Selecione os equipamentos.');
      const rows = await t.all(`UPDATE equipamentos_itens SET status = 'devolucao_pendente', updated_at = now()
        WHERE solicitante_id = ? AND status = 'em_uso' AND id IN (${lista(so)}) RETURNING id, solicitacao_id`, req.user.id);
      if (!rows.length) throw new RuleError('Nenhum equipamento em uso para devolver.');
      const sols = [...new Set(rows.map((x) => x.solicitacao_id).filter(Boolean))];
      if (sols.length) await t.run(`UPDATE equipamentos_solicitacoes SET status = 'devolucao_pendente', updated_at = now() WHERE status = 'em_uso' AND id IN (${lista(sols)})`);
      await historico(t, rows.map((x) => x.id), 'Devolução solicitada', `Pedida por ${req.user.name}`, req.user);
      await paraCentral(t, `Devolução pedida (${rows.length} equipamento(s))`, `<p>${esc(req.user.name)} pediu a devolução de ${rows.length} equipamento(s).</p>`);
      return { devolucoes: rows.length };
    }));

    // troca por pessoa: um rascunho por responsável, com os tipos que ele usa hoje
    r.post('/responsaveis/troca', sol, h(async (req, t) => {
      const so = ids(req.body?.ids);
      if (!so.length) throw new RuleError('Selecione os equipamentos.');
      const alvo = await meusEquip(t, req, so);
      if (!alvo.length) throw new RuleError('Equipamento não encontrado', 404);
      const grupos = new Map();
      for (const e of alvo) { const k = e.colaborador || ''; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); }
      for (const [nome, lst] of grupos) {
        const porTipo = {};
        lst.forEach((e) => { porTipo[e.tipo] = (porTipo[e.tipo] || 0) + 1; });
        await criarRascunho(t, req.user, {
          colaborador: nome || null, cpf: null, projeto: lst[0].projeto || 'Sem projeto', base: lst[0].base, retirada: hoje(), devolucao: lst[0].fim || null,
          obs: 'Troca de equipamentos', itens: Object.entries(porTipo).map(([tipo, qtd]) => ({ tipo, qtd, motivo: 'Troca' })),
        });
      }
      return { criadas: grupos.size };
    }));

    // ============================================================ ADMINISTRATIVO (central)
    r.get('/central/equipamentos', cen, ler(async () => (await db.all(`SELECT e.id, e.tipo, e.modelo, e.patrimonio, e.serie, e.status, e.base, e.data_compra, e.valor,
      e.colaborador, e.projeto, e.superior, e.inicio, e.fim, e.obs, e.solicitacao_id, e.solicitante_id, s.codigo AS solicitacao
      FROM equipamentos_itens e LEFT JOIN equipamentos_solicitacoes s ON s.id = e.solicitacao_id ORDER BY e.id DESC LIMIT 5000`)).map(eq)));

    function lerEquipamento(b) {
      const modelo = txt(b.modelo, 120), patrimonio = txt(b.patrimonio, 60);
      if (!tipoValido(b.tipo)) throw new RuleError('Escolha o tipo.');
      if (!baseValida(b.base)) throw new RuleError('Escolha a base.');
      if (!modelo) throw new RuleError('Informe o modelo.');
      if (!patrimonio) throw new RuleError('Informe o patrimônio.');
      const v = String(b.valor ?? '').trim();
      const valor = v ? Number(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v) : 0;
      if (!Number.isFinite(valor) || valor < 0 || valor > VALOR_MAX) throw new RuleError('Valor inválido.');
      if (b.data_compra && !isDate(b.data_compra)) throw new RuleError('Data de compra inválida.');
      return { tipo: b.tipo, base: b.base, modelo, patrimonio, serie: txt(b.serie, 80), data_compra: dataOuNula(b.data_compra), valor, obs: txtLivre(b.obs, 500) };
    }
    const patrimonioEmUso = async (t, patrimonio, exceto = 0) => !!(await t.get('SELECT 1 AS x FROM equipamentos_itens WHERE lower(patrimonio) = lower(?) AND id <> ?', patrimonio, exceto));

    r.post('/central/equipamentos', cen, h(async (req, t) => {
      const d = lerEquipamento(req.body || {});
      if (await patrimonioEmUso(t, d.patrimonio)) throw new RuleError('Patrimônio já cadastrado.', 409);
      const x = await t.get(`INSERT INTO equipamentos_itens (tipo, modelo, patrimonio, serie, base, data_compra, valor, obs) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        d.tipo, d.modelo, d.patrimonio, d.serie, d.base, d.data_compra, d.valor, d.obs);
      await historico(t, [x.id], 'Cadastrado', `Em estoque · ${d.base}`, req.user);
      return { id: x.id };
    }));

    r.put('/central/equipamentos/:id', cen, h(async (req, t) => {
      const id = Number(req.params.id) || 0;
      const atual = await t.get('SELECT id, tipo, status FROM equipamentos_itens WHERE id = ? FOR UPDATE', id);
      if (!atual) throw new RuleError('Equipamento não encontrado', 404);
      const d = lerEquipamento(req.body || {});
      if (d.tipo !== atual.tipo && atual.status !== 'estoque') throw new RuleError('O tipo só pode mudar com o equipamento em estoque.');
      if (await patrimonioEmUso(t, d.patrimonio, id)) throw new RuleError('Patrimônio já cadastrado.', 409);
      await t.run(`UPDATE equipamentos_itens SET tipo = ?, modelo = ?, patrimonio = ?, serie = ?, base = ?, data_compra = ?, valor = ?, obs = ?, updated_at = now() WHERE id = ?`,
        d.tipo, d.modelo, d.patrimonio, d.serie, d.base, d.data_compra, d.valor, d.obs, id);
      await historico(t, [id], 'Dados alterados', null, req.user);
    }));

    r.get('/central/equipamentos/:id/historico', cen, ler(async (req) => db.all(
      'SELECT id, acao, detalhe, usuario_nome, created_at FROM equipamentos_historico WHERE equipamento_id = ? ORDER BY id DESC LIMIT 300', Number(req.params.id) || 0)));

    // adicionar (só quem está em estoque) ou substituir (quem já tem usuário) o responsável
    r.post('/central/equipamentos/usuario', cen, h(async (req, t) => {
      const so = ids(req.body?.ids);
      if (!so.length) throw new RuleError('Selecione os equipamentos.');
      const d = lerResponsavel(req.body || {});
      const substituir = !!req.body?.substituir;
      const alvo = await t.all(`SELECT id FROM equipamentos_itens WHERE id IN (${lista(so)}) AND ${substituir ? "status IN ('em_uso','devolucao_pendente')" : "status = 'estoque'"} FOR UPDATE`);
      if (!alvo.length) throw new RuleError(substituir ? 'Nenhum dos equipamentos tem usuário para substituir.' : 'Selecione equipamentos em estoque (sem usuário).');
      await t.run(`UPDATE equipamentos_itens SET colaborador = ?, projeto = ?, superior = ?, inicio = ?, fim = ?, status = 'em_uso', updated_at = now()
        WHERE id IN (${lista(alvo.map((x) => x.id))})`, d.nome, d.projeto, d.superior, d.inicio, d.fim);
      await historico(t, alvo.map((x) => x.id), substituir ? 'Usuário substituído' : 'Usuário adicionado', `Responsável: ${d.nome}${d.projeto ? ` · ${d.projeto}` : ''}`, req.user);
      return { alterados: alvo.length, ignorados: so.length - alvo.length };
    }));

    // confirma a devolução: o equipamento volta para o estoque e o histórico fica
    async function devolverEquipamentos(t, so, user) {
      const alvo = await t.all(`SELECT id, solicitacao_id, colaborador FROM equipamentos_itens WHERE id IN (${lista(so)}) AND status IN ('em_uso','devolucao_pendente') FOR UPDATE`);
      if (!alvo.length) throw new RuleError('Nenhum equipamento com usuário selecionado.');
      const sols = [...new Set(alvo.map((x) => x.solicitacao_id).filter(Boolean))];
      await historico(t, alvo.map((x) => x.id), 'Devolução confirmada', 'Voltou para o estoque', user);
      await t.run(`UPDATE equipamentos_itens SET status = 'estoque', colaborador = NULL, projeto = NULL, superior = NULL, inicio = NULL, fim = NULL,
        solicitacao_id = NULL, solicitante_id = NULL, updated_at = now() WHERE id IN (${lista(alvo.map((x) => x.id))})`);
      await fecharDevolvidas(t, sols);
      return { devolvidos: alvo.length };
    }
    r.post('/central/equipamentos/devolucao', cen, h((req, t) => devolverEquipamentos(t, ids(req.body?.ids), req.user)));

    r.post('/central/equipamentos/baixa', cen, h(async (req, t) => {
      const so = ids(req.body?.ids);
      if (!so.length) throw new RuleError('Selecione os equipamentos.');
      const alvo = await t.all(`SELECT id, solicitacao_id, colaborador FROM equipamentos_itens WHERE id IN (${lista(so)}) AND status <> 'baixado' FOR UPDATE`);
      if (!alvo.length) throw new RuleError('Esses equipamentos já estão baixados.');
      const sols = [...new Set(alvo.map((x) => x.solicitacao_id).filter(Boolean))];
      await historico(t, alvo.map((x) => x.id), 'Baixa', alvo.some((x) => x.colaborador) ? 'Estava com usuário; vínculo encerrado' : null, req.user);
      await t.run(`UPDATE equipamentos_itens SET status = 'baixado', colaborador = NULL, projeto = NULL, superior = NULL, inicio = NULL, fim = NULL,
        solicitacao_id = NULL, solicitante_id = NULL, updated_at = now() WHERE id IN (${lista(alvo.map((x) => x.id))})`);
      await reavaliar(t, sols);
      await fecharDevolvidas(t, sols);
      return { baixados: alvo.length };
    }));

    r.post('/central/equipamentos/excluir', cen, h(async (req, t) => {
      const so = ids(req.body?.ids);
      if (!so.length) throw new RuleError('Selecione os equipamentos.');
      const alvo = await t.all(`SELECT id, patrimonio, status, solicitacao_id FROM equipamentos_itens WHERE id IN (${lista(so)}) FOR UPDATE`);
      const presos = alvo.filter((x) => ['reservado', 'em_uso', 'devolucao_pendente'].includes(x.status));
      if (presos.length) throw new RuleError(`Não dá para excluir equipamento reservado ou em uso (${presos.slice(0, 3).map((x) => x.patrimonio).join(', ')}). Confirme a devolução antes.`, 409);
      if (!alvo.length) throw new RuleError('Equipamento não encontrado', 404);
      await t.run(`DELETE FROM equipamentos_itens WHERE id IN (${lista(alvo.map((x) => x.id))})`);
      return { excluidos: alvo.length };
    }));

    // ---- solicitações recebidas
    r.get('/central/solicitacoes', cen, ler(async () => (await db.all(`${SOLIC} WHERE s.status <> 'rascunho' ORDER BY (s.status IN ('enviado','reservado')) DESC, s.id DESC LIMIT 500`)).map(comNecessidade)));

    async function detalhe(t, s) {
      const need = necessidades(s.itens);
      const tipos = Object.keys(need).filter(tipoValido);
      const anexados = await t.all('SELECT id, tipo, modelo, patrimonio, serie, base, status FROM equipamentos_itens WHERE solicitacao_id = ? ORDER BY id', s.id);
      const aberta = ['enviado', 'reservado'].includes(s.status);
      const livres = aberta && tipos.length
        ? await t.all(`SELECT id, tipo, modelo, patrimonio, serie, base FROM equipamentos_itens WHERE status = 'estoque' AND tipo IN (${tipos.map(() => '?').join(',')})
            ORDER BY (base = ?) DESC, modelo, patrimonio LIMIT 800`, ...tipos, s.base)
        : [];
      return {
        ...s,
        completo: tipos.every((tp) => anexados.filter((e) => e.tipo === tp).length >= need[tp]),
        blocos: tipos.map((tipo) => ({ tipo, qtd: need[tipo], anexados: anexados.filter((e) => e.tipo === tipo), livres: livres.filter((e) => e.tipo === tipo).slice(0, 150) })),
      };
    }
    r.get('/central/solicitacoes/:id', cen, ler(async (req) => detalhe(db, await getSolicitacao(db, req.params.id))));

    r.post('/central/solicitacoes/:id/anexar', cen, h(async (req, t) => {
      const s = await getSolicitacao(t, req.params.id, true);
      if (!['enviado', 'reservado'].includes(s.status)) throw new RuleError('Esta solicitação não recebe mais equipamentos.');
      const eqId = Number(req.body?.equipamento_id) || 0;
      const alvo = await t.get('SELECT id, tipo, patrimonio FROM equipamentos_itens WHERE id = ?', eqId);
      if (!alvo) throw new RuleError('Equipamento não encontrado', 404);
      const need = necessidades(s.itens)[alvo.tipo] || 0;
      if (!need) throw new RuleError(`Esta solicitação não pede ${alvo.tipo}.`);
      const ja = await t.get('SELECT COUNT(*) AS n FROM equipamentos_itens WHERE solicitacao_id = ? AND tipo = ?', s.id, alvo.tipo);
      if (ja.n >= need) throw new RuleError(`Já foram anexados todos os ${alvo.tipo} desta solicitação.`);
      const ok = await t.get(`UPDATE equipamentos_itens SET status = 'reservado', solicitacao_id = ?, solicitante_id = ?, updated_at = now()
        WHERE id = ? AND status = 'estoque' RETURNING id`, s.id, s.solicitante_id, eqId);
      if (!ok) throw new RuleError('Esse equipamento não está mais em estoque.', 409);
      await historico(t, [eqId], 'Reservado', `Para ${s.codigo}`, req.user);
      await reavaliar(t, [s.id]);
      return detalhe(t, await getSolicitacao(t, s.id));
    }));

    r.post('/central/solicitacoes/:id/desanexar', cen, h(async (req, t) => {
      const s = await getSolicitacao(t, req.params.id, true);
      if (!['enviado', 'reservado'].includes(s.status)) throw new RuleError('Esta solicitação já foi enviada.');
      const eqId = Number(req.body?.equipamento_id) || 0;
      const ok = await t.get(`UPDATE equipamentos_itens SET status = 'estoque', solicitacao_id = NULL, solicitante_id = NULL, updated_at = now()
        WHERE id = ? AND solicitacao_id = ? AND status = 'reservado' RETURNING id`, eqId, s.id);
      if (!ok) throw new RuleError('Equipamento não encontrado nesta solicitação.', 404);
      await historico(t, [eqId], 'Reserva desfeita', `Saiu de ${s.codigo}`, req.user);
      await reavaliar(t, [s.id]);
      return detalhe(t, await getSolicitacao(t, s.id));
    }));

    r.post('/central/solicitacoes/:id/enviar', cen, h(async (req, t) => {
      const s = await getSolicitacao(t, req.params.id, true);
      if (!['enviado', 'reservado'].includes(s.status)) throw new RuleError('Esta solicitação já foi enviada.');
      await reavaliar(t, [s.id]);
      const atual = await getSolicitacao(t, s.id);
      if (atual.status !== 'reservado') throw new RuleError('Anexe todos os equipamentos antes de enviar.');
      const enviados = await t.all(`UPDATE equipamentos_itens SET status = 'em_uso', colaborador = ?, projeto = ?, inicio = ?, fim = ?, updated_at = now()
        WHERE solicitacao_id = ? AND status = 'reservado' RETURNING id`, s.colaborador, s.projeto, hoje(), s.devolucao, s.id);
      await t.run("UPDATE equipamentos_solicitacoes SET status = 'em_uso', updated_at = now() WHERE id = ?", s.id);
      await historico(t, enviados.map((x) => x.id), 'Enviado ao colaborador', `${s.codigo}${s.colaborador ? ` · ${s.colaborador}` : ''}`, req.user);
      await notify(s.solicitante_email, `QIMA Equipamentos · ${s.codigo} enviada`,
        mail(`<p>Os equipamentos da solicitação <b>${esc(s.codigo)}</b> foram enviados${s.colaborador ? ` para <b>${esc(s.colaborador)}</b>` : ''}.</p>`), t);
      return { enviados: enviados.length };
    }));

    // confirma a devolução de todos os equipamentos de uma solicitação
    r.post('/central/solicitacoes/:id/devolucao', cen, h(async (req, t) => {
      const s = await getSolicitacao(t, req.params.id, true);
      const eqs = await t.all('SELECT id FROM equipamentos_itens WHERE solicitacao_id = ?', s.id);
      return devolverEquipamentos(t, eqs.map((x) => x.id), req.user);
    }));
  },
};
