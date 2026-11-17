import express from 'express';
import { pg } from './pg.js';
import { a, hashPassword } from './auth.js';
import { auditar, desbloquearEmail, hashToken, ipDe, novoToken, urlBase, validarSenha } from './lib/seguranca.js';
import { registry, versoesDoBanco } from './moduleLoader.js';
import { aiCarregar, aiConfigPublica, aiSalvar, aiTestar, aiUso } from './lib/ai.js';
import { ErroRelatorio, enviarExcel, gerarExcel, sistemasComRelatorio } from './relatorios.js';

// 'rtv' existe como perfil, mas ainda não dá acesso a nenhuma tela (ver moduleLoader.js).
const ROLES = new Set(['solicitante', 'central', 'ambos', 'rtv']);
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
  if (password) { const e = validarSenha(password, email); if (e) return e; }
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
    await auditar('usuario_criado', { usuario: req.user, ip: ipDe(req), detalhe: `${email} (${is_admin ? 'admin' : 'comum'}) acessos: ${JSON.stringify(access || {})}` });
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
    await auditar('usuario_alterado', { usuario: req.user, ip: ipDe(req), detalhe: `${email} admin=${!!is_admin} ativo=${!!active}${password ? ' senha trocada' : ''} acessos: ${JSON.stringify(access || {})}` });
    res.json({ ok: true });
  }));

  r.delete('/users/:id', a(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'Você não pode excluir a si mesmo' });
    const alvo = await pg.get('SELECT email FROM users WHERE id = ?', id);
    await pg.run('DELETE FROM users WHERE id = ?', id);
    await auditar('usuario_excluido', { usuario: req.user, ip: ipDe(req), detalhe: alvo?.email });
    res.json({ ok: true });
  }));

  // Link para a pessoa criar uma nova senha (vale 30 minutos, uma vez). Enquanto o envio de e-mail não está ligado,
  // a administração entrega este link. O token só aparece aqui; no banco fica apenas o hash.
  r.post('/users/:id/reset-link', a(async (req, res) => {
    const id = Number(req.params.id);
    const u = await pg.get('SELECT id, email, active FROM users WHERE id = ?', id);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (!u.active) return res.status(400).json({ error: 'A conta está desativada' });
    const token = novoToken();
    await pg.tx(async (t) => {
      await t.run('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL', id);
      await t.run(`INSERT INTO password_resets (user_id, token_hash, expires_at, criado_por) VALUES (?, ?, now() + interval '30 minutes', ?)`, id, hashToken(token), req.user.id);
    });
    await auditar('senha_link_gerado', { usuario: req.user, ip: ipDe(req), detalhe: u.email });
    res.json({ link: `${urlBase()}/redefinir-senha?token=${token}`, expira_em_min: 30 });
  }));

  // Libera quem foi bloqueado por excesso de tentativas de login
  r.post('/users/:id/desbloquear', a(async (req, res) => {
    const u = await pg.get('SELECT email FROM users WHERE id = ?', Number(req.params.id));
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    await desbloquearEmail(u.email.toLowerCase());
    await auditar('login_desbloqueado', { usuario: req.user, ip: ipDe(req), detalhe: u.email });
    res.json({ ok: true });
  }));

  r.get('/auditoria', a(async (_req, res) => {
    res.json(await pg.all('SELECT id, usuario_email, acao, detalhe, ip, created_at FROM audit_log ORDER BY id DESC LIMIT 300'));
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
  r.get('/relatorios', a(async (_req, res) => res.json((await sistemasComRelatorio()).map((m) => ({ key: m.key, title: m.title, icon: m.icon, labels: m.labels })))));

  // /relatorios/<chave>.xlsx ou /relatorios/todos.xlsx  ?de=AAAA-MM-DD&ate=AAAA-MM-DD
  r.get('/relatorios/:arq', a(async (req, res) => {
    const m = String(req.params.arq).match(/^([\w-]+)\.xlsx$/);
    if (!m) return res.status(404).json({ error: 'Relatório não encontrado' });
    try {
      enviarExcel(res, await gerarExcel({ chave: m[1], de: req.query.de, ate: req.query.ate, quem: req.user.name }));
    } catch (e) {
      if (e instanceof ErroRelatorio) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  }));

  return r;
}
