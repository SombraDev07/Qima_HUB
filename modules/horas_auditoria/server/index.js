// Backend do sistema Horas de Auditoria.
//  Planejamento (solicitante): lança as horas por distrito e semana num rascunho e envia para aprovação.
//  Central: compara o antigo com o novo e aprova ou reprova. Reprovou? A versão aprovada continua valendo.
//
// Banco: Postgres (assíncrono). Dentro de uma transação (rotas com "h") use sempre o "t".
import migrations from './migrations.js';
import relatorio from './relatorio.js';
import {
  RuleError, MODS, TAXAS_PADRAO, MAX_SEMANAS, isDate, txt, txtLivre, esc, json, n0,
  lerHoras, horasVazias, lerValor, lerTaxas, calcular, resumir, celulasAlteradas, ACOES,
} from './regras.js';

const dataTxt = (v) => String(v ?? '').slice(0, 10);
const plano = (p) => p && ({
  id: p.id, nome: p.nome, inicio: dataTxt(p.inicio), semanas: p.semanas, horas_por_auditor: n0(p.horas_por_auditor),
  aud_veic_a: n0(p.aud_veic_a), aud_veic_b: n0(p.aud_veic_b), taxas: json(p.taxas),
});

export default {
  banco: 'postgres',
  migrations,
  relatorio,

  async summary({ db, user, isCentral }) {
    if (isCentral) {
      const r = await db.get(`SELECT COUNT(*) FILTER (WHERE status = 'pendente') AS pend, (SELECT COUNT(*) FROM horas_planejamentos) AS planos FROM horas_versoes`);
      return `${r.pend} aguardando aprovação · ${r.planos} planejamento(s)`;
    }
    const r = await db.get(`SELECT COUNT(*) FILTER (WHERE status = 'rascunho') AS rasc, COUNT(*) FILTER (WHERE status = 'pendente') AS pend,
      COUNT(*) FILTER (WHERE status = 'rascunho' AND motivo IS NOT NULL) AS rep FROM horas_versoes WHERE status IN ('rascunho','pendente')`);
    return `${r.pend} em análise · ${r.rasc} rascunho(s)${r.rep ? ` · ${r.rep} reprovado(s)` : ''}`;
  },

  async notificacoes({ db, user, isCentral, isSolicitante }) {
    const out = [];
    if (isCentral) {
      const r = await db.get("SELECT COUNT(*) AS n FROM horas_versoes WHERE status = 'pendente'");
      out.push({ central: true, qtd: r.n, texto: 'alteração(ões) de horas aguardando aprovação' });
    }
    if (isSolicitante) {
      const r = await db.get("SELECT COUNT(*) AS n FROM horas_versoes WHERE status = 'rascunho' AND motivo IS NOT NULL");
      out.push({ link: 'solicitante', qtd: r.n, texto: 'planejamento(s) reprovado(s) para ajustar' });
    }
    return out;
  },

  router(r, ctx) {
    const { db, requireRole, notify, usuariosComPerfil } = ctx;
    const sol = requireRole('solicitante'); // a central também passa
    const cen = requireRole('central');

    function erro(res, err) {
      if (err instanceof RuleError) return res.status(err.status).json({ error: err.message, ...err.extra });
      console.error('[horas_auditoria]', err);
      if (!res.headersSent) res.status(500).json({ error: 'Erro interno' });
    }
    const ler = (fn) => async (req, res) => {
      try { const out = await fn(req, res); if (!res.headersSent) res.json(out ?? { ok: true }); } catch (e) { erro(res, e); }
    };
    const h = (fn) => async (req, res) => {
      try { const out = await db.tx((t) => fn(req, t)); res.json(out ?? { ok: true }); } catch (e) { erro(res, e); }
    };
    const mail = (corpo) => `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6">${corpo}</div>`;

    // ------------------------------------------------------------ leitura
    async function getPlano(t, id, lock = false) {
      const p = await t.get(`SELECT * FROM horas_planejamentos WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, Number(id) || 0);
      if (!p) throw new RuleError('Planejamento não encontrado', 404);
      return plano(p);
    }
    const versaoView = (v) => v && ({
      id: v.id, status: v.status, horas: json(v.horas), prog: n0(v.prog), rev: v.rev, motivo: v.motivo, nota: v.nota,
      por: v.criado_por_nome, enviado_em: v.enviado_em, decidido_em: v.decidido_em, decidido_por: v.decidido_por_nome, atualizado: v.updated_at,
    });
    async function distritosDe(t, planoId) {
      const rows = await t.all(`SELECT d.id, d.nome, a.id AS a_id, o.id AS o_id FROM horas_distritos d
        LEFT JOIN horas_versoes a ON a.id = d.aprovada_id
        LEFT JOIN horas_versoes o ON o.distrito_id = d.id AND o.status IN ('rascunho','pendente')
        WHERE d.planejamento_id = ? ORDER BY d.id`, planoId);
      const idsV = rows.flatMap((x) => [x.a_id, x.o_id]).filter(Boolean).map(Number);
      const vs = idsV.length ? await t.all(`SELECT * FROM horas_versoes WHERE id IN (${idsV.join(',')})`) : [];
      const porId = new Map(vs.map((v) => [v.id, versaoView(v)]));
      return rows.map((x) => ({ id: x.id, nome: x.nome, aprovada: porId.get(x.a_id) || null, aberta: porId.get(x.o_id) || null }));
    }
    async function evento(t, p, d, v, acao, user, nota, resumo) {
      const { snap, ...leve } = resumo || {};
      await t.run(`INSERT INTO horas_eventos (planejamento_id, distrito_id, versao_id, distrito_nome, acao, por_id, por_nome, nota, resumo, snap)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)`, p.id, d?.id ?? null, v?.id ?? null, d?.nome ?? null, acao, user?.id ?? null, user?.name ?? 'Sistema', nota || null,
      resumo ? JSON.stringify(leve) : null, snap ? JSON.stringify(snap) : null);
    }
    const quemEnviou = (v) => ({ nome: v.criado_por_nome, email: v.criado_por_email });

    r.get('/config', ler(async () => ({ modulos: MODS, taxas_padrao: TAXAS_PADRAO, acoes: ACOES, max_semanas: MAX_SEMANAS })));

    r.get('/planejamentos', sol, ler(async () => {
      const ps = await db.all('SELECT * FROM horas_planejamentos ORDER BY id DESC');
      const out = [];
      for (const p of ps.map(plano)) {
        const ds = await distritosDe(db, p.id);
        const tot = ds.reduce((s, d) => { const c = calcular(p, d.aprovada?.horas, d.aprovada?.prog); return { horas: s.horas + c.horas, budget: s.budget + c.budget, prog: s.prog + c.prog }; }, { horas: 0, budget: 0, prog: 0 });
        out.push({ ...p, distritos: ds.length, pendentes: ds.filter((d) => d.aberta?.status === 'pendente').length, rascunhos: ds.filter((d) => d.aberta?.status === 'rascunho').length, ...tot });
      }
      return out;
    }));

    r.get('/planejamentos/:id', sol, ler(async (req) => {
      const p = await getPlano(db, req.params.id);
      return { plano: p, distritos: await distritosDe(db, p.id) };
    }));

    // ------------------------------------------------------------ planejador: rascunho e envio
    r.put('/distritos/:id/rascunho', sol, h(async (req, t) => {
      const d = await t.get('SELECT * FROM horas_distritos WHERE id = ? FOR UPDATE', Number(req.params.id) || 0);
      if (!d) throw new RuleError('Distrito não encontrado', 404);
      const p = await getPlano(t, d.planejamento_id);
      const horas = lerHoras(req.body?.horas, p.semanas), prog = lerValor(req.body?.prog, 'Budget programado');
      let v = await t.get("SELECT * FROM horas_versoes WHERE distrito_id = ? AND status IN ('rascunho','pendente') FOR UPDATE", d.id);
      if (v?.status === 'pendente') throw new RuleError('Este distrito está aguardando a Central. Espere a resposta para editar.', 409);
      if (!v) {
        v = await t.get(`INSERT INTO horas_versoes (distrito_id, status, horas, prog, base_id, criado_por_id, criado_por_nome, criado_por_email)
          VALUES (?, 'rascunho', ?::jsonb, ?, ?, ?, ?, ?) RETURNING *`, d.id, JSON.stringify(horas), prog, d.aprovada_id, req.user.id, req.user.name, req.user.email);
      } else {
        if (Number(req.body?.rev) !== v.rev) throw new RuleError('Outra pessoa alterou este rascunho. Atualize a página para ver as mudanças.', 409, { atual: versaoView(v) });
        v = await t.get(`UPDATE horas_versoes SET horas = ?::jsonb, prog = ?, rev = rev + 1, updated_at = now(),
          criado_por_id = ?, criado_por_nome = ?, criado_por_email = ? WHERE id = ? RETURNING *`,
        JSON.stringify(horas), prog, req.user.id, req.user.name, req.user.email, v.id);
      }
      return versaoView(v);
    }));

    r.post('/distritos/:id/enviar', sol, h(async (req, t) => {
      const d = await t.get('SELECT * FROM horas_distritos WHERE id = ? FOR UPDATE', Number(req.params.id) || 0);
      if (!d) throw new RuleError('Distrito não encontrado', 404);
      const p = await getPlano(t, d.planejamento_id);
      const v = await t.get("SELECT * FROM horas_versoes WHERE distrito_id = ? AND status = 'rascunho' FOR UPDATE", d.id);
      if (!v) throw new RuleError('Não há alterações para enviar neste distrito.');
      const base = await t.get('SELECT * FROM horas_versoes WHERE id = ?', d.aprovada_id);
      const antes = { horas: json(base.horas), prog: n0(base.prog) }, depois = { horas: json(v.horas), prog: n0(v.prog) };
      const resumo = resumir(p, antes, depois);
      if (!resumo.celulas && resumo.prog_antes === resumo.prog_depois) throw new RuleError('Nada mudou em relação à versão aprovada.');
      const nota = txtLivre(req.body?.nota, 500);
      const novo = await t.get(`UPDATE horas_versoes SET status = 'pendente', nota = ?, motivo = NULL, enviado_em = now(), updated_at = now(),
        criado_por_id = ?, criado_por_nome = ?, criado_por_email = ? WHERE id = ? RETURNING *`, nota, req.user.id, req.user.name, req.user.email, v.id);
      await evento(t, p, d, novo, 'enviada', req.user, nota, resumo);
      for (const u of await usuariosComPerfil('central', t)) {
        await notify(u.email, `QIMA Horas de Auditoria · ${d.nome} aguarda aprovação`,
          mail(`<p>${esc(req.user.name)} enviou alterações em <b>${esc(d.nome)}</b> (${esc(p.nome)}).</p><p>Horas: ${resumo.horas_antes} → <b>${resumo.horas_depois}</b> · ${resumo.celulas} célula(s) alterada(s).</p>${nota ? `<p>“${esc(nota)}”</p>` : ''}`), t);
      }
      return versaoView(novo);
    }));

    r.post('/distritos/:id/descartar', sol, h(async (req, t) => {
      const d = await t.get('SELECT * FROM horas_distritos WHERE id = ? FOR UPDATE', Number(req.params.id) || 0);
      if (!d) throw new RuleError('Distrito não encontrado', 404);
      const p = await getPlano(t, d.planejamento_id);
      const v = await t.get("SELECT * FROM horas_versoes WHERE distrito_id = ? AND status = 'rascunho' FOR UPDATE", d.id);
      if (!v) throw new RuleError('Não há rascunho para descartar.');
      await t.run('DELETE FROM horas_versoes WHERE id = ?', v.id);
      await evento(t, p, d, v, 'descartada', req.user, null, null);
    }));

    // ------------------------------------------------------------ Central: aprovar e reprovar
    async function pendenteDe(t, id) {
      const v = await t.get("SELECT * FROM horas_versoes WHERE id = ? AND status = 'pendente' FOR UPDATE", Number(id) || 0);
      if (!v) throw new RuleError('Esta alteração já foi respondida ou não existe.', 409);
      const d = await t.get('SELECT * FROM horas_distritos WHERE id = ?', v.distrito_id);
      return { v, d, p: await getPlano(t, d.planejamento_id) };
    }
    const avisar = async (t, v, assunto, corpo) => { if (v.criado_por_email) await notify(v.criado_por_email, `QIMA Horas de Auditoria · ${assunto}`, mail(corpo), t); };

    r.post('/central/versoes/:id/aprovar', cen, h(async (req, t) => {
      const { v, d, p } = await pendenteDe(t, req.params.id);
      const base = await t.get('SELECT * FROM horas_versoes WHERE id = ?', d.aprovada_id);
      const resumo = resumir(p, { horas: json(base.horas), prog: n0(base.prog) }, { horas: json(v.horas), prog: n0(v.prog) });
      const nota = txtLivre(req.body?.nota, 500);
      await t.run("UPDATE horas_versoes SET status = 'substituida' WHERE id = ?", d.aprovada_id);
      await t.run("UPDATE horas_versoes SET status = 'aprovada', decidido_em = now(), decidido_por_nome = ?, updated_at = now() WHERE id = ?", req.user.name, v.id);
      await t.run('UPDATE horas_distritos SET aprovada_id = ? WHERE id = ?', v.id, d.id);
      await evento(t, p, d, v, 'aprovada', req.user, nota, resumo);
      await avisar(t, v, `${d.nome} aprovado`, `<p>${esc(req.user.name)} <b>aprovou</b> suas alterações em ${esc(d.nome)} (${esc(p.nome)}).</p>${nota ? `<p>“${esc(nota)}”</p>` : ''}`);
    }));

    r.post('/central/versoes/:id/reprovar', cen, h(async (req, t) => {
      const motivo = txtLivre(req.body?.motivo, 500);
      if (!motivo) throw new RuleError('Informe o motivo da reprovação.');
      const { v, d, p } = await pendenteDe(t, req.params.id);
      const base = await t.get('SELECT * FROM horas_versoes WHERE id = ?', d.aprovada_id);
      const resumo = resumir(p, { horas: json(base.horas), prog: n0(base.prog) }, { horas: json(v.horas), prog: n0(v.prog) });
      // volta a ser rascunho (com o motivo) para o planejador ajustar; a versão aprovada continua valendo
      await t.run("UPDATE horas_versoes SET status = 'rascunho', motivo = ?, enviado_em = NULL, decidido_em = now(), decidido_por_nome = ?, rev = rev + 1, updated_at = now() WHERE id = ?", motivo, req.user.name, v.id);
      await evento(t, p, d, v, 'reprovada', req.user, motivo, resumo);
      await avisar(t, v, `${d.nome} reprovado`, `<p>${esc(req.user.name)} <b>reprovou</b> as alterações em ${esc(d.nome)} (${esc(p.nome)}).</p><p>Motivo: ${esc(motivo)}</p><p>A versão aprovada anterior continua valendo. Ajuste e envie de novo.</p>`);
    }));

    // A Central lança horas e já deixa valendo, sem precisar aprovar a si mesma. Fica no histórico como aprovação direta.
    r.post('/central/distritos/:id/aplicar', cen, h(async (req, t) => {
      const d = await t.get('SELECT * FROM horas_distritos WHERE id = ? FOR UPDATE', Number(req.params.id) || 0);
      if (!d) throw new RuleError('Distrito não encontrado', 404);
      const p = await getPlano(t, d.planejamento_id);
      const v = await t.get("SELECT * FROM horas_versoes WHERE distrito_id = ? AND status = 'rascunho' FOR UPDATE", d.id);
      if (!v) throw new RuleError('Não há alterações para aplicar neste distrito.');
      const base = await t.get('SELECT * FROM horas_versoes WHERE id = ?', d.aprovada_id);
      const resumo = resumir(p, { horas: json(base.horas), prog: n0(base.prog) }, { horas: json(v.horas), prog: n0(v.prog) });
      if (!resumo.celulas && resumo.prog_antes === resumo.prog_depois) throw new RuleError('Nada mudou em relação à versão aprovada.');
      await t.run("UPDATE horas_versoes SET status = 'substituida' WHERE id = ?", d.aprovada_id);
      await t.run("UPDATE horas_versoes SET status = 'aprovada', motivo = NULL, enviado_em = now(), decidido_em = now(), decidido_por_nome = ?, criado_por_id = ?, criado_por_nome = ?, criado_por_email = ?, updated_at = now() WHERE id = ?",
        req.user.name, req.user.id, req.user.name, req.user.email, v.id);
      await t.run('UPDATE horas_distritos SET aprovada_id = ? WHERE id = ?', v.id, d.id);
      await evento(t, p, d, v, 'aprovada', req.user, 'Aplicado direto pela Central (sem envio para aprovação)', resumo);
    }));

    r.get('/central/pendentes', cen, ler(async () => {
      const rows = await db.all(`SELECT v.id FROM horas_versoes v JOIN horas_distritos d ON d.id = v.distrito_id WHERE v.status = 'pendente' ORDER BY v.enviado_em`);
      const out = [];
      for (const { id } of rows) { const x = await detalheVersao(db, id); if (x) out.push(x); }
      return out;
    }));

    /** Versão + a aprovada em que ela se baseou + os números dos dois lados. */
    async function detalheVersao(t, id) {
      const v = await t.get('SELECT * FROM horas_versoes WHERE id = ?', Number(id) || 0);
      if (!v) return null;
      const d = await t.get('SELECT * FROM horas_distritos WHERE id = ?', v.distrito_id);
      const p = await getPlano(t, d.planejamento_id);
      const base = await t.get('SELECT * FROM horas_versoes WHERE id = ?', v.base_id || d.aprovada_id);
      const a = { horas: json(base.horas), prog: n0(base.prog) }, b = { horas: json(v.horas), prog: n0(v.prog) };
      const A = calcular(p, a.horas, a.prog), B = calcular(p, b.horas, b.prog);
      return { plano: p, distrito: { id: d.id, nome: d.nome }, nova: versaoView(v), base: versaoView(base),
        antes: { total: A.tot, horas: A.horas, budget: A.budget, dif: A.dif, picoAud: A.picoAud, picoVec: A.picoVec },
        depois: { total: B.tot, horas: B.horas, budget: B.budget, dif: B.dif, picoAud: B.picoAud, picoVec: B.picoVec },
        celulas: celulasAlteradas(p, a.horas, b.horas) };
    }
    r.get('/versoes/:id', sol, ler(async (req) => { const x = await detalheVersao(db, req.params.id); if (!x) throw new RuleError('Versão não encontrada', 404); return x; }));

    // ------------------------------------------------------------ histórico e painel
    r.get('/historico', sol, ler(async (req) => {
      const pid = Number(req.query.plano) || null;
      const ev = await db.all(`SELECT e.id, e.planejamento_id, e.distrito_id, e.versao_id, e.distrito_nome, e.acao, e.por_id, e.por_nome, e.nota, e.resumo, (e.snap IS NOT NULL) AS tem_snap, e.created_at
        FROM horas_eventos e ${pid ? 'WHERE e.planejamento_id = ?' : ''} ORDER BY e.id DESC LIMIT 1500`, ...(pid ? [pid] : []));
      const ps = await db.all('SELECT * FROM horas_planejamentos ORDER BY id DESC');
      return { planos: ps.map(plano), eventos: ev.map((e) => ({ ...e, resumo: e.resumo ? json(e.resumo) : null })) };
    }));

    // o que foi enviado/aprovado naquele momento (antes × depois)
    r.get('/eventos/:id', sol, ler(async (req) => {
      const e = await db.get('SELECT * FROM horas_eventos WHERE id = ?', Number(req.params.id) || 0);
      const snap = e?.snap ? json(e.snap) : null;
      if (!snap) throw new RuleError('Este registro não tem as horas guardadas.', 404);
      return { plano: { ...(await getPlano(db, e.planejamento_id)), ...(snap.params || {}) }, distrito: e.distrito_nome, acao: e.acao, antes: snap.antes, depois: snap.depois };
    }));

    // ------------------------------------------------------------ Central: planejamentos, distritos, parâmetros
    function lerPlano(b) {
      const nome = txt(b.nome, 80);
      if (!nome) throw new RuleError('Informe o nome do planejamento.');
      if (!isDate(b.inicio)) throw new RuleError('Informe a data de início (semana 1).');
      const semanas = Math.round(Number(b.semanas));
      if (!Number.isInteger(semanas) || semanas < 1 || semanas > MAX_SEMANAS) throw new RuleError(`Nº de semanas de 1 a ${MAX_SEMANAS}.`);
      const hpa = Number(b.horas_por_auditor ?? 44), va = Number(b.aud_veic_a ?? 1), vb = Number(b.aud_veic_b ?? 3);
      if (![hpa, va, vb].every((n) => Number.isFinite(n) && n > 0 && n <= 1000)) throw new RuleError('Horas por auditor e auditores por veículo precisam ser maiores que zero.');
      return { nome, inicio: b.inicio, semanas, hpa, va, vb, taxas: lerTaxas(b.taxas) };
    }
    async function criarDistrito(t, p, nome, prog, horas, user, acao = 'criada') {
      const d = await t.get('INSERT INTO horas_distritos (planejamento_id, nome) VALUES (?, ?) RETURNING *', p.id, nome);
      const v = await t.get(`INSERT INTO horas_versoes (distrito_id, status, horas, prog, criado_por_id, criado_por_nome, criado_por_email, decidido_em, decidido_por_nome)
        VALUES (?, 'aprovada', ?::jsonb, ?, ?, ?, ?, now(), ?) RETURNING *`, d.id, JSON.stringify(horas), prog, user.id, user.name, user.email, user.name);
      await t.run('UPDATE horas_distritos SET aprovada_id = ? WHERE id = ?', v.id, d.id);
      const c = calcular(p, horas, prog);
      await evento(t, p, d, v, acao, user, null, { horas_depois: c.horas, budget_depois: c.budget, prog_depois: c.prog, dif_depois: c.dif, aud_depois: c.picoAud, veic_depois: c.picoVec });
      return d;
    }
    const nomeDistrito = (v) => { const n = txt(v, 80); if (!n) throw new RuleError('Informe o nome do distrito.'); return n; };
    const duplicado = (e) => (e?.code === '23505' ? new RuleError('Já existe um distrito com esse nome neste planejamento.') : e);

    // Qualquer planejador cria distritos (nasce zerado e já aprovado; as horas entram pelo rascunho e passam pela Central)
    r.post('/planejamentos/:id/distritos', sol, h(async (req, t) => {
      const p = await getPlano(t, req.params.id);
      const nome = nomeDistrito(req.body?.nome);
      try { return await criarDistrito(t, p, nome, 0, horasVazias(p.semanas), req.user); } catch (e) { throw duplicado(e); }
    }));

    r.post('/central/planejamentos', cen, h(async (req, t) => {
      const d = lerPlano(req.body || {});
      const x = await t.get(`INSERT INTO horas_planejamentos (nome, inicio, semanas, horas_por_auditor, aud_veic_a, aud_veic_b, taxas) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb) RETURNING *`,
        d.nome, d.inicio, d.semanas, d.hpa, d.va, d.vb, JSON.stringify(d.taxas));
      return plano(x);
    }));

    r.put('/central/planejamentos/:id', cen, h(async (req, t) => {
      const antigo = await getPlano(t, req.params.id, true);
      const d = lerPlano(req.body || {});
      if (d.semanas < antigo.semanas) {
        const tem = await t.get("SELECT COUNT(*) AS n FROM horas_versoes v JOIN horas_distritos s ON s.id = v.distrito_id WHERE s.planejamento_id = ? AND v.status IN ('rascunho','pendente')", antigo.id);
        if (Number(tem.n)) throw new RuleError('Há alterações em andamento. Aprove, reprove ou descarte antes de reduzir o nº de semanas.');
      }
      const x = await t.get(`UPDATE horas_planejamentos SET nome = ?, inicio = ?, semanas = ?, horas_por_auditor = ?, aud_veic_a = ?, aud_veic_b = ?, taxas = ?::jsonb, updated_at = now() WHERE id = ? RETURNING *`,
        d.nome, d.inicio, d.semanas, d.hpa, d.va, d.vb, JSON.stringify(d.taxas), antigo.id);
      const novo = plano(x);
      if (d.semanas !== antigo.semanas) { // ajusta o tamanho das horas guardadas (versões em andamento já foram barradas acima)
        for (const v of await t.all('SELECT v.id, v.horas FROM horas_versoes v JOIN horas_distritos s ON s.id = v.distrito_id WHERE s.planejamento_id = ?', antigo.id)) {
          await t.run('UPDATE horas_versoes SET horas = ?::jsonb WHERE id = ?', JSON.stringify(lerHoras(json(v.horas), d.semanas)), v.id);
        }
      }
      const mudou = JSON.stringify([antigo.taxas, antigo.semanas, antigo.inicio, antigo.horas_por_auditor, antigo.aud_veic_a, antigo.aud_veic_b]) !== JSON.stringify([novo.taxas, novo.semanas, novo.inicio, novo.horas_por_auditor, novo.aud_veic_a, novo.aud_veic_b]);
      if (mudou) await evento(t, novo, null, null, 'parametros', req.user, 'Valores por hora, semanas ou divisores alterados', null);
      return novo;
    }));

    r.delete('/central/planejamentos/:id', cen, h(async (req, t) => {
      const p = await getPlano(t, req.params.id, true);
      await t.run('DELETE FROM horas_eventos WHERE planejamento_id = ?', p.id);
      await t.run('DELETE FROM horas_planejamentos WHERE id = ?', p.id);
    }));

    r.post('/central/planejamentos/:id/distritos', cen, h(async (req, t) => {
      const p = await getPlano(t, req.params.id);
      const nome = nomeDistrito(req.body?.nome);
      try {
        const horas = req.body?.horas ? lerHoras(req.body.horas, p.semanas) : horasVazias(p.semanas);
        return await criarDistrito(t, p, nome, lerValor(req.body?.prog, 'Budget programado'), horas, req.user);
      } catch (e) { throw duplicado(e); }
    }));

    r.patch('/central/distritos/:id', cen, h(async (req, t) => {
      const nome = nomeDistrito(req.body?.nome);
      try { await t.run('UPDATE horas_distritos SET nome = ? WHERE id = ?', nome, Number(req.params.id) || 0); } catch (e) { throw duplicado(e); }
      await t.run('UPDATE horas_eventos SET distrito_nome = ? WHERE distrito_id = ?', nome, Number(req.params.id) || 0);
    }));

    r.delete('/central/distritos/:id', cen, h(async (req, t) => {
      const d = await t.get('SELECT * FROM horas_distritos WHERE id = ? FOR UPDATE', Number(req.params.id) || 0);
      if (!d) throw new RuleError('Distrito não encontrado', 404);
      await t.run('DELETE FROM horas_eventos WHERE distrito_id = ?', d.id);
      await t.run('DELETE FROM horas_distritos WHERE id = ?', d.id);
    }));

    // Traz os planejamentos do protótipo offline (arquivo "Salvar cópia .json"): vira a versão aprovada de cada distrito
    r.post('/central/importar', cen, h(async (req, t) => {
      const lista = Array.isArray(req.body?.planos) ? req.body.planos.slice(0, 10) : [];
      if (!lista.length) throw new RuleError('O arquivo não tem planejamentos.');
      const criados = [];
      for (const x of lista) {
        const d = lerPlano({ nome: x.nome, inicio: x.inicio, semanas: x.semanas, horas_por_auditor: x.horasPorAuditor, aud_veic_a: x.auditoresPorVeiculo?.A, aud_veic_b: x.auditoresPorVeiculo?.B, taxas: x.taxas });
        const row = await t.get(`INSERT INTO horas_planejamentos (nome, inicio, semanas, horas_por_auditor, aud_veic_a, aud_veic_b, taxas) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb) RETURNING *`,
          d.nome, d.inicio, d.semanas, d.hpa, d.va, d.vb, JSON.stringify(d.taxas));
        const p = plano(row);
        for (const dist of (Array.isArray(x.distritos) ? x.distritos : []).slice(0, 50)) {
          try { await criarDistrito(t, p, nomeDistrito(dist.nome), lerValor(dist.prog, 'Budget programado'), lerHoras(dist.horas, p.semanas), req.user, 'importada'); } catch (e) { throw duplicado(e); }
        }
        criados.push(p.nome);
      }
      return { criados };
    }));
  },
};
