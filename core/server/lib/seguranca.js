// Segurança do núcleo: IP real, cabeçalhos, checagem de origem (CSRF), limite de requisições,
// bloqueio de tentativas (no banco, vale em todas as instâncias da Vercel), senha forte e trilha de auditoria.
import crypto from 'node:crypto';
import { pg } from '../pg.js';

// ---------------------------------------------------------------- IP do cliente
// Na Vercel o cabeçalho x-vercel-forwarded-for é definido pela própria plataforma (o cliente não consegue forjar).
// Fora dela só confiamos em x-forwarded-for se QIMA_CONFIAR_PROXY=1 (atrás de um proxy nosso).
export function ipDe(req) {
  // Atrás do Cloudflare: a Vercel enxerga só os IPs do Cloudflare, então o IP real vem de cf-connecting-ip.
  // Só vale se o pedido trouxer o segredo que o Cloudflare injeta (regra "Modify Request Header" x-origin-verify = QIMA_CF_SEGREDO);
  // sem isso qualquer pessoa poderia forjar o cabeçalho e escapar dos limites.
  const cf = process.env.QIMA_CF_SEGREDO;
  if (cf && req.headers['cf-connecting-ip'] && segredoIgual(req.headers['x-origin-verify'], cf)) return String(req.headers['cf-connecting-ip']).trim().slice(0, 64);
  if (process.env.VERCEL) {
    const v = req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'];
    if (v) return String(v).split(',')[0].trim().slice(0, 64);
  } else if (process.env.QIMA_CONFIAR_PROXY === '1' && req.headers['x-forwarded-for']) {
    return String(req.headers['x-forwarded-for']).split(',')[0].trim().slice(0, 64);
  }
  return String(req.socket?.remoteAddress || 'desconhecido').slice(0, 64);
}

