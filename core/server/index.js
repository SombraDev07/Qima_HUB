import express from 'express';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { ROOT } from './db.js';
import { pg } from './pg.js';
import { migrarNucleo } from './schema.js';
import {
  a, loadUser, requireAuth, requireAdmin, createSession, destroySession,
  verifyPasswordAsync, gastarTempoDeSenha, encerrarSessoes, criarTokenApp, revogarTokenApp, aparelhosDoUsuario, desconectarAparelho, hashPassword, cleanExpiredSessions,
} from './auth.js';
import {
  ipDe, semCache, cabecalhosSeguros, verificarOrigem, limitePorIp, bloqueio, contar, zerar, limparLimites, REGRAS, chavesLogin,
  validarSenha, novoToken, hashToken, urlBase, auditar,
} from './lib/seguranca.js';
import { loadModules, moduleSummary, moduleNotificacoes, registry } from './moduleLoader.js';
import { adminRouter } from './admin.js';
import { relatorioDoSistemaRouter, relatoriosDaCentralRouter } from './relatorios.js';
import { registrarPush, removerPush, contatoCentral, salvarContatoCentral } from './lib/app.js';
import { aiIniciar } from './lib/ai.js';

const portArg = process.argv.find((x) => x.startsWith('--port='));
const PORT = Number(portArg?.split('=')[1]) || Number(process.env.PORT) || 3001;
// Em hospedagem serverless (Vercel) as tabelas são criadas pelo "npm run migrate", não a cada partida.
const SERVERLESS = !!process.env.VERCEL;

console.log(`[banco] ${pg.onde}`);
if (!SERVERLESS) await migrarNucleo();

const app = express();
app.disable('x-powered-by');
app.use(cabecalhosSeguros);
app.use(express.json({ limit: '1mb' }));
// proteção contra abuso: rajadas por IP (geral e, mais apertado, nas rotas de login/recuperação)
app.use('/api/auth', limitePorIp({ max: 40, nome: 'auth' }));
app.use('/api', limitePorIp({ max: 900, nome: 'api' }));
app.use('/api', semCache);
app.use('/api', verificarOrigem);
app.use('/api', loadUser);

// ---------- Autenticação ----------
const aguarde = (res, min) => {
  res.setHeader('Retry-After', min * 60);
  return res.status(429).json({ error: `Muitas tentativas. Tente novamente em ${min} minuto${min > 1 ? 's' : ''}.` });
};

/** Confere e-mail e senha com limite de tentativas. Devolve o id da pessoa, ou null depois de já ter respondido o erro. */
async function autenticar(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 254);
  const password = String(req.body?.password || '');
  const ip = ipDe(req);
  const chaves = chavesLogin(email, ip);
  const espera = await bloqueio(chaves);
  if (espera) { await auditar('login_bloqueado', { email, ip }); aguarde(res, espera); return null; }
  const user = password.length <= 128 ? await pg.get('SELECT id, password_hash, active FROM users WHERE lower(email) = ?', email) : null;
  const certa = user ? await verifyPasswordAsync(password, user.password_hash) : (await gastarTempoDeSenha(password), false);
  if (!user || !certa) {
    await Promise.all([contar(chaves[0], REGRAS.par), contar(chaves[1], REGRAS.email), contar(chaves[2], REGRAS.ip)]);
    await auditar('login_falhou', { email, ip });
    res.status(401).json({ error: 'E-mail ou senha inválidos' });
    return null;
  }
  if (!user.active) { res.status(403).json({ error: 'Usuário desativado. Procure a administração.' }); return null; }
  await zerar([chaves[0], chaves[1]]);
  limparLimites().catch(() => {}); cleanExpiredSessions().catch(() => {}); // faxina barata (na Vercel não há processo em segundo plano)
  return user.id;
}

app.post('/api/auth/login', a(async (req, res) => {
  const uid = await autenticar(req, res);
  if (!uid) return;
  await createSession(res, uid);
  res.json({ ok: true });
}));

// App de celular: troca e-mail e senha por um token (guardado no aparelho). Mesmas proteções do login do site.
app.post('/api/auth/app/login', a(async (req, res) => {
  const uid = await autenticar(req, res);
  if (!uid) return;
  const t = await criarTokenApp(uid, { dispositivo: req.body?.dispositivo, ip: ipDe(req) });
  await auditar('app_login', { usuario: { id: uid, email: String(req.body?.email || '').toLowerCase() }, ip: ipDe(req), detalhe: String(req.body?.dispositivo || '').slice(0, 80) });
  res.json(t);
}));

