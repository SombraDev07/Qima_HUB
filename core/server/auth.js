import crypto from 'node:crypto';
import { pg } from './pg.js';

const COOKIE = 'qh_sid';
const SESSION_MS = 12 * 60 * 60 * 1000; // 12h: teto da sessão do site, mesmo em uso
const INATIVIDADE_MS = 2 * 60 * 60 * 1000; // 2h sem uso: a sessão cai (computador deixado aberto)
const MARCAR_USO_MS = 5 * 60 * 1000; // grava o "último uso" no máximo a cada 5 min (não a cada pedido)

/** Rotas assíncronas no Express 4: um erro vira resposta 500 em vez de derrubar a requisição. */
export const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return calc.length === expected.length && crypto.timingSafeEqual(calc, expected);
}

const scryptAsync = (senha, salt) => new Promise((ok, erro) => crypto.scrypt(senha, salt, 64, (e, k) => (e ? erro(e) : ok(k))));

/** Versão assíncrona (não trava o servidor durante o cálculo). Use no login, que roda antes de saber quem é a pessoa. */
export async function verifyPasswordAsync(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const calc = await scryptAsync(password, salt);
  const expected = Buffer.from(hash, 'hex');
  return calc.length === expected.length && crypto.timingSafeEqual(calc, expected);
}
// Conta inexistente gasta o mesmo tempo de uma existente (não revela quais e-mails estão cadastrados).
const HASH_FALSO = hashPassword(crypto.randomBytes(12).toString('hex'));
export const gastarTempoDeSenha = (password) => verifyPasswordAsync(password, HASH_FALSO);

/** Encerra as sessões do site e os logins do app da pessoa, menos (opcionalmente) o que está em uso agora. */
export async function encerrarSessoes(userId, manterReq = null, t = pg) {
  const sid = manterReq ? parseCookies(manterReq)[COOKIE] : null;
  await t.run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', userId, sid ? hashSessao(sid) : '');
  await t.run('DELETE FROM app_tokens WHERE user_id = ? AND id <> ?', userId, manterReq?.appTokenId ?? 0);
}

// ---------------------------------------------------------------- login do app de celular (token no cabeçalho Authorization)
const APP_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias, renovados a cada uso
const APP_MAX_DIAS = 90;                   // e no máximo 90 dias desde o login: depois disso, entrar de novo
const bearerDe = (req) => { const m = /^Bearer (qha_[A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization || ''); return m ? m[1] : null; };

/** Cria o token do aparelho. Devolve o texto do token (só aparece aqui; no banco fica o hash). */
export async function criarTokenApp(userId, { dispositivo = null, ip = null } = {}) {
  const token = `qha_${crypto.randomBytes(32).toString('base64url')}`;
  await pg.run(`INSERT INTO app_tokens (user_id, token_hash, dispositivo, ip, expira_em) VALUES (?, ?, ?, ?, now() + interval '30 days')`,
    userId, hashSessao(token), dispositivo ? String(dispositivo).slice(0, 80) : null, ip);
  return { token, expira_em: new Date(Date.now() + APP_MS).toISOString() };
}

/** Aparelhos com o app conectado (para a tela "Meus aparelhos"). */
export function aparelhosDoUsuario(userId) {
  return pg.all(`SELECT id, dispositivo, created_at, ultimo_uso, expira_em FROM app_tokens
    WHERE user_id = ? AND expira_em > now() ORDER BY ultimo_uso DESC`, userId);
}
/** Desconecta um aparelho da própria pessoa. */
export async function desconectarAparelho(userId, id) {
  await pg.run('DELETE FROM app_tokens WHERE id = ? AND user_id = ?', Number(id) || 0, userId);
}

export async function revogarTokenApp(req) {
  if (req.appTokenId) await pg.run('DELETE FROM app_tokens WHERE id = ?', req.appTokenId);
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* cookie malformado: ignora */ }
  }
  return out;
}

// No banco fica só o hash da sessão: quem lesse a tabela não conseguiria usar os cookies.
const hashSessao = (id) => crypto.createHash('sha256').update(String(id)).digest('hex');

export async function createSession(res, userId) {
  const id = crypto.randomBytes(32).toString('hex');
  await pg.run('INSERT INTO sessions (id, user_id, expires_at, ultimo_uso) VALUES (?, ?, ?, ?)', hashSessao(id), userId, Date.now() + SESSION_MS, Date.now());
  res.cookie(COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MS,
  });
}

export async function destroySession(req, res) {
  const sid = parseCookies(req)[COOKIE];
  if (sid) await pg.run('DELETE FROM sessions WHERE id = ?', hashSessao(sid));
  res.clearCookie(COOKIE);
}

/** Middleware global: popula req.user se houver sessão válida (só nas rotas da API). */
export const loadUser = a(async (req, _res, next) => {
  const sid = parseCookies(req)[COOKIE];
  if (sid) {
    const agora = Date.now();
    const s = await pg.get(`
      SELECT u.id, u.name, u.email, u.is_admin, s.ultimo_uso
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ? AND (s.ultimo_uso IS NULL OR s.ultimo_uso > ?) AND u.active
    `, hashSessao(sid), agora, agora - INATIVIDADE_MS);
    if (s) {
      const { ultimo_uso: ultimo, ...user } = s;
      req.user = user;
      // consulta automática (sininho a cada minuto) não conta como uso: só ação da pessoa mantém a sessão viva
      const automatico = req.headers['x-automatico'] === '1';
      if (!automatico && (!ultimo || agora - Number(ultimo) > MARCAR_USO_MS)) {
        await pg.run('UPDATE sessions SET ultimo_uso = ? WHERE id = ?', agora, hashSessao(sid));
      }
    }
  }
  const bearer = !req.user && bearerDe(req);
  if (bearer) {
    const t = await pg.get(`SELECT t.id, t.ultimo_uso, u.id AS uid, u.name, u.email
      FROM app_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ? AND t.expira_em > now() AND t.created_at > now() - interval '${APP_MAX_DIAS} days' AND u.active`, hashSessao(bearer));
    if (t) {
      // O app é só do lado Solicitante: o token dele nunca vale como administrador (nem como Central, veja moduleLoader)
      req.user = { id: t.uid, name: t.name, email: t.email, is_admin: false };
      req.appTokenId = t.id;
      // renova a validade (no máximo 1 vez por hora, para não gravar a cada pedido), sem passar do limite de 90 dias
      if (Date.now() - new Date(String(t.ultimo_uso).replace(' ', 'T').replace(/(\d)$/, '$1Z')).getTime() > 3600_000) {
        await pg.run(`UPDATE app_tokens SET ultimo_uso = now(),
          expira_em = LEAST(now() + interval '30 days', created_at + interval '${APP_MAX_DIAS} days') WHERE id = ?`, t.id);
      }
    }
  }
  next();
});

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Acesso restrito à administração' });
  next();
}

/** 'ambos' satisfaz qualquer papel; a Central também pode fazer tudo o que o Solicitante faz (criar os próprios pedidos). */
export function hasRole(role, wanted) {
  return role === 'ambos' || role === wanted || (role === 'central' && wanted === 'solicitante');
}

export async function cleanExpiredSessions() {
  await pg.run('DELETE FROM sessions WHERE expires_at <= ?', Date.now());
  await pg.run(`DELETE FROM app_tokens WHERE expira_em <= now() OR created_at <= now() - interval '${APP_MAX_DIAS} days'`);
}
