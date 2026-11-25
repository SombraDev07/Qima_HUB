// Backend do sistema Viagem: o solicitante pede passagem (ônibus ou avião) para uma ou mais pessoas,
// a Central aceita (fica "em agendamento"), anexa as passagens e conclui (fica "agendado") — ou recusa com motivo.
//
// As pessoas vêm do banco de pessoas da Contratação (contratacao_banco): os dados preenchidos aqui
// (CPF, RG, nascimento, telefone, BU) voltam para lá e já vêm preenchidos na próxima viagem.
// Banco: Postgres (assíncrono). Dentro de uma transação (rotas com "h") use sempre o "t".
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import migrations from './migrations.js';
import relatorio from './relatorio.js';
import {
  RuleError, UFS, TRANSPORTE, STATUS_LABEL, brDate, brMoney, codigoPedido, ids, lerViagem, lerPassageiros,
} from './regras.js';

const MAX_UPLOAD = 15 * 1024 * 1024;
const OK_MIME = /^(application\/pdf|image\/(png|jpe?g|webp))$/;
const HTML = (corpo) => `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6">${corpo}</div>`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const digitos = (v) => String(v ?? '').replace(/\D/g, '');

// Dados pessoais (CPF, RG, nascimento, telefone) só aparecem inteiros para a Central. O solicitante vê mascarado
// e sabe apenas que o dado já está no cadastro (tem_*): o servidor completa o pedido com o que está guardado.
const DOCS = ['cpf', 'rg', 'nascimento', 'telefone'];
function mascarar(x) {
  const cpf = digitos(x.cpf);
  const tel = digitos(x.telefone);
  const rg = String(x.rg ?? '').trim();
  return {
    ...x,
    cpf: cpf.length === 11 ? `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**` : null,
    rg: rg ? `•••${rg.slice(-2)}` : null,
    nascimento: null,
    telefone: tel.length >= 10 ? `(${tel.slice(0, 2)}) •••••-${tel.slice(-4)}` : null,
    ...Object.fromEntries(DOCS.map((k) => [`tem_${k}`, !!String(x[k] ?? '').trim()])),
  };
}
const trecho = (p) => `${p.origem}/${p.origem_uf} → ${p.destino}/${p.destino_uf}`;