app.post('/api/auth/app/logout', requireAuth, a(async (req, res) => { await revogarTokenApp(req); res.json({ ok: true }); }));
app.post('/api/auth/app/logout-all', requireAuth, a(async (req, res) => {
  await encerrarSessoes(req.user.id, null);
  await auditar('app_logout_todos', { usuario: req.user, ip: ipDe(req) });
  res.json({ ok: true });
}));

// Aparelhos com o app conectado: a própria pessoa vê e desconecta um por um
app.get('/api/auth/app/aparelhos', requireAuth, a(async (req, res) => {
  const lista = await aparelhosDoUsuario(req.user.id);
  res.json(lista.map((x) => ({ ...x, atual: x.id === req.appTokenId })));
}));
app.delete('/api/auth/app/aparelhos/:id', requireAuth, a(async (req, res) => {
  await desconectarAparelho(req.user.id, req.params.id);
  await auditar('app_aparelho_desconectado', { usuario: req.user, ip: ipDe(req), detalhe: String(req.params.id) });
  res.json({ ok: true });
}));

// Notificações no celular: o app registra o endereço de push do aparelho (só com o login do app)
const soApp = (req, res, next) => (req.appTokenId ? next() : res.status(403).json({ error: 'Só pelo app de celular.' }));
app.post('/api/app/push', requireAuth, soApp, a(async (req, res) => { await registrarPush(req.user.id, req.appTokenId, req.body?.token); res.json({ ok: true }); }));
app.delete('/api/app/push', requireAuth, soApp, a(async (req, res) => { await removerPush(req.appTokenId); res.json({ ok: true }); }));
// Contato da central (definido em Administração → App), mostrado no app
app.get('/api/app/contato', requireAuth, a(async (_req, res) => res.json(await contatoCentral())));

// Versão mínima do app aceita (para forçar atualização se algo mudar de forma incompatível) e aviso de manutenção
app.get('/api/app/versao', (_req, res) => res.json({
  minima: (process.env.QIMA_APP_VERSAO_MINIMA || '1.0.0').trim(),
  manutencao: process.env.QIMA_APP_MANUTENCAO === '1' ? (process.env.QIMA_APP_AVISO || 'Em manutenção. Tente de novo em alguns minutos.') : null,
}));

// ---------- Recuperação de senha ----------
// Resposta sempre igual (não revela se o e-mail existe). O link vai para a caixa de saída; enquanto o envio de e-mails
// não estiver ligado, a administração gera o link pela tela de Contas e entrega à pessoa.
app.post('/api/auth/forgot', a(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 254);
  const ip = ipDe(req);
  const resposta = { ok: true, mensagem: 'Se o e-mail estiver cadastrado, enviaremos o link para criar uma nova senha. Se não chegar, peça à administração do HUB.' };
  const [nIp, nEmail] = await Promise.all([contar(`esqueci-ip:${ip}`, REGRAS.esqueciIp), email ? contar(`esqueci-email:${email}`, REGRAS.esqueciEmail) : 0]);
  if (nIp > REGRAS.esqueciIp.max || nEmail > REGRAS.esqueciEmail.max) return res.json(resposta); // passou do limite: finge que enviou
  const user = email ? await pg.get('SELECT id, name, email FROM users WHERE lower(email) = ? AND active', email) : null;
  if (user) {
    const token = novoToken();
    await pg.tx(async (t) => {
      await t.run('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL', user.id);
      await t.run(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, now() + interval '30 minutes')`, user.id, hashToken(token));
      const link = `${urlBase()}/redefinir-senha?token=${token}`;
      await t.run('INSERT INTO outbox (module_key, to_email, subject, html) VALUES (?, ?, ?, ?)', 'hub', user.email, 'QIMA HUB · redefinir senha',
        `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6"><p>Olá, ${String(user.name).replace(/[<>&]/g, '')}.</p><p>Para criar uma nova senha, abra o link (vale por 30 minutos e só pode ser usado uma vez):</p><p><a href="${link}">${link}</a></p><p>Se você não pediu isto, ignore esta mensagem.</p></div>`);
    });
    await auditar('senha_link_pedido', { usuario: user, ip });
  }
  res.json(resposta);
}));

