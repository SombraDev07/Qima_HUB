import express from 'express';
import { pg } from './pg.js';
import { a, hashPassword } from './auth.js';
import { registry, moduleRelatorio, versoesDoBanco } from './moduleLoader.js';
import { aiCarregar, aiConfigPublica, aiSalvar, aiTestar, aiUso } from './lib/ai.js';
import { buildXlsx } from './lib/xlsx.js';

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const brDate = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

const ROLES = new Set(['solicitante', 'central', 'ambos']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function saveAccess(t, userId, access) {
  await t.run('DELETE FROM user_modules WHERE user_id = ?', userId);
  for (const [key, role] of Object.entries(access || {})) {
    if (registry.has(key) && ROLES.has(role)) await t.run('INSERT INTO user_modules (user_id, module_key, role) VALUES (?, ?, ?)', userId, key, role);
  }
}

function validateUser(body, { creating }) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = body.password ? String(body.password) : '';
  if (!name) return 'Informe o nome';
  if (!EMAIL_RE.test(email)) return 'E-mail inválido';
  if (creating && !password) return 'Informe uma senha';
  if (password && password.length < 6) return 'A senha precisa ter ao menos 6 caracteres';
  return null;
}

export function adminRouter() {
  const r = express.Router();

  // ---------- Usuários ----------
  r.get('/users', a(async (_req, res) => {
    // contas e perfis em 2 consultas (não uma por conta)
    const users = await pg.all('SELECT id, name, email, is_admin, active, created_at FROM users ORDER BY name');
    const acessos = {};
    for (const p of await pg.all('SELECT user_id, module_key, role FROM user_modules')) (acessos[p.user_id] ||= {})[p.module_key] = p.role;
    res.json(users.map((u) => ({ ...u, access: acessos[u.id] || {} })));
  }));

  r.post('/users', a(async (req, res) => {
    const err = validateUser(req.body, { creating: true });
    if (err) return res.status(400).json({ error: err });
    const { name, password, is_admin, active = true, access } = req.body;
    const email = String(req.body.email).trim().toLowerCase();
    if (await pg.get('SELECT 1 FROM users WHERE lower(email) = ?', email)) return res.status(409).json({ error: 'E-mail já cadastrado' });
    const id = await pg.tx(async (t) => {
      const novo = await t.get('INSERT INTO users (name, email, password_hash, is_admin, active) VALUES (?, ?, ?, ?, ?) RETURNING id',
        name.trim(), email, hashPassword(password), !!is_admin, !!active);
      await saveAccess(t, novo.id, access);
      return novo.id;
    });
    res.status(201).json({ id });
  }));

  r.put('/users/:id', a(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await pg.get('SELECT 1 FROM users WHERE id = ?', id))) return res.status(404).json({ error: 'Usuário não encontrado' });
    const err = validateUser(req.body, { creating: false });
    if (err) return res.status(400).json({ error: err });
    const { name, password, is_admin, active, access } = req.body;
    const email = String(req.body.email).trim().toLowerCase();
    if (id === req.user.id && (!is_admin || !active)) {
      return res.status(400).json({ error: 'Você não pode remover seu próprio acesso de administrador ou se desativar' });
    }
    if (await pg.get('SELECT 1 FROM users WHERE lower(email) = ? AND id <> ?', email, id)) return res.status(409).json({ error: 'E-mail já cadastrado' });
    await pg.tx(async (t) => {
      await t.run('UPDATE users SET name = ?, email = ?, is_admin = ?, active = ? WHERE id = ?', name.trim(), email, !!is_admin, !!active, id);
      if (password) await t.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), id);
      if (password || !active) await t.run('DELETE FROM sessions WHERE user_id = ?', id);
      await saveAccess(t, id, access);
    });
    res.json({ ok: true });
  }));

  r.delete('/users/:id', a(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'Você não pode excluir a si mesmo' });
    await pg.run('DELETE FROM users WHERE id = ?', id);
    res.json({ ok: true });
  }));

  // ---------- Sistemas (módulos) ----------
  const estados = async () => Object.fromEntries((await pg.all('SELECT key, status, sort_order, enabled FROM modules')).map((m) => [m.key, m]));

  r.get('/modules', a(async (_req, res) => {
    const [state, versions] = await Promise.all([estados(), versoesDoBanco()]);
    const list = [...registry.values()].map(({ manifest, error }) => ({
      key: manifest.key,
      title: manifest.title,
      description: manifest.description,
      icon: manifest.icon,
      version: manifest.version,
      labels: manifest.labels,
      dbVersion: versions[manifest.key] ?? 0,
      status: state[manifest.key]?.status ?? 'em_breve',
      sort_order: state[manifest.key]?.sort_order ?? 99,
      enabled: !!(state[manifest.key]?.enabled ?? false),
      error: error || null,
    }));
    list.sort((x, y) => x.sort_order - y.sort_order);
    res.json(list);
  }));

  r.put('/modules/:key', a(async (req, res) => {
    const { key } = req.params;
    if (!registry.has(key)) return res.status(404).json({ error: 'Sistema não encontrado' });
    const { status, sort_order, enabled } = req.body;
    if (!['ativo', 'em_breve'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
    await pg.run('UPDATE modules SET status = ?, sort_order = ?, enabled = ? WHERE key = ?', status, Number(sort_order) || 0, !!enabled, key);
    res.json({ ok: true });
  }));

  // ---------- Inteligência artificial ----------
  const sistemasIA = () => [...registry.values()].filter(({ manifest, error }) => manifest.ia && !error)
    .map(({ manifest }) => ({ key: manifest.key, title: manifest.title, icon: manifest.icon, uso: manifest.ia }));
  const telaIA = async () => ({ ...aiConfigPublica(), sistemas_ia: sistemasIA(), uso: await aiUso() });

  r.get('/ia', a(async (_req, res) => { await aiCarregar(); res.json(await telaIA()); }));

  r.put('/ia', a(async (req, res) => {
    try { await aiSalvar(req.body || {}, req.user); } catch (e) { return res.status(400).json({ error: e.message }); }
    res.json(await telaIA());
  }));

  r.post('/ia/testar', a(async (_req, res) => {
    try { res.json(await aiTestar()); } catch (e) { res.status(400).json({ error: e.message }); }
  }));

  // ---------- Relatórios (Excel por sistema, com filtro de datas) ----------
  const comRelatorio = async () => {
    const state = await estados();
    return [...registry.values()].filter(({ impl, error }) => !error && typeof impl.relatorio === 'function')
      .map(({ manifest }) => manifest)
      .sort((x, y) => (state[x.key]?.sort_order ?? 99) - (state[y.key]?.sort_order ?? 99));
  };

  r.get('/relatorios', a(async (_req, res) => res.json((await comRelatorio()).map((m) => ({ key: m.key, title: m.title, icon: m.icon, labels: m.labels })))));

  // /relatorios/<chave>.xlsx ou /relatorios/todos.xlsx  ?de=AAAA-MM-DD&ate=AAAA-MM-DD
  r.get('/relatorios/:arq', a(async (req, res) => {
    const m = String(req.params.arq).match(/^([\w-]+)\.xlsx$/);
    const { de, ate } = req.query;
    if (!m) return res.status(404).json({ error: 'Relatório não encontrado' });
    if (!isDate(de) || !isDate(ate)) return res.status(400).json({ error: 'Informe as datas de e até' });
    if (ate < de) return res.status(400).json({ error: 'A data final é antes da inicial' });
    const todos = m[1] === 'todos';
    const mods = (await comRelatorio()).filter((x) => todos || x.key === m[1]);
    if (!mods.length) return res.status(404).json({ error: 'Sistema sem relatório' });

    const abas = [];
    const resumo = [];
    for (const mod of mods) {
      let rel;
      try { rel = await moduleRelatorio(mod.key, { de, ate }); } catch (e) {
        console.error(`[relatório ${mod.key}]`, e);
        resumo.push([mod.title, null, null, `Erro ao gerar: ${e.message}`]);
        continue;
      }
      if (!rel) continue;
      const pref = todos ? `${mod.title} · ` : '';
      const lab = mod.labels || {};
      abas.push({ name: `${pref}Solicitante`, ...rel.solicitante });
      abas.push({ name: `${pref}Central`, ...rel.central });
      for (const x of rel.extras || []) abas.push({ ...x, name: `${pref}${x.name}` });
      resumo.push([mod.title, rel.solicitante.rows.length, rel.central.rows.length,
        `Aba "Solicitante" = ${lab.solicitante || 'quem pede'} · aba "Central" = ${lab.central || 'quem atende'}${(rel.extras || []).length ? ` · também: ${rel.extras.map((x) => x.name).join(', ')}` : ''}`]);
    }
    const capa = {
      name: 'Resumo',
      columns: [{ label: 'Sistema', width: 18 }, { label: 'Linhas na aba Solicitante', width: 14 }, { label: 'Linhas na aba Central', width: 14 }, { label: 'Observação', width: 90 }],
      rows: [...resumo, [], [`Período: ${brDate(de)} a ${brDate(ate)} (data de criação do pedido)`], [`Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} por ${req.user.name}`]],
    };
    const xlsx = buildXlsx([capa, ...abas]);
    const nome = `${todos ? 'qima-hub' : mods[0].key}_${de}_a_${ate}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(xlsx);
  }));

  return r;
}
