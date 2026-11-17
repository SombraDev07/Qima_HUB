// Dados de TESTE do sistema Contratação: banco de pessoas, vagas em todos os status, anexos e demissões.
// Uso: com o servidor rodando →  node scripts/seed-contratacao.mjs
const URL_BASE = process.env.QIMA_URL || 'http://localhost:3001';
const ADMIN = { email: process.env.QIMA_ADMIN_EMAIL || 'admin@qima.local', password: process.env.QIMA_ADMIN_PASSWORD || 'admin123' };
const SENHA = 'teste123';
const C = '/api/m/contratacao';

let seed = 777;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const hoje = new Date().toISOString().slice(0, 10);
const dias = (n) => { const d = new Date(hoje + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function login(email, password) {
  const r = await fetch(`${URL_BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`Login falhou para ${email}. Rode antes: node scripts/seed-demo.mjs`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return async (path, method = 'GET', body) => {
    const res = await fetch(`${URL_BASE}${path}`, { method, headers: { Cookie: cookie, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data.error || ''}`);
    return data;
  };
}

function cpf() {
  const d = Array.from({ length: 9 }, () => int(0, 9));
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  d.push(dv(9)); d.push(dv(10));
  return d.join('');
}

const LOCAIS =[['Nova Esperança', 'MT'], ['Cuiabá', 'MT'], ['Rondonópolis', 'MT'], ['Alta Floresta', 'MT'], ['Várzea Grande', 'MT'], ['Sorriso', 'MT'], ['Curitiba', 'PR'], ['Londrina', 'PR'], ['Chapecó', 'SC']];
const NOMES = ['Andressa Alencar', 'Arthur Eugenio Campos', 'Carlos Bernandes', 'Diennyfer Leticia Dias', 'Gabriela Rodrigues Lima', 'Jhan Pierry Moraes', 'Larissa Vitoratto',
  'Leticia Amorim Koliski', 'Marcel Figueredo', 'Natanael Sapelli Gomes', 'Pedro Alcatara', 'Ricarla Calegari', 'Tiago Monteiro', 'Vinicius Rocha', 'Beatriz Lacerda',
  'Rodrigo Silveira', 'Camila Prates', 'Fabio Nogueira', 'Juliana Bastos', 'Otavio Brandao', 'Sabrina Kuhn', 'Wesley Martins', 'Paula Zanetti', 'Henrique Toledo', 'Aline Ferraz', 'Mateus Dorneles'];
const OBS = ['Equipe para início da colheita', 'Reposição de auditor que saiu', 'Reforço para o turno da noite', 'Abertura de nova frente', 'Substituir férias', 'Precisa ter carro próprio'];

async function main() {
  console.log(`Conectando em ${URL_BASE}…`);
  const admin = await login(ADMIN.email, ADMIN.password);
  await admin('/api/admin/modules/contratacao', 'PUT', { status: 'ativo', sort_order: 1, enabled: true });
  const acesso = { 'marina@qima.local': 'solicitante', 'rafael@qima.local': 'solicitante', 'joana@qima.local': 'solicitante', 'central@qima.local': 'central', 'admin@qima.local': 'ambos' };
  for (const u of await admin('/api/admin/users')) {
    if (acesso[u.email]) await admin(`/api/admin/users/${u.id}`, 'PUT', { name: u.name, email: u.email, is_admin: u.is_admin, active: u.active, access: { ...u.access, contratacao: acesso[u.email] } });
  }
  const [marina, rafael, joana, central] = await Promise.all(['marina', 'rafael', 'joana', 'central'].map((n) => login(`${n}@qima.local`, SENHA)));

  // Banco de pessoas
  const existentes = await central(`${C}/central/banco`);
  for (const [i, nome] of NOMES.entries()) {
    const email = `${nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${i}@exemplo.com`;
    if (existentes.some((b) => b.email === email)) continue;
    const [cidade, uf] = i < 16 ? pick(LOCAIS.slice(0, 6)) : pick(LOCAIS);
    await central(`${C}/central/banco`, 'POST', {
      nome, email, funcao: i % 6 === 0 ? 'Líder' : 'Auditor', cidade, uf, projeto: pick(['Todos', 'Todos', 'Harvest 2027', 'Monitoramento 2027']),
      cnh: rnd() > 0.3, movel: rnd() > 0.5, experiencia: rnd() > 0.35, contratado: rnd() > 0.8,
      cpf: cpf(), telefone: `(${int(41, 67)}) 9${int(1000, 9999)}-${int(1000, 9999)}`, nascimento: `19${int(75, 99)}-0${int(1, 9)}-1${int(0, 9)}`,
    });
  }
  const banco = await central(`${C}/central/banco`);
  const livres = () => banco.filter((b) => b.status !== 'anexado' && b.status !== 'demitido' && !b.usado);
  const pega = (n, funcao) => { const xs = livres().filter((b) => !funcao || b.funcao === funcao).slice(0, n); xs.forEach((b) => { b.usado = true; }); return xs.map((b) => b.id); };
  console.log(`  ${banco.length} pessoas no banco`);

  // Vagas
  const novo = async (call, { funcao = 'Auditor', qtd = int(1, 4), em = int(-20, 25), local = pick(LOCAIS), movel = rnd() > 0.6, rascunho = false } = {}) => call(`${C}/meus`, 'POST', {
    projeto: pick(['Harvest 2027', 'Harvest 2027', 'Monitoramento 2027', 'Fibra Projeto 2027']), funcao, cidade: local[0], uf: local[1], data_desejada: dias(em),
    qtd, movel, cnh: rnd() > 0.5, experiencia: rnd() > 0.5, observacao: pick(OBS), rascunho,
  });
  const out = [];
  const sols = [marina, rafael, joana];
  // pendentes (novos)
  for (let i = 0; i < 5; i++) await novo(sols[i % 3], { em: int(2, 20) });
  out.push('5 vagas pendentes (novas)');
  // em recrutamento
  for (let i = 0; i < 2; i++) { const v = await novo(sols[i], { qtd: 3 }); await central(`${C}/central/pedidos/${v.id}/status`, 'PUT', { status: 'em_recrutamento' }); }
  // parcialmente atendidas
  const parciais = [];
  for (let i = 0; i < 3; i++) { const v = await novo(sols[i], { qtd: int(3, 5), em: int(-10, 10) }); await central(`${C}/central/pedidos/${v.id}/anexar`, 'POST', { pessoas: pega(int(1, 2), 'Auditor') }); parciais.push(v); }
  // atendidas (uma de líder)
  const atendidas = [];
  for (const [i, funcao] of ['Auditor', 'Líder', 'Auditor'].entries()) { const v = await novo(sols[i], { funcao, qtd: 2, em: int(-15, 5) }); await central(`${C}/central/pedidos/${v.id}/anexar`, 'POST', { pessoas: pega(2, funcao === 'Líder' ? null : 'Auditor') }); atendidas.push(v); }
  // fechadas
  for (let i = 0; i < 2; i++) { const v = await novo(sols[i], { qtd: 2, em: -int(20, 40) }); await central(`${C}/central/pedidos/${v.id}/anexar`, 'POST', { pessoas: pega(2) }); await central(`${C}/central/pedidos/${v.id}/finalizar`, 'POST'); }
  out.push('2 em recrutamento · 3 parcialmente atendidas · 3 atendidas · 2 fechadas');
  // cancelada pelo solicitante, recusada pelo RH, rascunhos
  const c1 = await novo(rafael); await rafael(`${C}/meus/${c1.id}/cancelar`, 'POST');
  const c2 = await novo(joana); await central(`${C}/central/pedidos/${c2.id}/status`, 'PUT', { status: 'recusado' });
  await novo(marina, { rascunho: true }); await novo(joana, { rascunho: true });
  out.push('1 cancelada · 1 recusada · 2 rascunhos');

  // Demissões: duas pendentes, uma aceita, uma recusada
  const grupos = [...atendidas, ...parciais];
  const pessoasDe = async (call, v) => (await call(`${C}/meus`)).find((p) => p.id === v.id).anexos;
  const demissao = async (call, v, extra) => { const ax = (await pessoasDe(call, v))[0]; if (!ax) return null; await call(`${C}/anexos/${ax.anexo_id}/demissao`, 'POST', { tipo: 'empresa', gestor: 'Supervisor de Campo', data_prevista: dias(5), ultimo_dia: dias(4), aviso: 'Trabalhado', justificativa: 'Desempenho', obs: 'Faltas recorrentes', confirmado: true, ...extra }); return ax; };
  const callDe = (v) => sols[[...atendidas, ...parciais].indexOf(v) % 3];
  await demissao(marina, grupos[0]);
  await demissao(rafael, grupos[1], { tipo: 'colaborador', justificativa: 'Pedido do colaborador', aviso: 'Indenizado', obs: 'Mudança de cidade' });
  await demissao(joana, grupos[2]);
  const dems = await central(`${C}/central/demissoes`);
  const pend = dems.filter((d) => d.status === 'pendente');
  if (pend[2]) await central(`${C}/central/demissoes/${pend[2].id}/aceitar`, 'POST');
  void callDe;
  out.push(`${Math.max(0, pend.length - 1)} demissões pendentes · ${pend[2] ? 1 : 0} aceita`);

  console.log(out.map((s) => `  ${s}`).join('\n'));
  console.log(`\nContas (senha "${SENHA}"): marina@, rafael@, joana@qima.local (solicitantes) · central@qima.local (central)`);
}

main().catch((e) => { console.error('\nERRO:', e.message); process.exit(1); });