app.post('/api/auth/reset', a(async (req, res) => {
  const ip = ipDe(req);
  const espera = await bloqueio([`reset-ip:${ip}`]);
  if (espera) return aguarde(res, espera);
  const token = String(req.body?.token || '').slice(0, 200);
  const senha = String(req.body?.password || '');
  const rec = token ? await pg.get(`SELECT r.id, r.user_id, u.email, u.active FROM password_resets r JOIN users u ON u.id = r.user_id
    WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > now()`, hashToken(token)) : null;
  if (!rec || !rec.active) {
    await contar(`reset-ip:${ip}`, REGRAS.resetIp);
    return res.status(400).json({ error: 'Link inválido ou expirado. Peça um novo.' });
  }
  const erroSenha = validarSenha(senha, rec.email);
  if (erroSenha) return res.status(400).json({ error: erroSenha });
  await pg.tx(async (t) => {
    await t.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(senha), rec.user_id);
    await t.run('UPDATE password_resets SET used_at = now() WHERE user_id = ? AND used_at IS NULL', rec.user_id);
    await encerrarSessoes(rec.user_id, null, t); // quem estava logado (inclusive um invasor), no site ou no app, é desconectado
    await t.run('DELETE FROM auth_limites WHERE chave = ? OR chave LIKE ?', `email:${rec.email.toLowerCase()}`, `par:${rec.email.toLowerCase()}|%`);
  });
  await auditar('senha_redefinida', { usuario: { id: rec.user_id, email: rec.email }, ip });
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
// ?lado=solicitante (app de celular): os resumos e o sininho saem só do lado Solicitante, mesmo para quem é Central
const ladoApp = (req, papel) => (req.query.lado === 'solicitante' && papel !== 'rtv' ? 'solicitante' : papel);

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
      summary: r.status === 'ativo' && r.role !== 'rtv' ? await moduleSummary(r.key, req.user, ladoApp(req, r.role)) : null,
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
    return (await moduleNotificacoes(m.key, req.user, ladoApp(req, m.role))).map((n) => ({ ...n, modulo: m.key, modulo_titulo: manifest.title, icone: manifest.icon }));
  }));
  const itens = grupos.flat();
  res.json({ total: itens.reduce((s, n) => s + n.qtd, 0), itens });
}));

app.post('/api/me/password', requireAuth, a(async (req, res) => {
  const { current, next } = req.body || {};
  const ip = ipDe(req);
  const espera = await bloqueio([`senha:${req.user.id}`]);
  if (espera) return aguarde(res, espera);
  const row = await pg.get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
  if (String(current || '').length > 128 || !(await verifyPasswordAsync(String(current || ''), row.password_hash))) {
    await contar(`senha:${req.user.id}`, REGRAS.par);
    return res.status(400).json({ error: 'Senha atual incorreta' });
  }
  const erroSenha = validarSenha(next, req.user.email);
  if (erroSenha) return res.status(400).json({ error: erroSenha });
  await pg.tx(async (t) => {
    await t.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(String(next)), req.user.id);
    await encerrarSessoes(req.user.id, req, t); // desconecta os outros aparelhos
  });
  await auditar('senha_alterada', { usuario: req.user, ip });
  res.json({ ok: true });
}));

// Telas só do site: o login do app (lado Solicitante) não entra em Administração nem em relatórios
const semApp = (req, res, next) => (req.appTokenId ? res.status(403).json({ error: 'Disponível só no site.' }) : next());
app.use('/api/admin', requireAuth, semApp, requireAdmin, adminRouter());

// ---------- Sistemas ----------
// relatório do próprio sistema, para quem é da Central dele (antes das rotas dos sistemas)
app.use('/api/m/:key/relatorio.xlsx', semApp);
app.use('/api/m', relatorioDoSistemaRouter());
app.use('/api/relatorios', semApp, relatoriosDaCentralRouter());
await loadModules(app, { migrar: !SERVERLESS });
await aiIniciar();

// Primeiro uso: cria o administrador com acesso total
if (!SERVERLESS && !(await pg.get('SELECT 1 FROM users LIMIT 1'))) {
  const email = (process.env.QIMA_ADMIN_EMAIL || 'admin@qima.local').toLowerCase();
  // em produção nunca existe senha padrão: sem QIMA_ADMIN_PASSWORD, gera uma aleatória e mostra uma única vez
  const emProducao = process.env.NODE_ENV === 'production';
  const password = process.env.QIMA_ADMIN_PASSWORD || (emProducao ? crypto.randomBytes(12).toString('base64url') : 'admin123');
  if (!process.env.QIMA_ADMIN_PASSWORD && emProducao) console.log(`Senha inicial do administrador (anote, não será mostrada de novo): ${password}`);
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
  // erros de entrada marcados como "expose" (ex.: dado inválido) voltam com a mensagem; o resto vira "Erro interno"
  if (err?.expose && err.status >= 400 && err.status < 500) { if (!res.headersSent) res.status(err.status).json({ error: err.message }); return; }
  console.error(err);
  if (!res.headersSent) res.status(500).json({ error: 'Erro interno' });
});

if (!SERVERLESS) {
  await cleanExpiredSessions();
  setInterval(() => cleanExpiredSessions().catch(() => {}), 60 * 60 * 1000).unref();
  app.listen(PORT, () => console.log(`QIMA HUB API em http://localhost:${PORT}`));
}

export default app;
