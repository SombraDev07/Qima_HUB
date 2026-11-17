// Leitura de documentos por IA — configurada em Administração › Inteligência artificial.
//
// Provedores:
//   nenhum          → os sistemas funcionam em modo manual
//   openai          → qualquer serviço com API "compatível com OpenAI" (OpenAI, Google Gemini,
//                     Azure OpenAI, OpenRouter, Ollama local…): URL + chave + modelo
//   demo            → só lê os cupons de teste gerados pelos scripts (nunca em produção)
//   arquivo:<nome>  → conector próprio em core/server/ai-providers/<nome>.js (veja _exemplo.js)
//
// Sem configuração salva, vale a variável QIMA_AI_PROVIDER do .env (compatibilidade).
// Cada sistema que usa IA declara "ia": true no module.json e pode ser ligado/desligado no Admin.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pg } from '../pg.js';
import { cifrar, decifrar } from './segredo.js';

const PASTA = path.join(import.meta.dirname, '..', 'ai-providers');

export const PRESETS = [
  { id: 'openai', nome: 'OpenAI', url: 'https://api.openai.com/v1', modelo: 'gpt-4o-mini', auth: 'bearer' },
  { id: 'gemini', nome: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', modelo: 'gemini-2.0-flash', auth: 'bearer' },
  { id: 'azure', nome: 'Azure OpenAI', url: 'https://<recurso>.openai.azure.com/openai/deployments/<implantacao>', modelo: '', auth: 'api-key' },
  { id: 'openrouter', nome: 'OpenRouter', url: 'https://openrouter.ai/api/v1', modelo: '', auth: 'bearer' },
  { id: 'ollama', nome: 'Ollama (servidor local)', url: 'http://localhost:11434/v1', modelo: 'llava', auth: 'nenhuma' },
];

// ------------------------------------------------------------------ configuração
// A configuração fica em memória (as telas dos sistemas perguntam "a IA está ligada?" a todo momento).
// É relida do banco ao salvar e, no máximo, a cada 30 s — outra instância do servidor pode tê-la alterado.
let memoria = null;
let lidaEm = 0;

/** Lê a configuração do banco. Chamar na partida e sempre que precisar do valor mais recente. */
export async function aiCarregar() {
  const row = await pg.get("SELECT value, updated_at, updated_by FROM settings WHERE key = 'ia'");
  memoria = row ? { ...JSON.parse(row.value), salvo: true, updated_at: row.updated_at, updated_by: row.updated_by } : null;
  lidaEm = Date.now();
  return lerConfig();
}

function lerConfig() {
  if (Date.now() - lidaEm > 30_000) { lidaEm = Date.now(); aiCarregar().catch((e) => console.error('[IA] falha ao reler a configuração:', e.message)); }
  if (memoria) return memoria;
  const env = (process.env.QIMA_AI_PROVIDER || '').trim();
  return { provedor: env ? (env === 'demo' ? 'demo' : `arquivo:${env}`) : 'nenhum', sistemas: {}, salvo: false };
}

/** Configuração para a tela do Admin (nunca devolve a chave). */
export function aiConfigPublica() {
  const c = lerConfig();
  let final = null;
  try { const k = decifrar(c.chave); final = k ? k.slice(-4) : null; } catch { final = '????'; }
  const arquivos = fs.existsSync(PASTA) ? fs.readdirSync(PASTA).filter((f) => f.endsWith('.js') && !f.startsWith('_') && f !== 'demo.js').map((f) => f.slice(0, -3)) : [];
  return {
    provedor: c.provedor, url: c.url || '', modelo: c.modelo || '', auth: c.auth || 'bearer', timeout_s: c.timeout_s || 60,
    chave_definida: !!c.chave, chave_final: final, sistemas: c.sistemas || {}, salvo: c.salvo, updated_at: c.updated_at, updated_by: c.updated_by,
    presets: PRESETS, arquivos, status: aiStatus(),
  };
}

export async function aiSalvar(body, user) {
  await aiCarregar();
  const atual = lerConfig();
  const provedor = String(body.provedor || 'nenhum');
  const validos = ['nenhum', 'openai', 'demo'];
  if (!validos.includes(provedor) && !/^arquivo:[\w-]+$/.test(provedor)) throw new Error('Provedor inválido');
  const novo = {
    provedor,
    url: String(body.url || '').trim().replace(/\/+$/, ''),
    modelo: String(body.modelo || '').trim(),
    auth: ['bearer', 'api-key', 'nenhuma'].includes(body.auth) ? body.auth : 'bearer',
    timeout_s: Math.min(180, Math.max(10, Number(body.timeout_s) || 60)),
    sistemas: Object.fromEntries(Object.entries(body.sistemas || {}).map(([k, v]) => [k, !!v])),
    chave: atual.chave || null,
  };
  if (body.limpar_chave) novo.chave = null;
  if (typeof body.chave === 'string' && body.chave.trim()) novo.chave = cifrar(body.chave.trim());
  if (provedor === 'openai') {
    if (!/^https?:\/\/\S+$/.test(novo.url)) throw new Error('Informe a URL da API (ex.: https://api.openai.com/v1)');
    if (!novo.modelo) throw new Error('Informe o modelo');
    if (novo.auth !== 'nenhuma' && !novo.chave) throw new Error('Informe a chave da API');
  }
  await pg.run(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('ia', ?, now(), ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`, JSON.stringify(novo), user?.name || null);
  cache = { chave: null, provider: null };
  await aiCarregar();
}

// ------------------------------------------------------------------ provedores
let cache = { chave: null, provider: null };

async function carregarArquivo(nome) {
  const file = path.join(PASTA, `${nome}.js`);
  if (!fs.existsSync(file)) throw new Error(`conector ${nome}.js não existe em core/server/ai-providers`);
  const p = (await import(pathToFileURL(file).href)).default;
  if (typeof p?.extrair !== 'function') throw new Error('o conector precisa exportar default { extrair }');
  return p;
}

function jsonDaResposta(txt) {
  const s = String(txt || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error('a IA não devolveu JSON');
}

function provedorOpenAI(c) {
  const chave = c.chave ? decifrar(c.chave) : '';
  const headers = { 'Content-Type': 'application/json' };
  if (c.auth === 'bearer' && chave) headers.Authorization = `Bearer ${chave}`;
  if (c.auth === 'api-key' && chave) headers['api-key'] = chave;
  const endpoint = `${c.url}/chat/completions${c.auth === 'api-key' && !/api-version=/.test(c.url) ? '?api-version=2024-10-21' : ''}`;
  const chamar = async (messages, json = true) => {
    const body = { model: c.modelo, temperature: 0, messages, ...(json ? { response_format: { type: 'json_object' } } : {}) };
    const r = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout((c.timeout_s || 60) * 1000) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 400 && json && /response_format|json/i.test(JSON.stringify(d))) return chamar(messages, false); // provedor sem modo JSON
    if (!r.ok) throw new Error(`IA respondeu ${r.status}: ${String(d.error?.message || d.message || JSON.stringify(d)).slice(0, 200)}`);
    return d.choices?.[0]?.message?.content ?? '';
  };
  return {
    async extrair({ buffer, mime, instrucoes, schema }) {
      const b64 = `data:${mime};base64,${buffer.toString('base64')}`;
      const arquivo = mime === 'application/pdf'
        ? { type: 'file', file: { filename: 'documento.pdf', file_data: b64 } }
        : { type: 'image_url', image_url: { url: b64 } };
      const txt = await chamar([
        { role: 'system', content: 'Você extrai dados de documentos fiscais brasileiros. Responda somente com um objeto JSON válido, sem texto antes ou depois.' },
        { role: 'user', content: [{ type: 'text', text: `${instrucoes}\n\nResponda com um JSON neste formato (JSON Schema):\n${JSON.stringify(schema)}` }, arquivo] },
      ]);
      return jsonDaResposta(txt);
    },
    async testar() {
      const txt = await chamar([{ role: 'user', content: 'Teste de conexão. Responda apenas com o JSON {"ok": true}.' }]);
      return jsonDaResposta(txt);
    },
  };
}

async function provedorAtual() {
  const c = lerConfig();
  const chaveCache = JSON.stringify([c.provedor, c.url, c.modelo, c.auth, c.chave, c.timeout_s]);
  if (cache.chave === chaveCache) return { c, p: cache.provider };
  let p = null;
  if (c.provedor === 'openai') p = provedorOpenAI(c);
  else if (c.provedor === 'demo') p = await carregarArquivo('demo');
  else if (c.provedor.startsWith('arquivo:')) p = await carregarArquivo(c.provedor.slice(8));
  cache = { chave: chaveCache, provider: p };
  return { c, p };
}

// ------------------------------------------------------------------ uso pelos sistemas
let ultimoErro = null;
/** Chamar na partida do servidor, depois de criar as tabelas: configuração em memória e aviso no console. */
export async function aiIniciar() {
  try {
    await aiCarregar();
    const { c, p } = await provedorAtual();
    if (p) console.log(`[IA] provedor "${c.provedor}" ativo`);
  } catch (e) { ultimoErro = e.message; console.error(`[IA] ${e.message}`); }
}

export function aiStatus() {
  const c = lerConfig();
  return { ativo: c.provedor !== 'nenhum' && !ultimoErro, provedor: c.provedor === 'nenhum' ? null : c.provedor, modelo: c.modelo || null, erro: ultimoErro };
}

// o registro de uso nunca pode derrubar a leitura
const registrar = (key, prov, ok, ms, erro) => pg.run('INSERT INTO ai_uso (module_key, provedor, ok, ms, erro) VALUES (?, ?, ?, ?, ?)', key, prov, ok, ms, erro)
  .catch((e) => console.error('[IA] falha ao registrar o uso:', e.message));

const ligadoPara = (key) => { const c = lerConfig(); return c.provedor !== 'nenhum' && c.sistemas?.[key] !== false; };

/** IA vista por um sistema (ctx.ai): respeita o liga/desliga por sistema e registra o uso. */
export function aiParaModulo(key) {
  return {
    disponivel: () => ligadoPara(key),
    status: () => ({ ...aiStatus(), ativo: ligadoPara(key) && !ultimoErro }),
    async extrair(req) {
      if (!ligadoPara(key)) throw new Error('Leitura por IA desligada para este sistema');
      const t0 = Date.now();
      let prov = '?';
      try {
        const { c, p } = await provedorAtual();
        prov = c.provedor;
        if (!p) throw new Error('Leitura por IA não configurada');
        const r = await p.extrair(req);
        await registrar(key, prov, true, Date.now() - t0, null);
        ultimoErro = null;
        return r;
      } catch (e) {
        await registrar(key, prov, false, Date.now() - t0, String(e.message).slice(0, 300));
        throw e;
      }
    },
  };
}

/** Botão "Testar conexão" do Admin. */
export async function aiTestar() {
  const t0 = Date.now();
  const { c, p } = await provedorAtual();
  if (!p) throw new Error('Nenhum provedor escolhido');
  if (typeof p.testar === 'function') {
    const r = await p.testar();
    return { ok: true, ms: Date.now() - t0, resposta: r, provedor: c.provedor };
  }
  return { ok: true, ms: Date.now() - t0, provedor: c.provedor, resposta: 'Conector carregado (ele não tem teste próprio; envie uma foto num sistema para conferir).' };
}

export async function aiUso() {
  return {
    por_sistema: await pg.all(`SELECT module_key, COUNT(*) AS total, COUNT(*) FILTER (WHERE ok) AS ok, COUNT(*) FILTER (WHERE NOT ok) AS falhas,
      ROUND(AVG(ms)) AS ms_medio, MAX(created_at) AS ultimo
      FROM ai_uso WHERE created_at >= now() - interval '30 days' GROUP BY module_key`),
    ultimos_erros: await pg.all('SELECT module_key, provedor, erro, created_at FROM ai_uso WHERE NOT ok ORDER BY id DESC LIMIT 5'),
  };
}

// compatibilidade com código antigo
export const aiDisponivel = () => lerConfig().provedor !== 'nenhum';
export const aiExtrair = (req) => aiParaModulo('geral').extrair(req);
