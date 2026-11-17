import crypto from 'node:crypto';
import { pg } from './pg.js';

const COOKIE = 'qh_sid';
const SESSION_MS = 12 * 60 * 60 * 1000; // 12h

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

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function createSession(res, userId) {
  const id = crypto.randomBytes(32).toString('hex');
  await pg.run('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', id, userId, Date.now() + SESSION_MS);
  res.cookie(COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MS,
  });
}

export async function destroySession(req, res) {
  const sid = parseCookies(req)[COOKIE];
  if (sid) await pg.run('DELETE FROM sessions WHERE id = ?', sid);
  res.clearCookie(COOKIE);
}

/** Middleware global: popula req.user se houver sessão válida (só nas rotas da API). */
export const loadUser = a(async (req, _res, next) => {
  const sid = parseCookies(req)[COOKIE];
  if (sid) {
    req.user = await pg.get(`
      SELECT u.id, u.name, u.email, u.is_admin
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ? AND u.active
    `, sid, Date.now());
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

/** 'ambos' satisfaz qualquer papel. */
export function hasRole(role, wanted) {
  return role === 'ambos' || role === wanted;
}

export async function cleanExpiredSessions() {
  await pg.run('DELETE FROM sessions WHERE expires_at <= ?', Date.now());
}
