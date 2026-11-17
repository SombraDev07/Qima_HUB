// Popula o QIMA HUB com dados de TESTE pela própria API (passa pelas mesmas regras das telas).
// Uso: com o servidor rodando →  node scripts/seed-demo.mjs
// Variáveis opcionais: QIMA_URL (padrão http://localhost:3001), QIMA_ADMIN_EMAIL, QIMA_ADMIN_PASSWORD
const URL_BASE = process.env.QIMA_URL || 'http://localhost:3001';
const ADMIN = { email: process.env.QIMA_ADMIN_EMAIL || 'admin@qima.local', password: process.env.QIMA_ADMIN_PASSWORD || 'admin123' };
const SENHA_TESTE = 'teste123';

// ---------------------------------------------------------------- utilitários
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const shuffle = (a) => [...a].sort(() => rnd() - 0.5);
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const HOJE = new Date().toISOString().slice(0, 10);

async function login(email, password) {
  const r = await fetch(`${URL_BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`Login falhou para ${email}: ${(await r.json()).error}`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return (path, method = 'GET', body) => fetch(`${URL_BASE}${path}`, {
    method, headers: { Cookie: cookie, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data.error || ''}`);
    return data;
  });
}

// ---------------------------------------------------------------- dados
const CONTAS = [
  { name: 'Marina Solicitante (teste)', email: 'marina@qima.local', access: { hospedagens: 'solicitante', frotas: 'solicitante' } },
  { name: 'Rafael Solicitante (teste)', email: 'rafael@qima.local', access: { hospedagens: 'solicitante' } },
  { name: 'Joana Solicitante (teste)', email: 'joana@qima.local', access: { hospedagens: 'solicitante', contratacao: 'solicitante' } },
  { name: 'Paulo Central (teste)', email: 'central@qima.local', access: { hospedagens: 'central', frotas: 'central' } },
];

const PESSOAS = [
  'Alice Moreira', 'Bruno Tavares', 'Caio Fernandes', 'Daniela Rocha', 'Eduardo Lima', 'Fernanda Costa', 'Gabriel Nunes',
  'Helena Duarte', 'Igor Batista', 'Juliana Prado', 'Kleber Souza', 'Larissa Mendes', 'Marcos Vieira', 'Natália Campos',
  'Otávio Ramos', 'Patrícia Alves', 'Renato Barros', 'Sabrina Teixeira', 'Thiago Pires', 'Vanessa Lopes', 'William Araújo', 'Yasmin Freitas',
].map((nome, i) => ({
  nome, email: `${nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.teste@exemplo.com`,
  funcao: pick(['Inspetor', 'Classificador', 'Supervisor', 'Técnico de campo', 'Auditor']),
  cidade: pick(['Curitiba', 'Londrina', 'Cuiabá', 'Chapecó', 'Passo Fundo']),
  i,
}));

const HOTEIS = [
  ['Hotel Cuiabá Center', 'Cuiabá', 'MT', 210, 280, 350, 420],
  ['Pousada Várzea Grande', 'Várzea Grande', 'MT', 150, 200, 250, 0],
  ['Rondon Palace Hotel', 'Rondonópolis', 'MT', 190, 250, 310, 0],
  ['Sinop Plaza', 'Sinop', 'MT', 200, 260, 320, 380],
  ['Hotel Londrina Norte', 'Londrina', 'PR', 185, 245, 0, 0],
  ['Cascavel Executive', 'Cascavel', 'PR', 175, 230, 290, 0],
  ['Pousada Bituruna', 'Bituruna', 'PR', 169, 220, 0, 0],
  ['Hotel Garghetti', 'Seara', 'SC', 190, 260, 330, 400],
  ['Chapecó Tower Hotel', 'Chapecó', 'SC', 220, 290, 360, 0],
  ['Hotel Erechim Centro', 'Erechim', 'RS', 180, 240, 300, 0],
  ['Passo Fundo Inn', 'Passo Fundo', 'RS', 195, 255, 0, 0],
  ['Rio Verde Hotel', 'Rio Verde', 'GO', 205, 270, 335, 0],
].map(([nome, cidade, uf, s, d, t, q], i) => ({
  nome, cidade, uf, valor_s: s, valor_d: d, valor_t: t, valor_q: q, quartos: int(10, 60),
  endereco: `Rua de Teste, ${100 + i * 37} - Centro`, telefone: `(${int(41, 67)}) 3${int(100, 999)}-${int(1000, 9999)}`,
  email: `reservas${i}@hotel-teste.com`, garagem: pick(['gratis', 'gratis', 'paga', 'nao']), garagem_valor: 25,
}));

const CIDADES = [...new Set(HOTEIS.map((h) => `${h.cidade}|${h.uf}`))].map((c) => c.split('|'));
const PROJETOS = ['Harvest 2027', 'Harvest 2027', 'Monitoramento 2027', 'Fibra'];

