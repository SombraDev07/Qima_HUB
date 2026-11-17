// Backend do sistema Contratação (pedidos de vaga, banco de pessoas, demissões).
//
// Banco: Postgres (assíncrono). Dentro de uma transação (rotas com "h") use sempre o "t".
import migrations from './migrations.js';
import relatorio from './relatorio.js';
import {
  RuleError, isDate, hoje, brDate, codigoPedido, UFS, STATUS, FECHADOS, AVISOS, JUSTIFICATIVAS,
  semanaISO, situacao, distritoDe, statusDe, statusPessoa, recalcPedido, log, bool, cpfValido, fmtCpf,
} from './regras.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ABERTOS = "status NOT IN ('rascunho','finalizado','cancelado','recusado')";
const HTML = (corpo) => `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6">${corpo}</div>`;
const esc = (s) => String(s ?? '').replace(/</g, '&lt;');

export default {
  banco: 'postgres',
  migrations,
  relatorio,

  async summary({ db, user, isCentral }) {
    if (isCentral) {
      const r = await db.get(`SELECT
        (SELECT COUNT(*) FROM contratacao_pedidos WHERE status = 'pendente') AS novos,
        (SELECT COALESCE(SUM(p.qtd - (SELECT COUNT(*) FROM contratacao_anexos a WHERE a.pedido_id = p.id)), 0) FROM contratacao_pedidos p WHERE ${ABERTOS}) AS abertas,
        (SELECT COUNT(*) FROM contratacao_demissoes WHERE status = 'pendente') AS dem`);
      return `${r.novos} pedido(s) novo(s) · ${Math.max(0, r.abertas)} vaga(s) em aberto${r.dem ? ` · ${r.dem} demissão(ões)` : ''}`;
    }
    const r = await db.get(`SELECT COUNT(*) FILTER (WHERE status = 'pendente') AS p, COUNT(*) FILTER (WHERE status IN ('em_recrutamento','parcial')) AS a,
      COUNT(*) FILTER (WHERE status = 'atendida') AS t FROM contratacao_pedidos WHERE solicitante_id = ?`, user.id);
    return `${r.p} pendente(s) · ${r.a} em recrutamento · ${r.t} atendida(s)`;
  },

  async notificacoes({ db, user, isCentral, isSolicitante }) {
    const out = [];
    if (isCentral) {
      const r = await db.get(`SELECT (SELECT COUNT(*) FROM contratacao_pedidos WHERE status = 'pendente') AS novos,
        (SELECT COUNT(*) FROM contratacao_demissoes WHERE status = 'pendente') AS dem`);
      out.push({ central: true, qtd: r.novos, texto: 'pedido(s) de vaga novo(s) para analisar' });
      out.push({ link: 'central/demissoes', qtd: r.dem, texto: 'pedido(s) de demissão aguardando o RH' });
    }
    if (isSolicitante) {
      const r = await db.get(`SELECT COUNT(*) FILTER (WHERE status = 'rascunho') AS rascunhos,
        COUNT(*) FILTER (WHERE status = 'recusado' AND updated_at >= now() - interval '7 days') AS recusados
        FROM contratacao_pedidos WHERE solicitante_id = ? AND status IN ('rascunho','recusado')`, user.id);
      out.push({ link: 'solicitante', qtd: r.rascunhos, texto: 'rascunho(s) de vaga não enviado(s)' });
      out.push({ link: 'solicitante', qtd: r.recusados, texto: 'pedido(s) de vaga recusado(s) pelo RH' });
    }
    return out;
  },

  router(r, ctx) {
    const { db, requireRole, notify, usuariosComPerfil, files } = ctx;
    const sol = requireRole('solicitante');
    const cen = requireRole('central');

    function erro(res, err) {
      if (err instanceof RuleError) return res.status(err.status).json({ error: err.message, ...err.extra });
      console.error('[contratacao]', err);
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

    // ------------------------------------------------------------ apoio
    const nomes = async (t, tabela) => (await t.all(`SELECT nome FROM ${tabela} WHERE ativo ORDER BY id`)).map((x) => x.nome);
    r.get('/config', ler(async () => ({
      projetos: await nomes(db, 'contratacao_projetos'), funcoes: await nomes(db, 'contratacao_funcoes'), ufs: UFS, status: STATUS, avisos: AVISOS, justificativas: JUSTIFICATIVAS,
      regioes: await db.all('SELECT cidade, uf, regiao FROM contratacao_regioes ORDER BY uf, cidade'),
    })));

    const getPedido = async (t, id) => {
      const p = await t.get('SELECT * FROM contratacao_pedidos WHERE id = ?', Number(id) || 0);
      if (!p) throw new RuleError('Pedido não encontrado', 404);
      return p;
    };
    /** Pedidos com as pessoas anexadas: uma consulta para todos os pedidos da lista (não uma por pedido). */
    const comAnexos = async (t, pedidos) => {
      const ids = pedidos.map((p) => Number(p.id));
      const anexos = ids.length ? await t.all(`
        SELECT a.id AS anexo_id, a.pedido_id AS do_pedido, a.data_vinc, b.*,
          (SELECT d.id FROM contratacao_demissoes d WHERE d.banco_id = b.id AND d.status = 'pendente' LIMIT 1) AS demissao_pendente
        FROM contratacao_anexos a JOIN contratacao_banco b ON b.id = a.banco_id WHERE a.pedido_id IN (${ids.join(',')}) ORDER BY b.nome`) : [];
      const porPedido = new Map(ids.map((id) => [id, []]));
      for (const { do_pedido, ...a } of anexos) porPedido.get(do_pedido).push(a);
      return pedidos.map((p) => {
        const lista = porPedido.get(p.id);
        return { ...p, qtd_atendida: lista.length, situacao: situacao(p), status_label: STATUS[p.status], anexos: lista };
      });
    };
    const pedidoView = async (t, id) => (await comAnexos(t, [await getPedido(t, id)]))[0];

    async function lerPedido(t, b) {
      const funcoes = await nomes(t, 'contratacao_funcoes');
      const projetos = await nomes(t, 'contratacao_projetos');
      const qtd = Math.round(Number(b.qtd));
      if (!(qtd > 0)) throw new RuleError('Informe a quantidade solicitada.');
      if (!isDate(b.data_desejada)) throw new RuleError('Informe a data de início.');
      if (!funcoes.includes(b.funcao)) throw new RuleError('Escolha a função.');
      if (b.projeto && !projetos.includes(b.projeto)) throw new RuleError('Projeto inválido.');
      const uf = UFS.includes(b.uf) ? b.uf : null;
      if (!uf) throw new RuleError('Informe a UF.');
      const cidade = String(b.cidade || '').trim() || null;
      return {
        projeto: b.projeto || projetos[0], funcao: b.funcao, cidade, uf, distrito: await distritoDe(t, cidade, uf), data_desejada: b.data_desejada,
        semana: semanaISO(b.data_desejada), qtd, cnh: bool(b.cnh), movel: bool(b.movel), experiencia: bool(b.experiencia),
        observacao: String(b.observacao || '').trim() || null,
      };
    }

    const paraCentral = async (t, assunto, corpo) => {
      for (const u of await usuariosComPerfil('central', t)) await notify(u.email, `QIMA Contratação · ${assunto}`, HTML(corpo), t);
    };
    const avisarCentral = (t, p) => paraCentral(t, `Novo pedido ${p.codigo}`, `<b>Novo pedido de vaga recebido</b><br><br>
      Pedido: ${p.codigo}<br>Solicitante: ${esc(p.solicitante_nome)}<br>Projeto: ${esc(p.projeto || '-')}<br>Função: ${esc(p.funcao)} · Quantidade: ${p.qtd}<br>
      Local: ${p.cidade ? `${esc(p.cidade)} - ` : ''}${p.uf} (${esc(p.distrito || '-')})<br>Início: ${brDate(p.data_desejada)} (semana ${p.semana})<br>
      Requisitos: ${[p.experiencia && 'experiência', p.cnh && 'CNH', p.movel ? 'móvel' : 'local'].filter(Boolean).join(', ')}<br>
      Observação: ${esc(p.observacao)}`);

    // ============================================================ SOLICITANTE
    r.get('/meus', sol, ler(async (req) => comAnexos(db, await db.all('SELECT * FROM contratacao_pedidos WHERE solicitante_id = ? ORDER BY id DESC', req.user.id))));

    r.post('/meus', sol, h(async (req, t) => {
      const b = req.body || {};
      const v = await lerPedido(t, b);
      const rascunho = !!b.rascunho;
      if (!rascunho && !v.observacao) throw new RuleError('Informe a observação.');
      const { id } = await t.get(`INSERT INTO contratacao_pedidos (solicitante_id, solicitante_nome, solicitante_email, projeto, funcao, cidade, uf, distrito,
        data_desejada, semana, qtd, cnh, movel, experiencia, observacao, status, enviado_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${rascunho ? 'NULL' : 'now()'}) RETURNING id`,
      req.user.id, req.user.name, req.user.email, v.projeto, v.funcao, v.cidade, v.uf, v.distrito, v.data_desejada, v.semana, v.qtd, v.cnh, v.movel,
      v.experiencia, v.observacao, rascunho ? 'rascunho' : 'pendente');
      await t.run('UPDATE contratacao_pedidos SET codigo = ? WHERE id = ?', codigoPedido(id), id);
      const p = await getPedido(t, id);
      await log(t, { pedidoId: id }, req.user, rascunho ? 'Rascunho salvo' : 'Pedido enviado', `${v.projeto} · S${v.semana} · ${v.distrito} · ${v.cidade || ''} · ${v.funcao} · ${v.qtd}`);
      if (!rascunho) await avisarCentral(t, p);
      return { id, codigo: p.codigo };
    }));

    const meu = async (t, req) => {
      const p = await getPedido(t, req.params.id);
      if (p.solicitante_id !== req.user.id) throw new RuleError('Pedido não encontrado', 404);
      return p;
    };

    r.put('/meus/:id', sol, h(async (req, t) => {
      const p = await meu(t, req);
      if (p.status !== 'rascunho') throw new RuleError('Só rascunhos podem ser editados.');
      const b = req.body || {};
      const v = await lerPedido(t, b);
      const enviar = !b.rascunho;
      if (enviar && !v.observacao) throw new RuleError('Informe a observação.');
      await t.run(`UPDATE contratacao_pedidos SET projeto = ?, funcao = ?, cidade = ?, uf = ?, distrito = ?, data_desejada = ?, semana = ?, qtd = ?, cnh = ?,
        movel = ?, experiencia = ?, observacao = ?, status = ?, enviado_at = ${enviar ? 'now()' : 'enviado_at'}, updated_at = now() WHERE id = ?`,
      v.projeto, v.funcao, v.cidade, v.uf, v.distrito, v.data_desejada, v.semana, v.qtd, v.cnh, v.movel, v.experiencia, v.observacao,
      enviar ? 'pendente' : 'rascunho', p.id);
      await log(t, { pedidoId: p.id }, req.user, enviar ? 'Enviado do rascunho' : 'Rascunho salvo', `${v.funcao} · ${v.qtd}`);
      if (enviar) await avisarCentral(t, await getPedido(t, p.id));
      return { id: p.id, codigo: p.codigo };
    }));

    r.post('/meus/:id/cancelar', sol, h(async (req, t) => {
      const p = await meu(t, req);
      if (p.status !== 'pendente') throw new RuleError('Só pedidos Pendentes podem ser cancelados.');
      await t.run("UPDATE contratacao_pedidos SET status = 'cancelado', updated_at = now() WHERE id = ?", p.id);
      await log(t, { pedidoId: p.id }, req.user, 'Cancelamento', `Pedido ${p.codigo} cancelado pelo solicitante`);
    }));

    r.delete('/meus/:id', sol, h(async (req, t) => {
      const p = await meu(t, req);
      if (!['rascunho', 'cancelado'].includes(p.status)) throw new RuleError('Só rascunhos e pedidos cancelados podem ser excluídos.');
      await t.run('DELETE FROM contratacao_pedidos WHERE id = ?', p.id);
    }));

    r.post('/anexos/:anexoId/demissao', sol, h(async (req, t) => {
      const ax = await t.get(`SELECT a.pedido_id, a.banco_id, p.solicitante_id, p.projeto, p.codigo, b.nome, b.email FROM contratacao_anexos a
        JOIN contratacao_pedidos p ON p.id = a.pedido_id JOIN contratacao_banco b ON b.id = a.banco_id WHERE a.id = ?`, Number(req.params.anexoId) || 0);
      if (!ax || (ax.solicitante_id !== req.user.id && !['central', 'ambos'].includes(req.moduleRole))) throw new RuleError('Colaborador não encontrado', 404);
      if (await t.get("SELECT 1 FROM contratacao_demissoes WHERE banco_id = ? AND status = 'pendente'", ax.banco_id)) throw new RuleError('Já existe um pedido de demissão em análise.');
      const b = req.body || {};
      if (!b.confirmado) throw new RuleError('Confirme que este é o colaborador do desligamento.');
      if (!String(b.gestor || '').trim()) throw new RuleError('Informe o gestor responsável.');
      if (!AVISOS.includes(b.aviso)) throw new RuleError('Informe a modalidade do aviso prévio.');
      if (!JUSTIFICATIVAS.includes(b.justificativa)) throw new RuleError('Informe a justificativa do desligamento.');
      if (b.data_prevista && !isDate(b.data_prevista)) throw new RuleError('Data prevista inválida.');
      if (b.ultimo_dia && !isDate(b.ultimo_dia)) throw new RuleError('Último dia inválido.');
      const tipo = b.tipo === 'colaborador' ? 'colaborador' : 'empresa';
      await t.run(`INSERT INTO contratacao_demissoes (banco_id, pedido_id, nome, email, projeto, tipo, gestor, solicitante_id, solicitante_email, data_prevista, ultimo_dia, aviso, justificativa, obs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ax.banco_id, ax.pedido_id, ax.nome, ax.email, ax.projeto, tipo, String(b.gestor).trim(), req.user.id, req.user.email,
      b.data_prevista || null, b.ultimo_dia || null, b.aviso, b.justificativa, String(b.obs || '').trim() || null);
      await log(t, { pedidoId: ax.pedido_id, bancoId: ax.banco_id }, req.user, 'Pedido de demissão',
        `${ax.nome} · ${tipo === 'colaborador' ? 'Pedido do colaborador' : 'Iniciativa da empresa'} · ${b.justificativa} · aviso ${b.aviso}`);
      await paraCentral(t, `Pedido de demissão · ${ax.nome}`,
        `Pedido de demissão de <b>${esc(ax.nome)}</b> (vaga ${ax.codigo}).<br>Gestor: ${esc(b.gestor)}<br>Justificativa: ${b.justificativa} · Aviso: ${b.aviso}`);
    }));

    // ============================================================ CENTRAL — vagas
    r.get('/central/pedidos', cen, ler(async () => comAnexos(db, await db.all("SELECT * FROM contratacao_pedidos WHERE status <> 'rascunho' ORDER BY id DESC"))));

    r.get('/central/pedidos/:id', cen, ler(async (req) => {
      const p = await pedidoView(db, req.params.id);
      return { ...p, historico: await db.all('SELECT id, user_nome, acao, detalhe, created_at FROM contratacao_historico WHERE pedido_id = ? ORDER BY id DESC', p.id) };
    }));

    r.put('/central/pedidos/:id/status', cen, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      const st = req.body?.status;
      if (!STATUS[st] || st === 'rascunho') throw new RuleError('Status inválido.');
      await t.run('UPDATE contratacao_pedidos SET status = ?, updated_at = now() WHERE id = ?', st, p.id);
      if (!FECHADOS.includes(st) && st !== 'pendente') await recalcPedido(t, p.id);
      await log(t, { pedidoId: p.id }, req.user, 'Status', `${p.codigo} · ${STATUS[st]}`);
      if (['recusado', 'cancelado'].includes(st)) {
        await notify(p.solicitante_email, `QIMA Contratação · ${p.codigo} ${STATUS[st].toLowerCase()}`,
          HTML(`O pedido de vaga <b>${p.codigo}</b> foi marcado como <b>${STATUS[st]}</b> pelo RH.`), t);
      }
      return pedidoView(t, p.id);
    }));

    r.post('/central/pedidos/:id/finalizar', cen, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      if (FECHADOS.includes(p.status)) throw new RuleError('Este pedido já está encerrado.');
      await t.run("UPDATE contratacao_pedidos SET status = 'finalizado', updated_at = now() WHERE id = ?", p.id);
      await log(t, { pedidoId: p.id }, req.user, 'Fechado', `Finalizou a chamada ${p.codigo}`);
    }));

    r.delete('/central/pedidos/:id', cen, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      if (!['cancelado', 'recusado'].includes(p.status)) throw new RuleError('Só pedidos cancelados ou recusados podem ser excluídos.');
      await t.run('DELETE FROM contratacao_pedidos WHERE id = ?', p.id);
      await log(t, {}, req.user, 'Pedido excluído', p.codigo);
    }));

    // Anexar pessoas da base à vaga. Se passar da quantidade, pede confirmação (forcar).
    r.post('/central/pedidos/:id/anexar', cen, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      if (FECHADOS.includes(p.status) || p.status === 'rascunho') throw new RuleError('Esta vaga não aceita anexo.');
      const ids = [...new Set((req.body?.pessoas || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
      if (!ids.length) throw new RuleError('Marque as pessoas para anexar.');
      // as pessoas marcadas e se já estão em alguma vaga, numa consulta só
      const pessoas = await t.all(`SELECT b.id, b.nome, b.demitido, b.contratado, EXISTS (SELECT 1 FROM contratacao_anexos a WHERE a.banco_id = b.id) AS anexada
        FROM contratacao_banco b WHERE b.id IN (${ids.join(',')})`);
      if (pessoas.length !== ids.length) throw new RuleError('Pessoa não encontrada.');
      for (const b of pessoas) {
        const st = statusDe(b, b.anexada);
        if (st === 'demitido') throw new RuleError(`${b.nome} está Demitido(a).`);
        if (st === 'anexado') throw new RuleError(`${b.nome} já está anexado(a) em outra vaga.`);
      }
      const { n: atual } = await t.get('SELECT COUNT(*) AS n FROM contratacao_anexos WHERE pedido_id = ?', p.id);
      if (atual + ids.length > p.qtd && !req.body?.forcar) {
        throw new RuleError(`A vaga pede ${p.qtd} e já tem ${atual}. Anexar ${ids.length} passa da quantidade.`, 409, { excede: true });
      }
      await t.run(`INSERT INTO contratacao_anexos (pedido_id, banco_id) VALUES ${ids.map(() => '(?, ?)').join(', ')}`, ...ids.flatMap((bid) => [p.id, bid]));
      await recalcPedido(t, p.id);
      const nomesAnexados = ids.map((id) => pessoas.find((b) => b.id === id).nome);
      await log(t, { pedidoId: p.id }, req.user, 'Anexo', `Anexou ${nomesAnexados.join(', ')}${atual + ids.length > p.qtd ? ' (acima da quantidade)' : ''}`);
      return pedidoView(t, p.id);
    }));

    r.delete('/central/anexos/:id', cen, h(async (req, t) => {
      const a = await t.get('SELECT a.id, a.pedido_id, a.banco_id, b.nome FROM contratacao_anexos a JOIN contratacao_banco b ON b.id = a.banco_id WHERE a.id = ?', Number(req.params.id) || 0);
      if (!a) throw new RuleError('Anexo não encontrado', 404);
      await t.run('DELETE FROM contratacao_anexos WHERE id = ?', a.id);
      await recalcPedido(t, a.pedido_id);
      await log(t, { pedidoId: a.pedido_id, bancoId: a.banco_id }, req.user, 'Removeu anexo', a.nome);
    }));

    // ============================================================ CENTRAL — banco de pessoas
    // Pessoas com a vaga em que estão anexadas, numa consulta só.
    const PESSOAS = `SELECT DISTINCT ON (b.nome, b.id) b.*, a.id AS vaga_anexo_id, p.id AS vaga_pedido_id, p.codigo AS vaga_codigo
      FROM contratacao_banco b LEFT JOIN contratacao_anexos a ON a.banco_id = b.id LEFT JOIN contratacao_pedidos p ON p.id = a.pedido_id`;
    const pessoaView = ({ vaga_anexo_id, vaga_pedido_id, vaga_codigo, ...b }) => ({
      ...b, status: statusDe(b, !!vaga_anexo_id), vaga: vaga_anexo_id ? { anexo_id: vaga_anexo_id, pedido_id: vaga_pedido_id, codigo: vaga_codigo } : null,
    });
    const pessoas = async (t) => (await t.all(`${PESSOAS} ORDER BY b.nome, b.id`)).map(pessoaView);

    r.get('/central/banco', cen, ler(() => pessoas(db)));

    async function lerPessoa(t, b, { parcial = false } = {}) {
      const out = {};
      const set = (k, v) => { if (!parcial || k in b) out[k] = v; };
      const nome = String(b.nome ?? '').trim();
      if (!parcial || 'nome' in b) { if (!nome) throw new RuleError('Informe o nome.'); out.nome = nome; }
      if (!parcial || 'email' in b) {
        const email = String(b.email ?? '').trim().toLowerCase();
        if (email && !EMAIL_RE.test(email)) throw new RuleError('E-mail inválido.');
        out.email = email || null;
      }
      if ('nascimento' in b && b.nascimento && !isDate(b.nascimento)) throw new RuleError('Data de nascimento inválida.');
      if (!parcial || 'cpf' in b) {
        const cpf = String(b.cpf ?? '').replace(/\D/g, '');
        if (cpf && cpf.length !== 11) throw new RuleError('O CPF deve ter 11 dígitos.');
        if (cpf && !cpfValido(cpf)) throw new RuleError('CPF inválido — confira os números.');
        out.cpf = cpf || null;
      }
      set('nascimento', b.nascimento || null);
      set('telefone', String(b.telefone ?? '').trim() || null);
      set('funcao', b.funcao || null);
      set('cidade', String(b.cidade ?? '').trim() || null);
      set('uf', UFS.includes(b.uf) ? b.uf : null);
      set('projeto', b.projeto || 'Todos');
      for (const k of ['cnh', 'movel', 'experiencia', 'contratado']) set(k, bool(b[k]));
      set('obs', String(b.obs ?? '').trim() || null);
      if ('cidade' in out || 'uf' in out) out.regiao = await distritoDe(t, out.cidade ?? b.cidade, out.uf ?? b.uf);
      return out; // as chaves são sempre nomes de coluna fixos deste arquivo, nunca texto vindo da tela
    }

    r.post('/central/banco', cen, h(async (req, t) => {
      const v = await lerPessoa(t, req.body || {});
      if (!v.email) throw new RuleError('Informe o e-mail.');
      if (await t.get('SELECT 1 FROM contratacao_banco WHERE lower(email) = ?', v.email)) throw new RuleError('Esse e-mail já está na base.');
      const keys = Object.keys(v);
      const { id } = await t.get(`INSERT INTO contratacao_banco (${keys.join(', ')}, data_disponivel) VALUES (${keys.map(() => '?').join(', ')}, CURRENT_DATE) RETURNING id`, ...keys.map((k) => v[k]));
      await log(t, { bancoId: id }, req.user, 'Pessoa cadastrada', v.nome);
      return { id };
    }));

    r.put('/central/banco/:id', cen, h(async (req, t) => {
      const b = await t.get('SELECT * FROM contratacao_banco WHERE id = ?', Number(req.params.id) || 0);
      if (!b) throw new RuleError('Pessoa não encontrada', 404);
      const v = await lerPessoa(t, req.body || {}, { parcial: true });
      if (v.email && await t.get('SELECT 1 FROM contratacao_banco WHERE lower(email) = ? AND id <> ?', v.email, b.id)) throw new RuleError('Esse e-mail já está em outra pessoa.');
      if ('contratado' in v && v.contratado && (await statusPessoa(t, b)) === 'demitido') throw new RuleError(`${b.nome} está Demitido(a).`);
      if (req.body?.reativar) v.demitido = false;
      const keys = Object.keys(v);
      if (keys.length) await t.run(`UPDATE contratacao_banco SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = now() WHERE id = ?`, ...keys.map((k) => v[k]), b.id);
      await log(t, { bancoId: b.id }, req.user, 'Ficha salva', b.nome);
      return pessoaView(await t.get(`${PESSOAS} WHERE b.id = ? ORDER BY b.nome, b.id`, b.id));
    }));

    // Importar: colunas nome;email;função;cidade;projeto;cnh;móvel;exp;obs (ponto e vírgula, vírgula ou TAB)
    r.post('/central/banco/importar', cen, h(async (req, t) => {
      const txt = String(req.body?.texto || '').replace(/^﻿/, '');
      const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
      if (!linhas.length) throw new RuleError('Cole ou anexe a planilha.');
      const sep = linhas[0].includes('\t') ? '\t' : linhas[0].includes(';') ? ';' : ',';
      const funcoes = await nomes(t, 'contratacao_funcoes');
      const projetos = await nomes(t, 'contratacao_projetos');
      // e-mails já cadastrados e regiões lidos uma vez (não uma consulta por linha da planilha)
      const jaTem = new Set((await t.all('SELECT lower(email) AS e FROM contratacao_banco WHERE email IS NOT NULL')).map((x) => x.e));
      const regioes = new Map((await t.all('SELECT cidade, uf, regiao FROM contratacao_regioes')).map((x) => [`${x.cidade.toLowerCase()}|${x.uf}`, x.regiao]));
      const novas = []; const pulados = [];
      for (const l of linhas) {
        const c = l.split(sep).map((s) => s.trim().replace(/^"|"$/g, ''));
        const [nome, email = '', fun = '', cid = '', proj = '', cnh, mov, exp, obs] = c;
        if (/^(nome|name)$/i.test(nome)) continue;
        if (!nome || !EMAIL_RE.test(email)) { pulados.push(`${nome || '(sem nome)'}: sem e-mail válido`); continue; }
        if (jaTem.has(email.toLowerCase())) { pulados.push(`${nome}: e-mail já na base`); continue; }
        jaTem.add(email.toLowerCase());
        const m = cid.match(/^(.*?)\s*[-/]\s*([A-Za-z]{2})$/);
        const cidade = (m ? m[1] : cid) || null;
        const uf = m && UFS.includes(m[2].toUpperCase()) ? m[2].toUpperCase() : null;
        const funcao = funcoes.find((f) => f.toLowerCase().startsWith(fun.toLowerCase().slice(0, 3))) || funcoes[0];
        const projeto = projetos.find((p) => proj && p.toLowerCase().includes(proj.toLowerCase().split(' ')[0])) || 'Todos';
        const regiao = (cidade && regioes.get(`${cidade.toLowerCase()}|${uf}`)) || uf || null;
        novas.push([nome, email.toLowerCase(), funcao, cidade, uf, regiao, projeto, bool(cnh), bool(mov), bool(exp), obs || null]);
      }
      for (let i = 0; i < novas.length; i += 200) {
        const lote = novas.slice(i, i + 200);
        await t.run(`INSERT INTO contratacao_banco (nome, email, funcao, cidade, uf, regiao, projeto, cnh, movel, experiencia, obs, data_disponivel)
          VALUES ${lote.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE)').join(', ')}`, ...lote.flat());
      }
      await log(t, {}, req.user, 'Importação de pessoas', `${novas.length} entraram · ${pulados.length} não entraram`);
      return { importados: novas.length, pulados };
    }));

    // ============================================================ CENTRAL — demissões
    r.get('/central/demissoes', cen, ler(() => db.all(`SELECT d.*, p.codigo AS pedido_codigo FROM contratacao_demissoes d
      LEFT JOIN contratacao_pedidos p ON p.id = d.pedido_id ORDER BY (d.status = 'pendente') DESC, d.id DESC`)));

    const demissaoPendente = async (t, id) => {
      const d = await t.get('SELECT * FROM contratacao_demissoes WHERE id = ?', Number(id) || 0);
      if (!d || d.status !== 'pendente') throw new RuleError('Pedido de demissão não encontrado ou já tratado.', 404);
      return d;
    };

    r.post('/central/demissoes/:id/aceitar', cen, h(async (req, t) => {
      const d = await demissaoPendente(t, req.params.id);
      const anexos = await t.all('DELETE FROM contratacao_anexos WHERE banco_id = ? RETURNING pedido_id', d.banco_id);
      for (const a of anexos) await recalcPedido(t, a.pedido_id);
      await t.run('UPDATE contratacao_banco SET contratado = FALSE, demitido = TRUE, updated_at = now() WHERE id = ?', d.banco_id);
      await t.run("UPDATE contratacao_demissoes SET status = 'aceita', resposta = ?, resolvido_por = ?, resolvido_at = now() WHERE id = ?",
        String(req.body?.resposta || '').trim() || null, req.user.id, d.id);
      await log(t, { pedidoId: d.pedido_id, bancoId: d.banco_id }, req.user, 'Demissão aceita', d.nome);
      await notify(d.solicitante_email, `QIMA Contratação · Demissão aceita · ${d.nome}`, HTML(`O RH aceitou o pedido de demissão de <b>${esc(d.nome)}</b>.`), t);
    }));

    r.post('/central/demissoes/:id/recusar', cen, h(async (req, t) => {
      const d = await demissaoPendente(t, req.params.id);
      const resposta = String(req.body?.resposta || '').trim() || null;
      await t.run("UPDATE contratacao_demissoes SET status = 'recusada', resposta = ?, resolvido_por = ?, resolvido_at = now() WHERE id = ?", resposta, req.user.id, d.id);
      await log(t, { pedidoId: d.pedido_id, bancoId: d.banco_id }, req.user, 'Demissão recusada', `${d.nome}${resposta ? ` · ${resposta}` : ''}`);
      await notify(d.solicitante_email, `QIMA Contratação · Demissão não aprovada · ${d.nome}`,
        HTML(`O RH não aprovou o pedido de demissão de <b>${esc(d.nome)}</b>.${resposta ? `<br>Motivo: ${esc(resposta)}` : ''}`), t);
    }));

    // ============================================================ relatório Excel
    r.get('/central/exportar', cen, ler(async (_req, res) => {
      const pedidos = await comAnexos(db, await db.all("SELECT * FROM contratacao_pedidos WHERE status <> 'rascunho' ORDER BY id"));
      const xlsx = files.xlsx([
        { name: 'Vagas', columns: [{ label: 'ID' }, { label: 'Solicitante', width: 24 }, { label: 'Projeto', width: 18 }, { label: 'Função' }, { label: 'Distrito' },
          { label: 'Cidade', width: 20 }, { label: 'UF', width: 5 }, { label: 'Início', type: 'date' }, { label: 'Semana', width: 8 }, { label: 'Qtd', width: 6 },
          { label: 'Atendida', width: 8 }, { label: 'Status', width: 20 }, { label: 'Situação', width: 10 }, { label: 'Exp.', width: 6 }, { label: 'CNH', width: 6 },
          { label: 'Mobilidade', width: 10 }, { label: 'Observação', width: 40 }, { label: 'Pessoas', width: 50 }],
          rows: pedidos.map((p) => [p.codigo, p.solicitante_nome, p.projeto, p.funcao, p.distrito, p.cidade, p.uf, p.data_desejada, p.semana, p.qtd, p.qtd_atendida,
            p.status_label, p.situacao, p.experiencia ? 'Sim' : 'Não', p.cnh ? 'Sim' : 'Não', p.movel ? 'MÓVEL' : 'LOCAL', p.observacao, p.anexos.map((a) => a.nome).join(', ')]) },
        { name: 'Pessoas', columns: [{ label: 'Nome', width: 28 }, { label: 'E-mail', width: 28 }, { label: 'CPF', width: 14 }, { label: 'Nascimento', type: 'date' },
          { label: 'Telefone', width: 16 }, { label: 'Função' }, { label: 'Cidade', width: 20 }, { label: 'UF', width: 5 }, { label: 'Região' }, { label: 'Projeto', width: 18 },
          { label: 'CNH', width: 6 }, { label: 'Móvel', width: 6 }, { label: 'Exp.', width: 6 }, { label: 'Status', width: 12 }, { label: 'Vaga', width: 10 }],
          rows: (await pessoas(db)).map((b) => [b.nome, b.email, fmtCpf(b.cpf), b.nascimento, b.telefone, b.funcao,
            b.cidade, b.uf, b.regiao, b.projeto, b.cnh ? 'Sim' : 'Não', b.movel ? 'Sim' : 'Não', b.experiencia ? 'Sim' : 'Não', b.status, b.vaga?.codigo || '']) },
      ]);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="contratacao-${hoje()}.xlsx"`);
      res.send(xlsx);
    }));
  },
};
