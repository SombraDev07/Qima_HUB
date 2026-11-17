// Dados de TESTE do sistema Solicitações: os 4 tipos, todas as situações, planilhas e conversas.
// Uso: com o servidor rodando →  node scripts/seed-solicitacoes.mjs
import { buildXlsx as xlsx } from '../core/server/lib/xlsx.js';

const URL_BASE = process.env.QIMA_URL || 'http://localhost:3001';
const ADMIN = { email: process.env.QIMA_ADMIN_EMAIL || 'admin@qima.local', password: process.env.QIMA_ADMIN_PASSWORD || 'admin123' };
const SENHA = 'teste123';
const M = '/api/m/solicitacoes';

let seed = 99;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const dias = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function login(email, password) {
  const r = await fetch(`${URL_BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`Login falhou para ${email}. Rode antes: node scripts/seed-demo.mjs`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const fn = async (path, method = 'GET', body) => {
    const res = await fetch(`${URL_BASE}${path}`, { method, headers: { Cookie: cookie, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data.error || ''}`);
    return data;
  };
  fn.upload = async (nome, buf) => {
    const res = await fetch(`${URL_BASE}${M}/arquivos?nome=${encodeURIComponent(nome)}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/octet-stream' }, body: buf });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.id;
  };
  return fn;
}

// planilha de exemplo (Excel de verdade)
const planilha = (titulo, n) => xlsx([{ name: 'Dados', columns: [{ label: 'Código da visita', width: 16 }, { label: 'Produtor', width: 26 }, { label: 'Data', type: 'date' }, { label: 'Área (ha)' }, { label: 'Amostras' }],
  rows: Array.from({ length: n }, (_, i) => [`V-${int(1000, 9999)}`, `${titulo} - produtor ${i + 1}`, dias(-int(1, 30)), int(5, 400), int(1, 40)]) }]);

// documentos válidos para as linhas de correção
const cpf = () => { const d = Array.from({ length: 9 }, () => int(0, 9)); const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; d.push(dv(9)); d.push(dv(10)); return d.join(''); };
const cnpj = () => { const d = [...Array.from({ length: 8 }, () => int(0, 9)), 0, 0, 0, 1]; const dv = (n) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const r = p.reduce((a, x, i) => a + x * d[i], 0) % 11; return r < 2 ? 0 : 11 - r; }; d.push(dv(12)); d.push(dv(13)); return d.join(''); };
const linhas = (n) => Array.from({ length: n }, () => ({ cod_visita: `V-${int(10000, 99999)}`, documento: rnd() > 0.5 ? cpf() : cnpj(), data: dias(-int(2, 20)),
  negativa: int(0, 40), declarada: int(50, 900), positiva: int(0, 120), participante: int(1, 30) }));

const MOTIVOS = ['Carga lançada em duplicidade', 'Visita registrada no produtor errado', 'Amostra perdida no transporte', 'Carga de teste enviada por engano'];

async function main() {
  console.log(`Conectando em ${URL_BASE}…`);
  const admin = await login(ADMIN.email, ADMIN.password);
  await admin('/api/admin/modules/solicitacoes', 'PUT', { status: 'ativo', sort_order: 5, enabled: true });
  const acesso = { 'marina@qima.local': 'solicitante', 'rafael@qima.local': 'solicitante', 'joana@qima.local': 'solicitante', 'central@qima.local': 'central', 'admin@qima.local': 'ambos' };
  for (const u of await admin('/api/admin/users')) {
    if (acesso[u.email]) await admin(`/api/admin/users/${u.id}`, 'PUT', { name: u.name, email: u.email, is_admin: u.is_admin, active: u.active, access: { ...u.access, solicitacoes: acesso[u.email] } });
  }
  const [marina, rafael, joana, central] = await Promise.all(['marina', 'rafael', 'joana', 'central'].map((n) => login(`${n}@qima.local`, SENHA)));
  if ((await marina(`${M}/meus`)).length) { console.log('Solicitações já tem dados de teste — nada a fazer.'); return; }
  const sols = [marina, rafael, joana, admin];

  const criar = async (s, tipo) => {
    const base = { projeto: 'Harvest 2027' };
    if (tipo === 'exclusao') return s(`${M}/meus`, 'POST', { ...base, tipo, cod_visita: `V-${int(1000, 9999)}`, id_carga: `CG-${int(10000, 99999)}`, motivo: pick(MOTIVOS), descricao: 'Pode excluir, a carga certa já foi lançada.' });
    if (tipo === 'insercao') {
      const arquivo_id = await s.upload(`insercao-visita-${int(100, 999)}.xlsx`, planilha('Inserção', int(5, 25)));
      return s(`${M}/meus`, 'POST', { ...base, tipo, cod_visita: `V-${int(1000, 9999)}`, descricao: 'Dados coletados offline, seguem na planilha.', arquivo_id });
    }
    if (tipo === 'acum-ins') {
      const arquivo_id = await s.upload('modelo-acumulado-harvest.xlsx', planilha('Acumulado', int(10, 40)));
      return s(`${M}/meus`, 'POST', { ...base, tipo: 'acumulado', subtipo: 'insercao', titulo: `Acumulado semana ${int(40, 46)}`, data_inicial: dias(-14), data_final: dias(-7), descricao: 'Acumulado das regionais sul.', arquivo_id });
    }
    return s(`${M}/meus`, 'POST', { ...base, tipo: 'acumulado', subtipo: 'correcao', linhas: linhas(int(2, 6)), descricao: rnd() > 0.5 ? 'Valores conferidos com o produtor.' : '', confirmar: true });
  };
  const status = (id, st, mensagem) => central(`${M}/central/pedidos/${id}/status`, 'POST', { status: st, mensagem });
  const falar = (s, id, texto, lado) => s(`${M}/pedidos/${id}/mensagens`, 'POST', { texto, lado });
  const tipos = ['exclusao', 'insercao', 'acum-ins', 'acum-cor'];

  // pendentes
  for (let i = 0; i < 6; i++) await criar(sols[i % 4], tipos[i % 4]);
  // pendente com pergunta do solicitante
  const p1 = await criar(marina, 'insercao');
  await falar(marina, p1.id, 'Esqueci de avisar: as 3 últimas linhas são da fazenda nova, ainda sem código no sistema.', 'solicitante');
  // em análise (com conversa)
  for (let i = 0; i < 4; i++) {
    const p = await criar(sols[(i + 1) % 4], tipos[(i + 2) % 4]);
    await status(p.id, 'analise');
    if (i === 0) await falar(central, p.id, 'Estou lançando agora. A visita V-1020 não aparece no sistema, pode confirmar o código?', 'central');
  }
  // devolvidas para correção (o erro que a central encontrou)
  const c1 = await criar(rafael, 'acum-cor');
  await status(c1.id, 'correcao', 'A linha 2 está com o CNPJ de outro produtor e a data é de antes da safra. Corrija e reenvie, por favor.');
  const c2 = await criar(joana, 'insercao');
  await status(c2.id, 'analise');
  await status(c2.id, 'correcao', 'A planilha veio com a coluna "Amostras" vazia. Preencha e anexe de novo.');
  const c3 = await criar(admin, 'exclusao');
  await status(c3.id, 'correcao', 'O ID da carga não existe. Confira o número no app de coleta.');
  // corrigida e reenviada (volta para pendente) com histórico
  const c4 = await criar(marina, 'exclusao');
  await status(c4.id, 'correcao', 'Falta dizer qual carga fica no lugar.');
  const det = await marina(`${M}/pedidos/${c4.id}`);
  await marina(`${M}/meus/${c4.id}`, 'PUT', { ...det, descricao: 'A carga certa é a CG-55120, lançada ontem.' });
  // feitos
  for (let i = 0; i < 7; i++) {
    const p = await criar(sols[i % 4], tipos[i % 4]);
    await status(p.id, 'analise');
    await status(p.id, 'feito', i % 2 ? 'Lançado no sistema.' : '');
  }
  // cancelado
  const x = await criar(rafael, 'exclusao');
  await rafael(`${M}/meus/${x.id}/cancelar`, 'POST');

  const todos = await central(`${M}/central/pedidos`);
  console.log('Solicitações pronto:', todos.reduce((a, p) => ({ ...a, [p.status]: (a[p.status] || 0) + 1 }), {}));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
