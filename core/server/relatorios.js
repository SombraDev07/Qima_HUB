// Relatórios em Excel (por sistema ou geral), com filtro de datas.
// Dois caminhos usam a mesma geração:
//   Administração  → /api/admin/relatorios/<chave|todos>.xlsx   (todos os sistemas)
//   Central        → /api/m/<chave>/relatorio.xlsx              (só o sistema dela)
import express from 'express';
import { pg } from './pg.js';
import { a, requireAuth, hasRole } from './auth.js';
import { registry, moduleRelatorio } from './moduleLoader.js';
import { buildXlsx } from './lib/xlsx.js';

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const brDate = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

export class ErroRelatorio extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

/** Sistemas que exportam relatório, na ordem dos cards. */
export async function sistemasComRelatorio() {
  const ordem = Object.fromEntries((await pg.all('SELECT key, sort_order FROM modules')).map((m) => [m.key, m.sort_order]));
  return [...registry.values()].filter(({ impl, error }) => !error && typeof impl.relatorio === 'function')
    .map(({ manifest }) => manifest)
    .sort((x, y) => (ordem[x.key] ?? 99) - (ordem[y.key] ?? 99));
}

/** Monta o Excel. chave = 'todos' ou a chave de um sistema. Devolve { xlsx, nome }. */
export async function gerarExcel({ chave, de, ate, quem, permitidos = null }) {
  if (!isDate(de) || !isDate(ate)) throw new ErroRelatorio('Informe as datas de e até');
  if (ate < de) throw new ErroRelatorio('A data final é antes da inicial');
  const todos = chave === 'todos';
  // permitidos: lista de chaves que a pessoa pode baixar (Central); null = todos os sistemas (Administração)
  const mods = (await sistemasComRelatorio()).filter((x) => (todos || x.key === chave) && (!permitidos || permitidos.includes(x.key)));
  if (!mods.length) throw new ErroRelatorio('Sistema sem relatório', 404);

  const abas = [];
  const resumo = [];
  for (const mod of mods) {
    let rel;
    try { rel = await moduleRelatorio(mod.key, { de, ate }); } catch (e) {
      console.error(`[relatório ${mod.key}]`, e);
      resumo.push([mod.title, null, null, 'Erro ao gerar este sistema. Avise a administração.']);
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
    rows: [...resumo, [], [`Período: ${brDate(de)} a ${brDate(ate)} (data de criação do pedido)`], [`Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} por ${quem}`]],
  };
  return { xlsx: buildXlsx([capa, ...abas]), nome: `${todos ? 'qima-hub' : mods[0].key}_${de}_a_${ate}.xlsx` };
}

export function enviarExcel(res, { xlsx, nome }) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.send(xlsx);
}

/** Sistemas ativos em que a pessoa é Central e que exportam relatório. */
async function sistemasDaCentral(userId) {
  const meus = new Set((await pg.all(`SELECT um.module_key FROM user_modules um JOIN modules m ON m.key = um.module_key
    WHERE um.user_id = ? AND um.role IN ('central','ambos') AND m.enabled AND m.status = 'ativo'`, userId)).map((x) => x.module_key));
  return (await sistemasComRelatorio()).filter((m) => meus.has(m.key));
}

/** Página Relatórios da Central: lista só os sistemas dela e baixa um deles ou todos os dela em um arquivo. */
export function relatoriosDaCentralRouter() {
  const r = express.Router();
  r.get('/', requireAuth, a(async (req, res) => {
    res.json((await sistemasDaCentral(req.user.id)).map((m) => ({ key: m.key, title: m.title, icon: m.icon, labels: m.labels })));
  }));
  r.get('/:arq', requireAuth, a(async (req, res) => {
    const m = /^([a-z0-9_]+)\.xlsx$/.exec(req.params.arq);
    if (!m) return res.status(404).json({ error: 'Relatório não encontrado' });
    const permitidos = (await sistemasDaCentral(req.user.id)).map((x) => x.key);
    if (m[1] !== 'todos' && !permitidos.includes(m[1])) return res.status(403).json({ error: 'O relatório é para quem é da Central deste sistema.' });
    try {
      enviarExcel(res, await gerarExcel({ chave: m[1], de: req.query.de, ate: req.query.ate, quem: req.user.name, permitidos }));
    } catch (e) {
      if (e instanceof ErroRelatorio) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  }));
  return r;
}

/** Relatório do próprio sistema para quem é da Central dele. Não dá acesso a nenhuma outra função de administração. */
export function relatorioDoSistemaRouter() {
  const r = express.Router();
  r.get('/:key/relatorio.xlsx', requireAuth, a(async (req, res) => {
    // o login do app (lado Solicitante) nunca baixa relatório; a checagem fica aqui, na própria rota, para não depender do caminho
    if (req.appTokenId) return res.status(403).json({ error: 'Disponível só no site.' });
    const { key } = req.params;
    if (!registry.has(key)) return res.status(404).json({ error: 'Sistema não encontrado' });
    const acesso = await pg.get(`SELECT m.status, m.enabled, um.role FROM modules m
      JOIN user_modules um ON um.module_key = m.key AND um.user_id = ? WHERE m.key = ?`, req.user.id, key);
    if (!acesso || !hasRole(acesso.role, 'central')) return res.status(403).json({ error: 'O relatório é para quem é da Central deste sistema.' });
    if (!acesso.enabled || acesso.status !== 'ativo') return res.status(503).json({ error: 'Sistema indisponível' });
    try {
      enviarExcel(res, await gerarExcel({ chave: key, de: req.query.de, ate: req.query.ate, quem: req.user.name }));
    } catch (e) {
      if (e instanceof ErroRelatorio) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  }));
  return r;
}