// cenário de cada pedido (ordem = ordem de criação, VG crescente)
const CENARIOS = [
  'finalizado', 'finalizado', 'finalizado_checkout', 'finalizado', 'cancelado_central',
  'andamento', 'andamento_checkout', 'andamento_prorrogado', 'andamento', 'andamento_ajuste',
  'andamento_ajuste', 'andamento_ajuste', 'andamento', 'cancelado', 'parcial',
  'parcial', 'ajustado', 'novo', 'novo', 'novo', 'novo', 'novo', 'rascunho', 'rascunho',
];

// ---------------------------------------------------------------- execução
async function main() {
  console.log(`Conectando em ${URL_BASE}…`);
  const admin = await login(ADMIN.email, ADMIN.password);

  // contas
  const existentes = await admin('/api/admin/users');
  for (const c of CONTAS) {
    if (existentes.some((u) => u.email === c.email)) continue;
    await admin('/api/admin/users', 'POST', { name: c.name, email: c.email, password: SENHA_TESTE, is_admin: false, active: true, access: c.access });
    console.log(`  conta criada: ${c.email}`);
  }
  const solics = await Promise.all(CONTAS.slice(0, 3).map((c) => login(c.email, SENHA_TESTE)));
  const central = await login('central@qima.local', SENHA_TESTE);
  const H = '/api/m/hospedagens';

  // pessoas e hotéis (ignora duplicados)
  for (const p of PESSOAS) await central(`${H}/pessoas`, 'POST', p).catch(() => {});
  const hoteisAtuais = await central(`${H}/central/hoteis`);
  for (const h of HOTEIS) if (!hoteisAtuais.some((x) => x.nome === h.nome)) await central(`${H}/central/hoteis`, 'POST', h);
  const hoteis = await central(`${H}/central/hoteis`);
  const pessoas = await central(`${H}/pessoas?q=`);
  console.log(`  ${pessoas.length} pessoas · ${hoteis.length} hotéis`);

  const resumo = {};
  for (const [i, cen] of CENARIOS.entries()) {
    const sol = solics[i % solics.length];
    const [cidade, uf] = pick(CIDADES);
    const passado = cen.startsWith('finalizado') || cen === 'cancelado_central';
    const ini = passado ? addDays(HOJE, -int(20, 45)) : cen.startsWith('andamento') ? addDays(HOJE, -int(1, 6)) : addDays(HOJE, int(3, 30));
    const fim = addDays(ini, int(2, 8));
    const n = int(1, 5);
    const gente = shuffle(pessoas).slice(0, n).map((p) => ({ pessoa_id: p.id, nome: p.nome, email: p.email }));
    if (rnd() < 0.3) gente.push({ nome: 'Open_1', tipo: 'open' });
    const body = { cidade, uf, data_inicio: ini, data_fim: fim, projeto: pick(PROJETOS), garagem: pick(['sem', 'sem', 'free', 'paga']),
      obs: rnd() < 0.4 ? pick(['Preferência perto do centro', 'Equipe chega à noite', 'Precisa de café da manhã cedo', 'Um dos hóspedes tem restrição alimentar']) : '',
      hospedes: gente, rascunho: cen === 'rascunho' };

    const { id, codigo } = await sol(`${H}/meus`, 'POST', body);
    resumo[cen] = (resumo[cen] || 0) + 1;
    if (cen === 'rascunho' || cen === 'novo') continue;

    if (cen === 'ajustado') {
      await sol(`${H}/meus/${id}`, 'PUT', { ...body, data_fim: addDays(fim, 2), obs: 'Ajuste: ficaremos 2 dias a mais' });
      continue;
    }
    if (cen === 'cancelado') { await sol(`${H}/meus/${id}/cancelar`, 'POST'); continue; }

    // central monta os quartos
    const ped = await central(`${H}/central/pedidos/${id}`);
    const hs = shuffle(ped.hospedes.map((h) => h.id));
    const daCidade = hoteis.filter((h) => h.cidade === cidade);
    const hotel = pick(daCidade.length ? daCidade : hoteis);
    const grupos = [];
    for (let k = 0; k < hs.length;) { const t = Math.min(int(1, 3), hs.length - k); grupos.push(hs.slice(k, k + t)); k += t; }
    const usar = cen === 'parcial' ? grupos.slice(0, Math.max(1, grupos.length - 1)) : grupos;
    for (const g of usar) {
      const q = await central(`${H}/central/pedidos/${id}/quartos`, 'POST');
      const manual = rnd() < 0.1 ? 199.9 : null;
      await central(`${H}/central/quartos/${q.id}`, 'PUT', { hospedes: g, hotel_id: hotel.id, data_in: ini, data_out: fim, diaria: manual });
    }
    if (cen === 'parcial') continue;
    await central(`${H}/central/pedidos/${id}/enviar-tudo`, 'POST');

    let det = await central(`${H}/central/pedidos/${id}`);
    const quartoMulti = det.quartos.find((q) => q.ocupantes.length > 1) || det.quartos[0];
    const meio = addDays(ini, Math.max(1, Math.floor((Date.parse(fim) - Date.parse(ini)) / 86400000 / 2)));

    if (cen === 'andamento_checkout' || cen === 'finalizado_checkout') {
      const sai = quartoMulti.ocupantes[0];
      await central(`${H}/central/quartos/${quartoMulti.id}/checkout`, 'POST', { hospedes: [sai.id], data: meio });
    }
    if (cen === 'andamento_prorrogado') {
      const h = quartoMulti.ocupantes[0];
      await sol(`${H}/meus/${id}/solicitacoes`, 'POST', { hospede_id: h.id, tipo: 'prorrogar', data: addDays(fim, 3) });
      det = await central(`${H}/central/pedidos/${id}`);
      await central(`${H}/central/solicitacoes/${det.solicitacoes.find((s) => s.status === 'aberta').id}/confirmar`, 'POST');
    }
    if (cen === 'andamento_ajuste') {
      const tipo = ['prorrogar', 'checkout', 'cancelar', 'editar'][i % 4];
      const h = quartoMulti.ocupantes[quartoMulti.ocupantes.length - 1];
      await sol(`${H}/meus/${id}/solicitacoes`, 'POST', {
        hospede_id: h.id, tipo,
        data: tipo === 'prorrogar' ? addDays(fim, 2) : tipo === 'checkout' ? meio : undefined,
        obs: tipo === 'editar' ? 'Trocar o nome para o colaborador que vai no lugar' : tipo === 'cancelar' ? 'Não vai mais viajar' : '',
      });
      // um segundo ajuste em um dos pedidos
      if (i % 2 === 0 && det.quartos.length > 1) {
        const outro = det.quartos.find((q) => q.id !== quartoMulti.id && q.ocupantes.length);
        if (outro) await sol(`${H}/meus/${id}/solicitacoes`, 'POST', { hospede_id: outro.ocupantes[0].id, tipo: 'prorrogar', data: addDays(fim, 1) });
      }
    }
    if (cen === 'cancelado_central') {
      await sol(`${H}/meus/${id}/cancelar`, 'POST', { obs: 'Viagem cancelada pelo cliente' });
      det = await central(`${H}/central/pedidos/${id}`);
      await central(`${H}/central/solicitacoes/${det.solicitacoes.find((s) => s.status === 'aberta').id}/confirmar`, 'POST');
      continue;
    }

    // financeiro em pedidos passados ou em andamento
    if (passado || rnd() < 0.4) {
      det = await central(`${H}/central/pedidos/${id}`);
      for (const [k, q] of det.quartos.entries()) {
        const pago = passado && rnd() < 0.6;
        await central(`${H}/central/quartos/${q.id}/financeiro`, 'PUT', {
          fin_extra: rnd() < 0.3 ? int(30, 250) : 0,
          fin_extra_obs: rnd() < 0.3 ? pick(['Lavanderia', 'Frigobar', 'Garagem', 'Jantar']) : '',
          fin_extrato_id: passado ? String(int(100, 999)) : '',
          fin_extrato_status: passado ? pick(['Finalizado', 'Recebido - Parcial', 'Pendente']) : 'Em Aberto',
          fin_extrato_ini: ini, fin_extrato_fim: meio,
          fin_dt_solicitacao: passado ? addDays(fim, 1) : '',
          fin_po: passado ? `PO-${int(1000, 9999)}` : '',
          fin_dt_abertura: passado ? addDays(fim, 3) : '',
          fin_dt_nf: pago ? addDays(fim, 5) : '',
          fin_nf: pago ? String(int(1000, 99999)) : '',
          fin_vencimento: passado ? addDays(fim, 30) : '',
          fin_status_pg: pago ? 'Pago' : passado ? pick(['Pendente', 'Em andamento']) : 'Pendente',
          fin_obs: k === 0 && passado ? 'Faturado junto com os demais quartos' : '',
        });
      }
    }
    if (cen.startsWith('finalizado')) await central(`${H}/central/pedidos/${id}/finalizar`, 'POST');
    process.stdout.write(`  ${codigo} ${cen}\n`);
  }

  console.log('\nResumo:', resumo);
  console.log(`\nContas de teste (senha "${SENHA_TESTE}"): ${CONTAS.map((c) => c.email).join(', ')}`);
}

main().catch((e) => { console.error('\nERRO:', e.message); process.exit(1); });