export default {
  banco: 'postgres',
  migrations,
  relatorio,

  async summary({ db, user, isCentral }) {
    const meu = isCentral ? '' : 'AND solicitante_id = ?';
    const r = await db.get(`SELECT COUNT(*) FILTER (WHERE status = 'pendente') AS novos, COUNT(*) FILTER (WHERE status = 'agendando') AS agendando
      FROM viagem_pedidos WHERE status IN ('pendente','agendando') ${meu}`, ...(isCentral ? [] : [user.id]));
    return isCentral ? `${r.novos} pedido(s) novo(s) · ${r.agendando} em agendamento` : `${r.novos} aguardando central · ${r.agendando} em agendamento`;
  },

  async notificacoes({ db, user, isCentral, isSolicitante }) {
    const out = [];
    if (isCentral) {
      const r = await db.get(`SELECT COUNT(*) FILTER (WHERE status = 'pendente') AS novos, COUNT(*) FILTER (WHERE status = 'agendando') AS ag
        FROM viagem_pedidos WHERE status IN ('pendente','agendando')`);
      out.push({ central: true, qtd: r.novos, texto: 'pedido(s) de viagem novo(s)' });
      out.push({ central: true, qtd: r.ag, texto: 'viagem(ns) aceita(s) aguardando a passagem' });
    }
    if (isSolicitante) {
      const r = await db.get(`SELECT COUNT(*) AS n FROM viagem_pedidos WHERE solicitante_id = ? AND status = 'recusado'
        AND updated_at >= now() - interval '7 days'`, user.id);
      out.push({ link: 'solicitante', qtd: r.n, texto: 'pedido(s) de viagem recusado(s) — corrija e reenvie' });
    }
    return out;
  },

  router(r, ctx) {
    const { db, requireRole, notify, arquivos, limitar } = ctx;
    const sol = requireRole('solicitante');
    const cen = requireRole('central');
    const isCentral = (req) => ['central', 'ambos'].includes(req.moduleRole);

    function erro(res, err) {
      if (err instanceof RuleError) return res.status(err.status).json({ error: err.message });
      console.error('[viagem]', err);
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

    const log = (t, pedidoId, user, acao, detalhe = null) => t.run(
      'INSERT INTO viagem_historico (pedido_id, user_id, user_nome, acao, detalhe) VALUES (?, ?, ?, ?, ?)', pedidoId, user?.id || null, user?.name || null, acao, detalhe);
    async function getPedido(t, id) {
      const p = await t.get('SELECT * FROM viagem_pedidos WHERE id = ?', Number(id) || 0);
      if (!p) throw new RuleError('Pedido não encontrado', 404);
      return p;
    }
    const busAtivas = async (t) => (await t.all('SELECT nome FROM viagem_bus WHERE ativo ORDER BY nome')).map((x) => x.nome);

    /** Pedidos com passageiros, passagens e histórico (3 consultas, qualquer que seja a quantidade). */
    async function completos(t, pedidos, { historico = false, central = false } = {}) {
      if (!pedidos.length) return [];
      const lista = ids(pedidos.map((p) => p.id));
      const pass = await t.all(`SELECT * FROM viagem_passageiros WHERE pedido_id IN (${lista}) ORDER BY pedido_id, ordem, id`);
      const anexos = await t.all(`SELECT id, pedido_id, nome, mime, tamanho, created_at FROM viagem_anexos WHERE pedido_id IN (${lista}) ORDER BY id`);
      const hist = historico ? await t.all(`SELECT * FROM viagem_historico WHERE pedido_id IN (${lista}) ORDER BY id DESC`) : [];
      return pedidos.map((p) => {
        const passageiros = pass.filter((x) => x.pedido_id === p.id).map((x) => (central ? x : mascarar(x)));
        const comValor = passageiros.filter((x) => x.valor != null);
        return {
          ...p,
          passageiros,
          anexos: anexos.filter((x) => x.pedido_id === p.id),
          valor_total: comValor.length ? comValor.reduce((s, x) => s + x.valor, 0) : null,
          ...(historico ? { historico: hist.filter((x) => x.pedido_id === p.id) } : {}),
        };
      });
    }
    const completo = async (t, id, { central = true } = {}) => (await completos(t, [await getPedido(t, id)], { historico: true, central }))[0];

    /**
     * Completa os passageiros escolhidos do banco de pessoas com os documentos guardados lá (o solicitante não os vê).
     * Um pessoa_id inexistente vira "pessoa nova". CPF digitado diferente do cadastrado é recusado (não troca a identidade de ninguém).
     */
    async function completarDaBase(t, lista) {
      if (!Array.isArray(lista)) return lista;
      const idsP = [...new Set(lista.map((x) => Number(x?.pessoa_id)).filter((n) => Number.isInteger(n) && n > 0))];
      const base = idsP.length ? await t.all(`SELECT id, cpf, rg, to_char(nascimento, 'YYYY-MM-DD') AS nascimento, telefone, bu
        FROM contratacao_banco WHERE id IN (${ids(idsP)})`) : [];
      const porId = new Map(base.map((b) => [b.id, b]));
      const vazio = (v) => !String(v ?? '').trim();
      return lista.map((x) => {
        const b = x && porId.get(Number(x.pessoa_id));
        if (!b) return x && { ...x, pessoa_id: null };
        if (b.cpf && !vazio(x.cpf) && digitos(x.cpf) !== digitos(b.cpf)) {
          throw new RuleError(`${String(x.nome || 'Passageiro').slice(0, 120)}: o CPF não confere com o cadastro desta pessoa. Para corrigir o cadastro, fale com o RH.`);
        }
        const out = { ...x };
        for (const k of DOCS) if (vazio(x[k]) && !vazio(b[k])) out[k] = b[k];
        if (vazio(out.bu) && !vazio(b.bu)) out.bu = b.bu;
        return out;
      });
    }
    const lerPassageirosDoPedido = async (t, lista) => lerPassageiros(await completarDaBase(t, lista), await busAtivas(t));

    /**
     * Liga o passageiro ao banco de pessoas da Contratação e devolve o id da pessoa.
     * Acha a pessoa pelo id escolhido (já conferido em completarDaBase), pelo CPF ou pelo e-mail; se não existir, cadastra.
     * Num cadastro existente só PREENCHE o que estiver vazio: nunca sobrescreve CPF, RG, nascimento, telefone ou BU (quem corrige é o RH).
     */
    async function sincronizarPessoa(t, x) {
      let pessoa = x.pessoa_id ? await t.get('SELECT id, email FROM contratacao_banco WHERE id = ?', x.pessoa_id) : null;
      if (!pessoa) pessoa = await t.get("SELECT id, email FROM contratacao_banco WHERE regexp_replace(COALESCE(cpf,''), '\\D', '', 'g') = ? ORDER BY demitido, id DESC LIMIT 1", x.cpf);
      if (!pessoa) pessoa = await t.get('SELECT id, email FROM contratacao_banco WHERE lower(email) = ?', x.email);
      if (!pessoa) {
        const novo = await t.get(`INSERT INTO contratacao_banco (nome, email, cpf, rg, nascimento, telefone, bu, data_disponivel)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_DATE) RETURNING id`, x.nome, x.email, x.cpf, x.rg, x.nascimento, x.telefone, x.bu);
        return novo.id;
      }
      // e-mail só entra se a pessoa não tinha e ninguém mais usa (o e-mail é único no banco)
      const livre = !pessoa.email && !(await t.get('SELECT 1 FROM contratacao_banco WHERE lower(email) = ? AND id <> ?', x.email, pessoa.id));
      await t.run(`UPDATE contratacao_banco SET cpf = COALESCE(NULLIF(cpf, ''), ?), rg = COALESCE(NULLIF(rg, ''), ?), nascimento = COALESCE(nascimento, ?),
        telefone = COALESCE(NULLIF(telefone, ''), ?), bu = COALESCE(NULLIF(bu, ''), ?)${livre ? ', email = ?' : ''}, updated_at = now() WHERE id = ?`,
      x.cpf, x.rg, x.nascimento, x.telefone, x.bu, ...(livre ? [x.email] : []), pessoa.id);
      return pessoa.id;
    }

    async function gravarPassageiros(t, pedidoId, passageiros) {
      await t.run('DELETE FROM viagem_passageiros WHERE pedido_id = ?', pedidoId);
      for (let i = 0; i < passageiros.length; i++) {
        const x = passageiros[i];
        const pessoaId = await sincronizarPessoa(t, x);
        await t.run(`INSERT INTO viagem_passageiros (pedido_id, ordem, pessoa_id, nome, cpf, rg, nascimento, email, telefone, bu, poltrona)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, pedidoId, i, pessoaId, x.nome, x.cpf, x.rg, x.nascimento, x.email, x.telefone, x.bu, x.poltrona);
      }
    }

    async function avisarCentral(t, p, texto) {
      const { usuariosComPerfil } = ctx;
      for (const u of await usuariosComPerfil('central', t)) {
        await notify(u.email, `Viagem - ${p.codigo}: ${texto}`, HTML(`Olá, ${esc(u.name)}.<br>
          ${esc(p.solicitante_nome)} ${texto.toLowerCase()}: <b>${p.codigo}</b> · ${esc(trecho(p))} · ${TRANSPORTE[p.transporte]} · saída ${brDate(p.data_ida)} às ${p.horario}.
          <br><br>Veja no QIMA HUB · Viagem › Central viagens.`), t);
      }
    }

    // ------------------------------------------------------------ dados de apoio
    r.get('/opcoes', ler(async () => ({ bus: await busAtivas(db), ufs: UFS })));

    const CAMPOS_PESSOA = `id, nome, email, cpf, rg, to_char(nascimento, 'YYYY-MM-DD') AS nascimento, telefone, bu, funcao,
      NULLIF(concat_ws('/', cidade, uf), '') AS cidade, demitido`;
    // Busca no banco de pessoas da Contratação por nome ou e-mail (por CPF só a Central). Os documentos voltam mascarados:
    // a busca serve para escolher a pessoa, não para consultar dados pessoais.
    r.get('/pessoas', ler(async (req) => {
      const termo = String(req.query.q || '').trim().slice(0, 80);
      if (termo.length < 2) return [];
      const q = `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const dig = isCentral(req) ? digitos(termo) : '';
      const rows = await db.all(`SELECT ${CAMPOS_PESSOA} FROM contratacao_banco
        WHERE nome ILIKE ? OR COALESCE(email,'') ILIKE ? ${dig.length >= 3 ? "OR regexp_replace(COALESCE(cpf,''), '\\D', '', 'g') LIKE ?" : ''}
        ORDER BY demitido, nome LIMIT 30`, q, q, ...(dig.length >= 3 ? [`%${dig}%`] : []));
      return rows.map(mascarar);
    }));
    // A própria pessoa logada no banco de pessoas (para já vir preenchida como 1º passageiro)
    r.get('/eu', ler(async (req) => {
      const eu = await db.get(`SELECT ${CAMPOS_PESSOA} FROM contratacao_banco WHERE lower(email) = lower(?)`, req.user.email || '');
      return eu ? mascarar(eu) : { id: null, nome: req.user.name, email: req.user.email || '' };
    }));

    // Passagens: o dono do pedido e a central podem abrir
    r.get('/anexos/:aid', async (req, res) => {
      try {
        const a = await db.get(`SELECT a.nome, a.mime, a.arquivo, p.solicitante_id FROM viagem_anexos a JOIN viagem_pedidos p ON p.id = a.pedido_id
          WHERE a.id = ?`, Number(req.params.aid) || 0);
        if (!a || (!isCentral(req) && a.solicitante_id !== req.user.id)) return res.status(404).json({ error: 'Arquivo não encontrado' });
        res.setHeader('Content-Type', a.mime || 'application/octet-stream');
        res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(a.nome)}`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        await arquivos.enviar(res, a.arquivo);
      } catch (e) { erro(res, e); }
    });

    // ============================================================ SOLICITANTE
    r.get('/meus', sol, ler(async (req) => completos(db, await db.all('SELECT * FROM viagem_pedidos WHERE solicitante_id = ? ORDER BY id DESC LIMIT 300', req.user.id))));

    r.get('/pedidos/:id', ler(async (req) => {
      const p = await completo(db, req.params.id, { central: isCentral(req) });
      if (!isCentral(req) && p.solicitante_id !== req.user.id) throw new RuleError('Pedido não encontrado', 404);
      return p;
    }));

    r.post('/meus', sol, h(async (req, t) => {
      const v = lerViagem(req.body || {});
      const passageiros = await lerPassageirosDoPedido(t, req.body.passageiros);
      const p = await t.get(`INSERT INTO viagem_pedidos (solicitante_id, solicitante_nome, solicitante_email, origem, origem_uf, destino, destino_uf,
        transporte, data_ida, data_volta, horario, obs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      req.user.id, req.user.name, req.user.email || null, v.origem, v.origem_uf, v.destino, v.destino_uf, v.transporte, v.data_ida, v.data_volta, v.horario, v.obs);
      const codigo = codigoPedido(p.id);
      await t.run('UPDATE viagem_pedidos SET codigo = ? WHERE id = ?', codigo, p.id);
      await gravarPassageiros(t, p.id, passageiros);
      await log(t, p.id, req.user, 'Pedido enviado', `${trecho(v)} · ${passageiros.length} passageiro(s)`);
      await avisarCentral(t, { ...v, codigo, solicitante_nome: req.user.name }, 'Novo pedido de viagem');
      return { id: p.id, codigo };
    }));

    // Editar: enquanto a central não aceitou, ou depois de recusado (volta para a central)
    r.put('/meus/:id', sol, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      if (p.solicitante_id !== req.user.id) throw new RuleError('Pedido não encontrado', 404);
      if (!['pendente', 'recusado'].includes(p.status)) throw new RuleError(`O pedido está "${STATUS_LABEL[p.status]}" e não pode mais ser editado. Fale com a central.`);
      const v = lerViagem(req.body || {});
      const passageiros = await lerPassageirosDoPedido(t, req.body.passageiros);
      await t.run(`UPDATE viagem_pedidos SET origem = ?, origem_uf = ?, destino = ?, destino_uf = ?, transporte = ?, data_ida = ?, data_volta = ?, horario = ?,
        obs = ?, status = 'pendente', updated_at = now() WHERE id = ?`,
      v.origem, v.origem_uf, v.destino, v.destino_uf, v.transporte, v.data_ida, v.data_volta, v.horario, v.obs, p.id);
      await gravarPassageiros(t, p.id, passageiros);
      const reenvio = p.status === 'recusado';
      await log(t, p.id, req.user, reenvio ? 'Corrigido e reenviado' : 'Pedido editado', `${trecho(v)} · ${passageiros.length} passageiro(s)`);
      if (reenvio) await avisarCentral(t, { ...p, ...v }, 'Pedido de viagem corrigido e reenviado');
      return { id: p.id, codigo: p.codigo };
    }));

    r.post('/meus/:id/cancelar', sol, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      if (p.solicitante_id !== req.user.id) throw new RuleError('Pedido não encontrado', 404);
      if (!['pendente', 'recusado', 'agendando'].includes(p.status)) {
        throw new RuleError(p.status === 'agendado' ? 'A passagem já foi emitida. Para cancelar, fale com a central.' : 'Este pedido não pode ser cancelado.');
      }
      await t.run("UPDATE viagem_pedidos SET status = 'cancelado', updated_at = now() WHERE id = ?", p.id);
      await log(t, p.id, req.user, 'Cancelado pelo solicitante');
      if (p.status === 'agendando') await avisarCentral(t, p, 'Pedido de viagem cancelado pelo solicitante');
    }));

    // ============================================================ CENTRAL
    // Abertos sempre; encerrados dos últimos 180 dias
    r.get('/central/pedidos', cen, ler(async () => completos(db, await db.all(`SELECT * FROM viagem_pedidos
      WHERE status IN ('pendente','agendando') OR updated_at >= now() - interval '180 days' ORDER BY id DESC LIMIT 1000`))));

    r.post('/central/pedidos/:id/aceitar', cen, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      if (p.status !== 'pendente') throw new RuleError('Só dá para aceitar pedido aguardando a central.');
      await t.run("UPDATE viagem_pedidos SET status = 'agendando', motivo_recusa = NULL, aceito_por = ?, aceito_at = now(), updated_at = now() WHERE id = ?", req.user.name, p.id);
      await log(t, p.id, req.user, 'Aceito pela central', 'Em agendamento');
      await notify(p.solicitante_email, `Viagem - ${p.codigo}: em agendamento`, HTML(`Olá, ${esc(p.solicitante_nome)}.<br>
        A central aceitou seu pedido <b>${p.codigo}</b> (${esc(trecho(p))}, saída ${brDate(p.data_ida)}) e está agendando a passagem.
        Você recebe outro aviso quando ela for emitida.`), t);
      return completo(t, p.id);
    }));

    r.post('/central/pedidos/:id/recusar', cen, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      if (!['pendente', 'agendando'].includes(p.status)) throw new RuleError('Este pedido não pode ser recusado.');
      const motivo = String(req.body?.motivo || '').trim().slice(0, 500);
      if (!motivo) throw new RuleError('Informe o motivo da recusa.');
      await t.run("UPDATE viagem_pedidos SET status = 'recusado', motivo_recusa = ?, updated_at = now() WHERE id = ?", motivo, p.id);
      await log(t, p.id, req.user, 'Recusado pela central', motivo);
      await notify(p.solicitante_email, `Viagem - ${p.codigo}: recusado`, HTML(`Olá, ${esc(p.solicitante_nome)}.<br>
        Seu pedido de viagem <b>${p.codigo}</b> (${esc(trecho(p))}) foi recusado pela central.<br>
        Motivo: <b>${esc(motivo)}</b><br><br>Você pode corrigir e reenviar no QIMA HUB · Viagem.`), t);
      return completo(t, p.id);
    }));

    // Localizador e valor de cada passageiro + observação da central (em agendamento ou já agendado)
    r.put('/central/pedidos/:id/passagens', cen, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      if (!['agendando', 'agendado'].includes(p.status)) throw new RuleError('Aceite o pedido antes de lançar as passagens.');
      const lista = Array.isArray(req.body?.passageiros) ? req.body.passageiros : [];
      const atuais = await t.all('SELECT id FROM viagem_passageiros WHERE pedido_id = ?', p.id);
      for (const x of lista) {
        if (!atuais.some((a) => a.id === Number(x.id))) throw new RuleError('Passageiro não pertence a este pedido.');
        const valor = x.valor === '' || x.valor == null ? null : Number(x.valor);
        if (valor != null && (!Number.isFinite(valor) || valor < 0 || valor > 100000)) throw new RuleError('Valor da passagem inválido.');
        await t.run('UPDATE viagem_passageiros SET localizador = ?, valor = ? WHERE id = ?', String(x.localizador || '').trim().slice(0, 40) || null, valor, Number(x.id));
      }
      await t.run('UPDATE viagem_pedidos SET obs_central = ?, updated_at = now() WHERE id = ?', String(req.body?.obs_central || '').trim().slice(0, 1000) || null, p.id);
      return completo(t, p.id);
    }));

    r.post('/central/pedidos/:id/anexos', cen, limitar({ nome: 'anexo', max: 40, porDia: 100 }), express.raw({ type: () => true, limit: MAX_UPLOAD }), async (req, res) => {
      let arquivo = null;
      try {
        const p = await getPedido(db, req.params.id);
        if (!['agendando', 'agendado'].includes(p.status)) throw new RuleError('Aceite o pedido antes de anexar a passagem.');
        const nome = path.basename(String(req.query.nome || 'passagem')).slice(0, 200);
        const mime = String(req.headers['content-type'] || '').split(';')[0];
        if (!OK_MIME.test(mime)) throw new RuleError('Envie PDF ou imagem (JPG/PNG).');
        if (!req.body?.length) throw new RuleError('Arquivo vazio.');
        { const ruim = arquivos.conferir(req.body, mime); if (ruim) throw new RuleError(ruim); } // conteúdo real, não o tipo declarado
        const ext = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/webp': '.webp' }[mime] || '.jpg';
        arquivo = `${p.id}-${crypto.randomBytes(8).toString('hex')}${ext}`;
        await arquivos.salvar(arquivo, req.body, mime);
        const a = await db.tx(async (t) => {
          const x = await t.get('INSERT INTO viagem_anexos (pedido_id, nome, mime, arquivo, tamanho, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
            p.id, nome, mime, arquivo, req.body.length, req.user.id);
          await log(t, p.id, req.user, 'Passagem anexada', nome);
          return x;
        });
        res.status(201).json({ id: a.id, nome, mime, tamanho: req.body.length });
      } catch (e) {
        if (arquivo) arquivos.apagar(arquivo);
        erro(res, e);
      }
    });

    r.delete('/central/anexos/:aid', cen, h(async (req, t) => {
      const a = await t.get('SELECT a.*, p.status FROM viagem_anexos a JOIN viagem_pedidos p ON p.id = a.pedido_id WHERE a.id = ?', Number(req.params.aid) || 0);
      if (!a) throw new RuleError('Arquivo não encontrado', 404);
      if (a.status !== 'agendando') throw new RuleError('Reabra o agendamento para trocar a passagem.');
      await t.run('DELETE FROM viagem_anexos WHERE id = ?', a.id);
      await log(t, a.pedido_id, req.user, 'Passagem removida', a.nome);
      arquivos.apagar(a.arquivo);
    }));

    // Concluir: precisa de pelo menos uma passagem anexada; avisa o solicitante
    r.post('/central/pedidos/:id/concluir', cen, h(async (req, t) => {
      const p = await completo(t, req.params.id);
      if (p.status !== 'agendando') throw new RuleError('Só dá para concluir pedido em agendamento.');
      if (!p.anexos.length) throw new RuleError('Anexe a passagem antes de concluir.');
      await t.run("UPDATE viagem_pedidos SET status = 'agendado', agendado_por = ?, agendado_at = now(), updated_at = now() WHERE id = ?", req.user.name, p.id);
      await log(t, p.id, req.user, 'Viagem agendada', `${p.anexos.length} passagem(ns)${p.valor_total != null ? ` · ${brMoney(p.valor_total)}` : ''}`);
      const linhas = p.passageiros.map((x) => `<li>${esc(x.nome)}${x.localizador ? ` · localizador <b>${esc(x.localizador)}</b>` : ''}${x.poltrona ? ` · poltrona pedida ${esc(x.poltrona)}` : ''}</li>`).join('');
      await notify(p.solicitante_email, `Viagem - ${p.codigo}: agendada`, HTML(`Olá, ${esc(p.solicitante_nome)}.<br>
        A viagem <b>${p.codigo}</b> foi agendada: ${esc(trecho(p))} · ${TRANSPORTE[p.transporte]} · saída ${brDate(p.data_ida)} às ${p.horario}${p.data_volta ? ` · volta ${brDate(p.data_volta)}` : ''}.
        <ul>${linhas}</ul>${p.obs_central ? `Observação da central: ${esc(p.obs_central)}<br>` : ''}
        As passagens estão no QIMA HUB · Viagem › Minhas viagens › ${p.codigo}.`), t);
      return completo(t, p.id);
    }));

    r.post('/central/pedidos/:id/reabrir', cen, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      if (p.status !== 'agendado') throw new RuleError('Só dá para reabrir pedido agendado.');
      await t.run("UPDATE viagem_pedidos SET status = 'agendando', updated_at = now() WHERE id = ?", p.id);
      await log(t, p.id, req.user, 'Agendamento reaberto');
      return completo(t, p.id);
    }));

    // ------------------------------------------------------------ configurações (lista de BUs)
    r.get('/central/bus', cen, ler(() => db.all('SELECT * FROM viagem_bus ORDER BY nome')));
    r.post('/central/bus', cen, h(async (req, t) => {
      const nome = String(req.body?.nome || '').trim().slice(0, 80);
      if (!nome) throw new RuleError('Informe o nome da BU.');
      if (await t.get('SELECT 1 FROM viagem_bus WHERE lower(nome) = lower(?)', nome)) throw new RuleError('Essa BU já existe.');
      return t.get('INSERT INTO viagem_bus (nome) VALUES (?) RETURNING *', nome);
    }));
    r.put('/central/bus/:id', cen, h(async (req, t) => {
      const b = await t.get('UPDATE viagem_bus SET ativo = ? WHERE id = ? RETURNING *', !!req.body?.ativo, Number(req.params.id) || 0);
      if (!b) throw new RuleError('BU não encontrada', 404);
      return b;
    }));
  },
};
