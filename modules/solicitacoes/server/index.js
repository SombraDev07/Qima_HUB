// Backend do sistema Solicitações (Central Harvest): o solicitante manda dados ou planilhas,
// a central lança em outro sistema e as duas partes conversam no pedido quando algo dá errado.
//
// Banco: Postgres (assíncrono). Dentro de uma transação (rotas com "h") use sempre o "t".
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import migrations from './migrations.js';
import relatorio from './relatorio.js';
import {
  RuleError, isDate, hoje, txt, esc, codigoPedido, TIPOS, SUBTIPOS, STATUS, EDITAVEIS, tipoLabel, precisaAnexo, lerLinhas, fmtDoc,
} from './regras.js';

const EXT = { '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xls': 'application/vnd.ms-excel', '.csv': 'text/csv', '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12' };
const MAX_UPLOAD = 20 * 1024 * 1024;

// Pedido com os números do card numa consulta só (sem uma consulta por pedido).
const PEDIDOS = `
  SELECT p.*,
    (SELECT COUNT(*) FROM solicitacoes_linhas l WHERE l.pedido_id = p.id) AS linhas_qtd,
    (SELECT COUNT(*) FROM solicitacoes_mensagens m WHERE m.pedido_id = p.id AND m.papel = 'central' AND NOT m.lida) AS msgs_central,
    (SELECT COUNT(*) FROM solicitacoes_mensagens m WHERE m.pedido_id = p.id AND m.papel = 'solicitante' AND NOT m.lida) AS msgs_solicitante,
    (SELECT json_build_object('id', a.id, 'nome', a.nome, 'tamanho', a.tamanho) FROM solicitacoes_arquivos a
      WHERE a.pedido_id = p.id AND a.ativo ORDER BY a.id DESC LIMIT 1) AS anexo
  FROM solicitacoes_pedidos p`;
const resumo = (p) => ({ ...p, anexo: typeof p.anexo === 'string' ? JSON.parse(p.anexo) : p.anexo || null, tipo_label: tipoLabel(p), status_label: STATUS[p.status] });