function segredoIgual(a, b) {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Respostas da API nunca ficam em cache (navegador, Vercel ou Cloudflare). Rotas de arquivo podem sobrescrever com "private". */
export function semCache(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

// ---------------------------------------------------------------- cabeçalhos
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.supabase.co",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function cabecalhosSeguros(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP);
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}
export const CSP_TEXTO = CSP;

// ---------------------------------------------------------------- CSRF (defesa extra além do SameSite=Lax)
// Pedidos que alteram dados só valem se vierem do próprio site.
export function verificarOrigem(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const permitidas = new Set([req.headers.host, ...String(process.env.QIMA_ORIGENS || '').split(',').map((s) => s.trim()).filter(Boolean)]);
  const origem = req.headers.origin;
  if (origem) {
    let host = '';
    try { host = new URL(origem).host; } catch { /* inválida */ }
    if (!permitidas.has(host)) return res.status(403).json({ error: 'Origem não permitida' });
  } else if (req.headers['sec-fetch-site'] === 'cross-site') {
    return res.status(403).json({ error: 'Origem não permitida' });
  }
  next();
}

// ---------------------------------------------------------------- limite de requisições em memória (por instância)
// Barra rajadas antes de chegar ao banco. Não substitui o Firewall da Vercel (que pega o tráfego de todas as instâncias).
export function limitePorIp({ janelaMs = 60_000, max = 600, nome = 'geral' } = {}) {
  const mapa = new Map();
  const limpar = setInterval(() => { const agora = Date.now(); for (const [k, v] of mapa) if (v.fim <= agora) mapa.delete(k); }, janelaMs).unref();
  void limpar;
  return (req, res, next) => {
    const ip = ipDe(req);
    const agora = Date.now();
    let e = mapa.get(ip);
    if (!e || e.fim <= agora) { e = { n: 0, fim: agora + janelaMs }; if (mapa.size < 50_000) mapa.set(ip, e); }
    e.n += 1;
    if (e.n > max) {
      res.setHeader('Retry-After', Math.ceil((e.fim - agora) / 1000));
      return res.status(429).json({ error: 'Muitas requisições. Aguarde um instante e tente de novo.' });
    }
    next();
  };
}

// ---------------------------------------------------------------- bloqueio de tentativas (banco)
/** Está bloqueada alguma das chaves? Devolve os minutos que faltam, ou 0. */
export async function bloqueio(chaves) {
  const l = await pg.get(`SELECT MAX(CEIL(EXTRACT(EPOCH FROM (bloqueado_ate - now())) / 60))::int AS min
    FROM auth_limites WHERE chave IN (${chaves.map(() => '?').join(',')}) AND bloqueado_ate > now()`, ...chaves);
  return l?.min || 0;
}

/** Conta uma tentativa. Ao passar do máximo na janela, bloqueia por "bloqueioMin" minutos. Devolve o nº de tentativas. */
export async function contar(chave, { max, janelaMin, bloqueioMin }) {
  const r = await pg.get(`INSERT INTO auth_limites (chave, falhas, janela_inicio) VALUES (?, 1, now())
    ON CONFLICT (chave) DO UPDATE SET
      falhas = CASE WHEN auth_limites.janela_inicio < now() - (? * interval '1 minute') THEN 1 ELSE auth_limites.falhas + 1 END,
      janela_inicio = CASE WHEN auth_limites.janela_inicio < now() - (? * interval '1 minute') THEN now() ELSE auth_limites.janela_inicio END
    RETURNING falhas`, chave, janelaMin, janelaMin);
  if (r.falhas >= max) await pg.run(`UPDATE auth_limites SET bloqueado_ate = now() + (? * interval '1 minute') WHERE chave = ?`, bloqueioMin, chave);
  return r.falhas;
}
export const zerar = (chaves) => pg.run(`DELETE FROM auth_limites WHERE chave IN (${chaves.map(() => '?').join(',')})`, ...chaves);
export const desbloquearEmail = (email) => pg.run(`DELETE FROM auth_limites WHERE chave = ? OR chave LIKE ?`, `email:${email}`, `par:${email}|%`);
/** Remove registros antigos (chamado de vez em quando; barato). */
export const limparLimites = () => pg.run(`DELETE FROM auth_limites WHERE janela_inicio < now() - interval '1 day' AND (bloqueado_ate IS NULL OR bloqueado_ate < now())`);

// Regras do login (por par e-mail+IP, por e-mail e por IP) e da recuperação de senha
export const REGRAS = {
  par: { max: 5, janelaMin: 15, bloqueioMin: 15 },
  email: { max: 20, janelaMin: 15, bloqueioMin: 15 },
  ip: { max: 30, janelaMin: 15, bloqueioMin: 15 },
  esqueciIp: { max: 10, janelaMin: 60, bloqueioMin: 60 },
  esqueciEmail: { max: 3, janelaMin: 60, bloqueioMin: 60 },
  resetIp: { max: 20, janelaMin: 60, bloqueioMin: 60 },
};
export const chavesLogin = (email, ip) => [`par:${email}|${ip}`, `email:${email}`, `ip:${ip}`];

// ---------------------------------------------------------------- senha
const COMUNS = new Set(['12345678', '123456789', '1234567890', 'password', 'senha123', 'senha1234', 'qwerty123', 'qima1234', 'qima12345', 'admin123', 'admin1234', 'abc12345', 'mudar123', 'trocar123']);
/** Devolve o motivo de recusa, ou null se a senha é aceitável. */
export function validarSenha(senha, email = '') {
  const s = String(senha ?? '');
  if (s.length < 8) return 'A senha precisa ter ao menos 8 caracteres';
  if (s.length > 128) return 'A senha pode ter no máximo 128 caracteres';
  if (COMUNS.has(s.toLowerCase())) return 'Essa senha é muito comum. Escolha outra';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && s.toLowerCase().includes(local)) return 'A senha não pode conter o seu e-mail';
  if (/^(.)\1+$/.test(s)) return 'Escolha uma senha menos repetitiva';
  return null;
}

// ---------------------------------------------------------------- tokens de recuperação
export const novoToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

/** Endereço base do site para montar links (nunca vem do cabeçalho Host, que o cliente controla). */
export function urlBase() {
  const v = (process.env.QIMA_URL || '').trim().replace(/\/+$/, '');
  if (v) return v;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:5173';
}

// ---------------------------------------------------------------- auditoria
/** Registra um evento sensível. Nunca derruba a requisição. */
export async function auditar(acao, { usuario = null, email = null, ip = null, detalhe = null } = {}) {
  try {
    await pg.run('INSERT INTO audit_log (usuario_id, usuario_email, acao, detalhe, ip) VALUES (?, ?, ?, ?, ?)',
      usuario?.id ?? null, (usuario?.email || email || null), acao, detalhe ? String(detalhe).slice(0, 500) : null, ip);
  } catch (e) { console.error('[auditoria]', e.message); }
}
