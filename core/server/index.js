import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './db.js';
import { pg } from './pg.js';
import { migrarNucleo } from './schema.js';
import {
  a, loadUser, requireAuth, requireAdmin, createSession, destroySession,
  verifyPassword, hashPassword, cleanExpiredSessions,
} from './auth.js';
import { loadModules, moduleSummary, moduleNotificacoes, registry } from './moduleLoader.js';
import { adminRouter } from './admin.js';
import { aiIniciar } from './lib/ai.js';

const portArg = process.argv.find((x) => x.startsWith('--port='));
const PORT = Number(portArg?.split('=')[1]) || Number(process.env.PORT) || 3001;
// Em hospedagem serverless (Vercel) as tabelas são criadas pelo "npm run migrate", não a cada partida.
const SERVERLESS = !!process.env.VERCEL;

console.log(`[banco] ${pg.onde}`);
if (!SERVERLESS) await migrarNucleo();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use('/api', loadUser);

// ---------- Autenticação ----------
app.post('/api/auth/login', a(async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const password = String(req.body?.password || '');
  const user = await pg.get('SELECT id, password_hash, active FROM users WHERE lower(email) = lower(?)', email);
  if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  if (!user.active) return res.status(403).json({ error: 'Usuário desativado. Procure a administração.' });
  await createSession(res, user.id);
  res.json({ ok: true });
}));

app.post('/api/auth/logout', a(async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
}));

/** Sistemas liberados para a pessoa, já sem os que falharam ao carregar. */
async function sistemasDoUsuario(userId, { soAtivos = false } = {}) {
  const rows = await pg.all(`
    SELECT m.key, m.status, m.sort_order, um.role
    FROM user_modules um JOIN modules m ON m.key = um.module_key
    WHERE um.user_id = ? AND m.enabled ${soAtivos ? "AND m.status = 'ativo'" : ''}
    ORDER BY m.sort_order, m.key
  `, userId);
  return rows.filter((r) => registry.has(r.key) && !registry.get(r.key).error);
}

// ---------- Usuário logado + cards visíveis ----------
app.get('/api/me', requireAuth, a(async (req, res) => {
  const rows = await sistemasDoUsuario(req.user.id);
  const modules = await Promise.all(rows.map(async (r) => {
    const { manifest } = registry.get(r.key);
    return {
      key: r.key,
      title: manifest.title,
      description: manifest.description,
      icon: manifest.icon,
      labels: manifest.labels || { solicitante: 'Solicitar', central: 'Central' },
      status: r.status,
      role: r.role,
      summary: r.status === 'ativo' ? await moduleSummary(r.key, req.user, r.role) : null,
    };
  }));
  res.json({ user: { ...req.user, is_admin: !!req.user.is_admin }, modules });
}));

// ---------- Sininho: pendências do usuário (todos os sistemas, ou só um com ?modulo=chave) ----------
app.get('/api/notificacoes', requireAuth, a(async (req, res) => {
  const so = req.query.modulo ? String(req.query.modulo) : null;
  const mods = (await sistemasDoUsuario(req.user.id, { soAtivos: true })).filter((m) => !so || m.key === so);
  const grupos = await Promise.all(mods.map(async (m) => {
    const { manifest } = registry.get(m.key);
    return (await moduleNotificacoes(m.key, req.user, m.role)).map((n) => ({ ...n, modulo: m.key, modulo_titulo: manifest.title, icone: manifest.icon }));
  }));
  const itens = grupos.flat();
  res.json({ total: itens.reduce((s, n) => s + n.qtd, 0), itens });
}));

app.post('/api/me/password', requireAuth, a(async (req, res) => {
  const { current, next } = req.body || {};
  const row = await pg.get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(String(current || ''), row.password_hash)) return res.status(400).json({ error: 'Senha atual incorreta' });
  if (!next || String(next).length < 6) return res.status(400).json({ error: 'A nova senha precisa ter ao menos 6 caracteres' });
  await pg.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(String(next)), req.user.id);
  res.json({ ok: true });
}));

app.use('/api/admin', requireAuth, requireAdmin, adminRouter());

// ---------- Sistemas ----------
await loadModules(app, { migrar: !SERVERLESS });
await aiIniciar();

// Primeiro uso: cria o administrador com acesso total
if (!SERVERLESS && !(await pg.get('SELECT 1 FROM users LIMIT 1'))) {
  const email = (process.env.QIMA_ADMIN_EMAIL || 'admin@qima.local').toLowerCase();
  const password = process.env.QIMA_ADMIN_PASSWORD || 'admin123';
  await pg.tx(async (t) => {
    const { id } = await t.get('INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, TRUE) RETURNING id', 'Administrador', email, hashPassword(password));
    for (const key of registry.keys()) await t.run('INSERT INTO user_modules (user_id, module_key, role) VALUES (?, ?, ?)', id, key, 'ambos');
  });
  console.log(`Administrador inicial criado: ${email} (troque a senha após o primeiro acesso)`);
}
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// Produção fora da Vercel: serve o frontend compilado (na Vercel os arquivos do site são servidos por ela)
const dist = path.join(ROOT, 'dist');
if (!SERVERLESS && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  if (!res.headersSent) res.status(500).json({ error: 'Erro interno' });
});

if (!SERVERLESS) {
  await cleanExpiredSessions();
  setInterval(() => cleanExpiredSessions().catch(() => {}), 60 * 60 * 1000).unref();
  app.listen(PORT, () => console.log(`QIMA HUB API em http://localhost:${PORT}`));
}

export default app;