export default {
  banco: 'postgres',
  migrations,
  relatorio,

  async summary({ db, user, isCentral }) {
    if (isCentral) {
      const r = await db.get(`SELECT COUNT(*) FILTER (WHERE status = 'pendente') AS p, COUNT(*) FILTER (WHERE status = 'analise') AS a,
        COUNT(*) FILTER (WHERE status = 'correcao') AS c FROM solicitacoes_pedidos WHERE status IN ('pendente','analise','correcao')`);
      return `${r.p} pendente(s) · ${r.a} em análise${r.c ? ` · ${r.c} aguardando correção` : ''}`;
    }
    const r = await db.get(`SELECT COUNT(*) FILTER (WHERE status IN ('pendente','analise')) AS a, COUNT(*) FILTER (WHERE status = 'correcao') AS c
      FROM solicitacoes_pedidos WHERE solicitante_id = ? AND status IN ('pendente','analise','correcao')`, user.id);
    return `${r.a} em andamento${r.c ? ` · ${r.c} para corrigir` : ''}`;
  },

  async notificacoes({ db, user, isCentral, isSolicitante }) {
    const out = [];
    if (isCentral) {
      const r = await db.get(`SELECT
        (SELECT COUNT(*) FROM solicitacoes_pedidos WHERE status = 'pendente') AS pendentes,
        (SELECT COUNT(DISTINCT m.pedido_id) FROM solicitacoes_mensagens m JOIN solicitacoes_pedidos p ON p.id = m.pedido_id
          WHERE m.papel = 'solicitante' AND NOT m.lida AND p.status <> 'cancelado') AS msgs`);
      out.push({ central: true, qtd: r.pendentes, texto: 'solicitação(ões) pendente(s)' });
      out.push({ central: true, qtd: r.msgs, texto: 'solicitação(ões) com mensagem nova do solicitante' });
    }
    if (isSolicitante) {
      const r = await db.get(`SELECT
        (SELECT COUNT(*) FROM solicitacoes_pedidos WHERE solicitante_id = ? AND status = 'correcao') AS correcao,
        (SELECT COUNT(DISTINCT m.pedido_id) FROM solicitacoes_mensagens m JOIN solicitacoes_pedidos p ON p.id = m.pedido_id
          WHERE p.solicitante_id = ? AND m.papel = 'central' AND NOT m.lida) AS msgs`, user.id, user.id);
      out.push({ link: 'solicitante', qtd: r.correcao, texto: 'solicitação(ões) devolvida(s) para correção' });
      out.push({ link: 'solicitante', qtd: r.msgs, texto: 'solicitação(ões) com mensagem nova da central' });
    }
    return out;
  },

  router(r, ctx) {
    const { db, requireRole, notify, usuariosComPerfil, filesDir, files } = ctx;
    const sol = requireRole('solicitante');
    const cen = requireRole('central');
    const isCentral = (req) => ['central', 'ambos'].includes(req.moduleRole);

    function erro(res, err) {
      if (err instanceof RuleError) return res.status(err.status).json({ error: err.message, ...err.extra });
      console.error('[solicitacoes]', err);
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
    const paraCentral = async (t, p, assunto, corpo) => {
      // se alguém da central já pegou o pedido, avisa só essa pessoa
      const central = await usuariosComPerfil('central', t);
      const alvo = p.responsavel_id ? central.filter((u) => u.id === p.responsavel_id) : central;
      for (const u of (alvo.length ? alvo : central)) await notify(u.email, `QIMA Solicitações · ${assunto}`, mail(corpo), t);
    };
    const paraSolicitante = (t, p, assunto, corpo) => notify(p.solicitante_email, `QIMA Solicitações · ${assunto}`, mail(corpo), t);

    // ------------------------------------------------------------ leitura
    const getPedido = async (t, id) => {
      const p = await t.get(`${PEDIDOS} WHERE p.id = ?`, Number(id) || 0);
      if (!p) throw new RuleError('Solicitação não encontrada', 404);
      return resumo(p);
    };
    const mensagens = (t, pid) => t.all('SELECT id, pedido_id, papel, autor_id, autor_nome, texto, lida, created_at FROM solicitacoes_mensagens WHERE pedido_id = ? ORDER BY id', pid);
    const completo = async (t, p) => ({
      ...p,
      linhas: (await t.all('SELECT id, ordem, cod_visita, documento, data, negativa, declarada, positiva, participante FROM solicitacoes_linhas WHERE pedido_id = ? ORDER BY ordem', p.id))
        .map((l) => ({ ...l, documento_fmt: fmtDoc(l.documento) })),
      arquivos: await t.all('SELECT id, nome, tamanho, ativo, created_at FROM solicitacoes_arquivos WHERE pedido_id = ? ORDER BY id DESC', p.id),
      mensagens: await mensagens(t, p.id),
    });
    const podeVer = (req, p) => isCentral(req) || p.solicitante_id === req.user.id;
    const msg = (t, pid, papel, user, texto) => t.run('INSERT INTO solicitacoes_mensagens (pedido_id, papel, autor_id, autor_nome, texto, lida) VALUES (?, ?, ?, ?, ?, ?)',
      pid, papel, user?.id ?? null, user?.name ?? 'Sistema', texto, papel === 'sistema');
    /** Quem abre o pedido marca como lidas as mensagens do outro lado. Devolve o lado de quem abriu. */
    const marcarLidas = async (t, req, p) => {
      const lado = req.query.lado === 'central' && isCentral(req) ? 'central' : 'solicitante';
      if (lado === 'central' || p.solicitante_id === req.user.id) {
        await t.run('UPDATE solicitacoes_mensagens SET lida = TRUE WHERE pedido_id = ? AND papel = ? AND NOT lida', p.id, lado === 'central' ? 'solicitante' : 'central');
      }
    };
    const projetosAtivos = async (t) => (await t.all('SELECT nome FROM solicitacoes_projetos WHERE ativo ORDER BY id')).map((x) => x.nome);

    r.get('/config', ler(async () => ({ projetos: await projetosAtivos(db), tipos: TIPOS, subtipos: SUBTIPOS, status: STATUS })));

    // ------------------------------------------------------------ planilhas
    // TODO(migração): os arquivos ainda ficam em disco local; passam para o Supabase Storage na etapa de arquivos.
    r.post('/arquivos', sol, express.raw({ type: () => true, limit: MAX_UPLOAD }), async (req, res) => {
      let arquivo = null;
      try {
        const nome = path.basename(String(req.query.nome || '')).slice(0, 200);
        const ext = path.extname(nome).toLowerCase();
        if (!EXT[ext]) throw new RuleError('Envie uma planilha Excel (.xlsx, .xls, .xlsm) ou .csv.');
        if (!req.body?.length) throw new RuleError('Arquivo vazio.');
        if (['.xlsx', '.xlsm'].includes(ext) && req.body.slice(0, 2).toString() !== 'PK') throw new RuleError('Este arquivo não é uma planilha Excel válida.');
        arquivo = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
        await fs.promises.writeFile(path.join(filesDir, arquivo), req.body);
        const x = await db.get('INSERT INTO solicitacoes_arquivos (dono_id, nome, arquivo, mime, tamanho) VALUES (?, ?, ?, ?, ?) RETURNING id', req.user.id, nome, arquivo, EXT[ext], req.body.length);
        res.status(201).json({ id: x.id, nome, tamanho: req.body.length });
      } catch (e) {
        if (arquivo) fs.rm(path.join(filesDir, arquivo), { force: true }, () => {});
        erro(res, e);
      }
    });

    r.get('/arquivos/:id', async (req, res) => {
      try {
        const a = await db.get(`SELECT a.nome, a.arquivo, a.mime, a.dono_id, p.solicitante_id FROM solicitacoes_arquivos a
          LEFT JOIN solicitacoes_pedidos p ON p.id = a.pedido_id WHERE a.id = ?`, Number(req.params.id) || 0);
        if (!a || !(isCentral(req) || a.dono_id === req.user.id || a.solicitante_id === req.user.id)) return res.status(404).json({ error: 'Arquivo não encontrado' });
        res.setHeader('Content-Type', a.mime || 'application/octet-stream');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(a.nome)}`);
        res.sendFile(path.join(filesDir, a.arquivo));
      } catch (e) { erro(res, e); }
    });

    // ------------------------------------------------------------ montar / validar o pedido
    async function lerPedido(t, b, { tipo, subtipo }, user) {
      if (!(await projetosAtivos(t)).includes(b.projeto)) throw new RuleError('Escolha o projeto.');
      const v = { projeto: b.projeto, cod_visita: null, id_carga: null, motivo: null, titulo: null, descricao: null, data_inicial: null, data_final: null };
      const falta = [];
      if (tipo === 'exclusao') {
        v.cod_visita = txt(b.cod_visita, 60); v.id_carga = txt(b.id_carga, 60); v.motivo = txt(b.motivo); v.descricao = txt(b.descricao);
        if (!v.cod_visita) falta.push('o código da visita'); if (!v.id_carga) falta.push('o ID da carga');
        if (!v.motivo) falta.push('o motivo'); if (!v.descricao) falta.push('a descrição');
      } else if (tipo === 'insercao') {
        v.cod_visita = txt(b.cod_visita, 60); v.descricao = txt(b.descricao);
        if (!v.cod_visita) falta.push('o código da visita'); if (!v.descricao) falta.push('a descrição');
      } else if (subtipo === 'insercao') {
        v.titulo = txt(b.titulo, 200); v.descricao = txt(b.descricao);
        v.data_inicial = isDate(b.data_inicial) ? b.data_inicial : null; v.data_final = isDate(b.data_final) ? b.data_final : null;
        if (!v.titulo) falta.push('o título'); if (!v.descricao) falta.push('a descrição');
        if (!v.data_inicial || !v.data_final) falta.push('o período (data inicial e final)');
        else if (v.data_final < v.data_inicial) throw new RuleError('A data final é antes da data inicial.');
      } else {
        v.descricao = txt(b.descricao); // observação opcional
      }
      if (falta.length) throw new RuleError(`Falta ${falta.join(', ')}.`);
      let linhas = null;
      if (tipo === 'acumulado' && subtipo === 'correcao') {
        const l = lerLinhas(b.linhas);
        if (l.avisos.length && !b.confirmar) throw new RuleError(`Aviso: ${l.avisos.join(' ')}`, 409, { avisos: l.avisos });
        linhas = l.linhas;
      }
      const arquivoId = b.arquivo_id ? Number(b.arquivo_id) : null;
      if (arquivoId) {
        const a = await t.get('SELECT dono_id, pedido_id FROM solicitacoes_arquivos WHERE id = ?', arquivoId);
        if (!a || a.dono_id !== user.id || a.pedido_id) throw new RuleError('Planilha inválida. Anexe de novo.');
      }
      return { v, linhas, arquivoId };
    }
    async function gravarLinhas(t, pid, linhas) {
      await t.run('DELETE FROM solicitacoes_linhas WHERE pedido_id = ?', pid);
      if (!linhas.length) return;
      // todas as linhas num INSERT só
      const valores = linhas.flatMap((l) => [pid, l.ordem, l.cod_visita, l.documento, l.data, l.negativa, l.declarada, l.positiva, l.participante]);
      await t.run(`INSERT INTO solicitacoes_linhas (pedido_id, ordem, cod_visita, documento, data, negativa, declarada, positiva, participante)
        VALUES ${linhas.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`, ...valores);
    }
    async function ligarArquivo(t, pid, arquivoId) {
      await t.run('UPDATE solicitacoes_arquivos SET ativo = FALSE WHERE pedido_id = ?', pid);
      await t.run('UPDATE solicitacoes_arquivos SET pedido_id = ?, ativo = TRUE WHERE id = ?', pid, arquivoId);
    }

    // ============================================================ SOLICITANTE
    r.get('/meus', sol, ler(async (req) => (await db.all(`${PEDIDOS} WHERE p.solicitante_id = ? ORDER BY p.id DESC`, req.user.id)).map(resumo)));

    r.post('/meus', sol, h(async (req, t) => {
      const b = req.body || {};
      const tipo = TIPOS[b.tipo] ? b.tipo : null;
      if (!tipo) throw new RuleError('Escolha o tipo da solicitação.');
      const subtipo = tipo === 'acumulado' ? (SUBTIPOS[b.subtipo] ? b.subtipo : null) : null;
      if (tipo === 'acumulado' && !subtipo) throw new RuleError('Escolha o tipo de acumulado.');
      const { v, linhas, arquivoId } = await lerPedido(t, b, { tipo, subtipo }, req.user);
      if (precisaAnexo(tipo, subtipo) && !arquivoId) throw new RuleError('Falta o anexo Excel.');
      const { id } = await t.get(`INSERT INTO solicitacoes_pedidos (solicitante_id, solicitante_nome, solicitante_email, projeto, tipo, subtipo, cod_visita, id_carga, motivo, titulo, descricao, data_inicial, data_final)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, req.user.id, req.user.name, req.user.email, v.projeto, tipo, subtipo, v.cod_visita, v.id_carga, v.motivo, v.titulo, v.descricao, v.data_inicial, v.data_final);
      await t.run('UPDATE solicitacoes_pedidos SET codigo = ? WHERE id = ?', codigoPedido(id), id);
      if (linhas) await gravarLinhas(t, id, linhas);
      if (arquivoId) await ligarArquivo(t, id, arquivoId);
      await msg(t, id, 'sistema', req.user, 'Solicitação criada.');
      const p = await getPedido(t, id);
      await paraCentral(t, p, `Nova solicitação ${p.codigo}`, `<b>Nova solicitação</b><br><br>${p.codigo} · ${tipoLabel(p)}<br>Solicitante: ${esc(p.solicitante_nome)}<br>Projeto: ${esc(p.projeto)}
        ${p.cod_visita ? `<br>Visita: ${esc(p.cod_visita)}` : ''}${p.titulo ? `<br>Título: ${esc(p.titulo)}` : ''}${linhas ? `<br>Linhas: ${linhas.length}` : ''}`);
      return { id, codigo: p.codigo };
    }));

    const meu = async (t, req) => {
      const p = await getPedido(t, req.params.id);
      if (p.solicitante_id !== req.user.id) throw new RuleError('Solicitação não encontrada', 404);
      return p;
    };

    r.put('/meus/:id', sol, h(async (req, t) => {
      const p = await meu(t, req);
      if (!EDITAVEIS.includes(p.status)) throw new RuleError('Só dá para editar solicitações pendentes ou devolvidas para correção.');
      const b = req.body || {};
      const { v, linhas, arquivoId } = await lerPedido(t, b, p, req.user);
      if (precisaAnexo(p.tipo, p.subtipo) && !arquivoId && !p.anexo) throw new RuleError('Falta o anexo Excel.');
      const eraCorrecao = p.status === 'correcao';
      await t.run(`UPDATE solicitacoes_pedidos SET projeto = ?, cod_visita = ?, id_carga = ?, motivo = ?, titulo = ?, descricao = ?, data_inicial = ?, data_final = ?,
        status = 'pendente', updated_at = now() WHERE id = ?`, v.projeto, v.cod_visita, v.id_carga, v.motivo, v.titulo, v.descricao, v.data_inicial, v.data_final, p.id);
      if (linhas) await gravarLinhas(t, p.id, linhas);
      if (arquivoId) await ligarArquivo(t, p.id, arquivoId);
      const texto = `${eraCorrecao ? 'Solicitação corrigida e reenviada' : 'Solicitação editada'} pelo solicitante${arquivoId ? ' (planilha nova anexada)' : ''}.`;
      await msg(t, p.id, 'solicitante', req.user, texto);
      if (eraCorrecao) await paraCentral(t, p, `${p.codigo} corrigida`, `${esc(p.solicitante_nome)} corrigiu a solicitação <b>${p.codigo}</b> (${tipoLabel(p)}). Ela voltou para Pendentes.`);
      return completo(t, await getPedido(t, p.id));
    }));

    r.post('/meus/:id/cancelar', sol, h(async (req, t) => {
      const p = await meu(t, req);
      if (!EDITAVEIS.includes(p.status)) throw new RuleError('Só dá para cancelar solicitações pendentes ou devolvidas para correção.');
      await t.run("UPDATE solicitacoes_pedidos SET status = 'cancelado', updated_at = now() WHERE id = ?", p.id);
      await msg(t, p.id, 'sistema', req.user, `Cancelada por ${req.user.name}.`);
    }));

    // ============================================================ os dois lados
    r.get('/pedidos/:id', ler(async (req) => {
      const p = await getPedido(db, req.params.id);
      if (!podeVer(req, p)) throw new RuleError('Solicitação não encontrada', 404);
      await marcarLidas(db, req, p);
      return completo(db, await getPedido(db, p.id));
    }));

    // Só a conversa (a tela consulta de tempos em tempos enquanto o pedido está aberto)
    r.get('/pedidos/:id/mensagens', ler(async (req) => {
      const p = await db.get('SELECT id, solicitante_id FROM solicitacoes_pedidos WHERE id = ?', Number(req.params.id) || 0);
      if (!p || !podeVer(req, p)) throw new RuleError('Solicitação não encontrada', 404);
      await marcarLidas(db, req, p);
      return { mensagens: await mensagens(db, p.id) };
    }));

    r.post('/pedidos/:id/mensagens', h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      if (!podeVer(req, p)) throw new RuleError('Solicitação não encontrada', 404);
      const texto = txt(req.body?.texto, 4000);
      if (!texto) throw new RuleError('Escreva a mensagem antes de enviar.');
      const papel = req.body?.lado === 'central' && isCentral(req) ? 'central' : 'solicitante';
      if (papel === 'solicitante' && p.solicitante_id !== req.user.id) throw new RuleError('Só o solicitante escreve deste lado.', 403);
      await msg(t, p.id, papel, req.user, texto);
      await t.run('UPDATE solicitacoes_pedidos SET updated_at = now() WHERE id = ?', p.id);
      const corpo = `<b>${esc(req.user.name)}</b> escreveu sobre a solicitação <b>${p.codigo}</b> (${tipoLabel(p)}):<br><br>${esc(texto).replace(/\n/g, '<br>')}`;
      if (papel === 'central') await paraSolicitante(t, p, `${p.codigo} · mensagem da central`, corpo);
      else await paraCentral(t, p, `${p.codigo} · mensagem do solicitante`, corpo);
      return { mensagens: await mensagens(t, p.id) };
    }));

    // ============================================================ CENTRAL
    r.get('/central/pedidos', cen, ler(async (req) => {
      // feitos/cancelados: últimos 60 dias, a não ser que peça todos
      const antigos = req.query.todos === '1' ? 'TRUE' : "p.updated_at >= now() - interval '60 days'";
      return (await db.all(`${PEDIDOS} WHERE p.status IN ('pendente','analise','correcao') OR ${antigos} ORDER BY p.id DESC`)).map(resumo);
    }));

    r.post('/central/pedidos/:id/status', cen, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      const novo = String(req.body?.status || '');
      const texto = txt(req.body?.mensagem, 4000);
      if (p.status === 'cancelado') throw new RuleError('Solicitação cancelada pelo solicitante.');
      if (!['analise', 'correcao', 'feito', 'pendente'].includes(novo)) throw new RuleError('Situação inválida.');
      if (novo === p.status) throw new RuleError(`A solicitação já está em "${STATUS[novo]}".`);
      if (novo === 'correcao' && !texto) throw new RuleError('Explique o que está errado para o solicitante corrigir.');
      await t.run(`UPDATE solicitacoes_pedidos SET status = ?, obs_central = COALESCE(?, obs_central), responsavel_id = ?, responsavel_nome = ?,
        concluido_at = ${novo === 'feito' ? 'now()' : 'NULL'}, updated_at = now() WHERE id = ?`, novo, texto, req.user.id, req.user.name, p.id);
      const rotulo = { analise: 'Em análise', correcao: 'Devolvida para correção', feito: 'Concluída', pendente: 'Voltou para pendente' }[novo];
      await msg(t, p.id, 'sistema', req.user, `${rotulo} por ${req.user.name}.`);
      if (texto) await msg(t, p.id, 'central', req.user, texto);
      if (novo === 'feito') {
        await paraSolicitante(t, p, `${p.codigo} concluída`, `Olá ${esc(p.solicitante_nome)},<br><br>Sua solicitação <b>${p.codigo}</b> (${tipoLabel(p)}) foi concluída pela central.<br><br>Observação: ${texto ? esc(texto) : 'sem observação.'}`);
      } else if (novo === 'correcao') {
        await paraSolicitante(t, p, `${p.codigo} precisa de correção`, `Olá ${esc(p.solicitante_nome)},<br><br>A central encontrou um problema na solicitação <b>${p.codigo}</b> (${tipoLabel(p)}):<br><br>
          ${esc(texto).replace(/\n/g, '<br>')}<br><br>Abra a solicitação no HUB, corrija e reenvie.`);
      }
      return completo(t, await getPedido(t, p.id));
    }));

    const baixarXlsx = (res, nome, xlsx) => {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
      res.send(xlsx);
    };

    r.get('/central/pedidos/:id/linhas.xlsx', cen, ler(async (req, res) => {
      const p = await getPedido(db, req.params.id);
      const linhas = await db.all('SELECT cod_visita, documento, data, negativa, declarada, positiva, participante FROM solicitacoes_linhas WHERE pedido_id = ? ORDER BY ordem', p.id);
      baixarXlsx(res, `${p.codigo}-correcao.xlsx`, files.xlsx([{ name: p.codigo, columns: [{ label: 'Código da visita', width: 18 }, { label: 'CNPJ / CPF', width: 20 }, { label: 'Data', type: 'date' },
        { label: 'Negativa', width: 12 }, { label: 'Declarada', width: 12 }, { label: 'Positiva', width: 12 }, { label: 'Participante', width: 12 }],
        rows: linhas.map((l) => [l.cod_visita, fmtDoc(l.documento), l.data, l.negativa, l.declarada, l.positiva, l.participante]) }]));
    }));

    r.get('/central/exportar', cen, ler(async (_req, res) => {
      const ps = (await db.all(`${PEDIDOS} ORDER BY p.id`)).map(resumo);
      baixarXlsx(res, `solicitacoes-${hoje()}.xlsx`, files.xlsx([{ name: 'Solicitações', columns: [{ label: 'ID', width: 10 }, { label: 'Data', width: 17 }, { label: 'Solicitante', width: 24 }, { label: 'Projeto', width: 14 },
        { label: 'Tipo', width: 24 }, { label: 'Status', width: 18 }, { label: 'Código da visita', width: 16 }, { label: 'ID da carga', width: 14 }, { label: 'Título', width: 24 },
        { label: 'Período', width: 22 }, { label: 'Motivo', width: 30 }, { label: 'Descrição', width: 40 }, { label: 'Linhas', width: 8 }, { label: 'Anexo', width: 26 },
        { label: 'Responsável', width: 20 }, { label: 'Observação da central', width: 40 }, { label: 'Concluído em', width: 17 }],
        rows: ps.map((p) => [p.codigo, p.created_at, p.solicitante_nome, p.projeto, p.tipo_label, p.status_label, p.cod_visita, p.id_carga, p.titulo,
          p.data_inicial ? `${p.data_inicial} a ${p.data_final}` : '', p.motivo, p.descricao, p.linhas_qtd || '', p.anexo?.nome || '', p.responsavel_nome, p.obs_central, p.concluido_at]) }]));
    }));

    // projetos
    r.get('/central/projetos', cen, ler(() => db.all('SELECT id, nome, ativo FROM solicitacoes_projetos ORDER BY id')));
    r.post('/central/projetos', cen, h(async (req, t) => {
      const nome = txt(req.body?.nome, 80);
      if (!nome) throw new RuleError('Informe o nome do projeto.');
      if (await t.get('SELECT 1 FROM solicitacoes_projetos WHERE lower(nome) = lower(?)', nome)) throw new RuleError('Projeto já existe.');
      await t.run('INSERT INTO solicitacoes_projetos (nome) VALUES (?)', nome);
    }));
    r.put('/central/projetos/:id', cen, h(async (req, t) => {
      await t.run('UPDATE solicitacoes_projetos SET ativo = ? WHERE id = ?', !!req.body?.ativo, Number(req.params.id) || 0);
    }));
  },
};
