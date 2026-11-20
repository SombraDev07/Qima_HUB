// Apoio ao app de celular: notificações (push) e contato da central.
// O push usa o serviço da Expo (o app registra um "ExponentPushToken[...]"); sem token registrado, nada é enviado.
import { pg } from '../pg.js';

const TOKEN_PUSH = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/;
const URL_PUSH = 'https://exp.host/--/api/v2/push/send';

/** Guarda o endereço de push do aparelho logado (um por login do app). */
export async function registrarPush(userId, tokenId, pushToken) {
  const t = String(pushToken || '').trim();
  if (!TOKEN_PUSH.test(t)) { const e = Object.assign(new Error('Endereço de notificação inválido.'), { status: 400, expose: true }); throw e; }
  await pg.run(`INSERT INTO app_push (user_id, token_id, push_token) VALUES (?, ?, ?)
    ON CONFLICT (token_id) DO UPDATE SET push_token = EXCLUDED.push_token, created_at = now()`, userId, tokenId, t);
}

export async function removerPush(tokenId) {
  await pg.run('DELETE FROM app_push WHERE token_id = ?', tokenId);
}

/** Texto curto a partir do HTML do e-mail (o push mostra só o começo). */
const textoDe = (html) => String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim().slice(0, 180);

/**
 * Manda o aviso para o celular de quem tem o e-mail (se a pessoa usa o app e permitiu notificações).
 * Melhor esforço: nunca derruba a rota; endereços que a Expo diz que não existem mais são apagados.
 */
export async function pushPorEmail(email, titulo, html, dados = {}) {
  const alvos = await pg.all(`SELECT p.id, p.push_token FROM app_push p JOIN users u ON u.id = p.user_id
    JOIN app_tokens t ON t.id = p.token_id WHERE lower(u.email) = lower(?) AND u.active AND t.expira_em > now()`, String(email || ''));
  if (!alvos.length) return 0;
  const corpo = textoDe(html);
  const msgs = alvos.map((a) => ({ to: a.push_token, title: String(titulo || 'QIMA HUB').slice(0, 80), body: corpo, data: dados, sound: 'default', priority: 'high' }));
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), 8000);
  try {
    const r = await fetch(URL_PUSH, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(msgs), signal: controle.signal });
    const j = await r.json().catch(() => ({}));
    const mortos = (j.data || []).map((x, i) => (x?.details?.error === 'DeviceNotRegistered' ? alvos[i].id : null)).filter(Boolean);
    if (mortos.length) await pg.run(`DELETE FROM app_push WHERE id IN (${mortos.map(Number).join(',')})`);
    return msgs.length;
  } finally { clearTimeout(relogio); }
}

// ------------------------------------------------------------------ contato da central (Administração → App)
const CAMPOS = { telefone: 30, whatsapp: 30, email: 120, horario: 80 };

export async function contatoCentral() {
  const row = await pg.get("SELECT value FROM settings WHERE key = 'app_contato'");
  let v = {};
  try { v = row ? JSON.parse(row.value) : {}; } catch { v = {}; }
  return Object.fromEntries(Object.keys(CAMPOS).map((k) => [k, typeof v[k] === 'string' ? v[k] : '']));
}

export async function salvarContatoCentral(b, user) {
  const v = Object.fromEntries(Object.entries(CAMPOS).map(([k, max]) => [k, String(b?.[k] ?? '').trim().slice(0, max)]));
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) { const e = Object.assign(new Error('E-mail do contato inválido.'), { status: 400, expose: true }); throw e; }
  await pg.run(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('app_contato', ?, now(), ?)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`, JSON.stringify(v), user?.email || null);
  return v;
}
