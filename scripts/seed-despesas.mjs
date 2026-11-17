// Dados de TESTE do sistema Despesas: cupons fictícios (imagens geradas), pedidos em todas as situações.
// Uso: com o servidor rodando (de preferência com QIMA_AI_PROVIDER=demo no .env)  →  node scripts/seed-despesas.mjs
import { cupomPng } from './lib/cupom.mjs';

const URL_BASE = process.env.QIMA_URL || 'http://localhost:3001';
const ADMIN = { email: process.env.QIMA_ADMIN_EMAIL || 'admin@qima.local', password: process.env.QIMA_ADMIN_PASSWORD || 'admin123' };
const SENHA = 'teste123';
const D = '/api/m/despesas';

let seed = 2027;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const hoje = new Date().toISOString().slice(0, 10);
const dias = (n) => { const d = new Date(hoje + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

async function login(email, password) {
  const r = await fetch(`${URL_BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`Login falhou para ${email}: ${(await r.json()).error}. Rode antes: node scripts/seed-demo.mjs`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (path, method = 'GET', body, headers = {}) => {
    const isBuf = Buffer.isBuffer(body);
    const res = await fetch(`${URL_BASE}${path}`, {
      method, headers: { Cookie: cookie, ...(body !== undefined && !isBuf ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : isBuf ? body : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data.error || ''}`);
    return data;
  };
  return call;
}

// ---------------------------------------------------------------- cupons fictícios
const EMITENTES = [
  { emitente: 'Restaurante Sabor do Campo Ltda', tipo: 'Alimentação', itens: ['PRATO EXECUTIVO', 'SUCO NATURAL', 'REFRIGERANTE LATA', 'SOBREMESA'], faixa: [28, 95], pag: 'CARTAO DEBITO' },
  { emitente: 'Churrascaria Boi na Brasa Ltda', tipo: 'Alimentação', itens: ['RODIZIO', 'AGUA MINERAL', 'REFRIGERANTE 600ML'], faixa: [60, 160], pag: 'CARTAO CREDITO' },
  { emitente: 'Padaria Pao Quente ME', tipo: 'Alimentação', itens: ['CAFE COM LEITE', 'PAO DE QUEIJO', 'MISTO QUENTE'], faixa: [12, 38], pag: 'PIX' },
  { emitente: 'Auto Posto Estrada Real Ltda', tipo: 'Combustível', itens: ['GASOLINA COMUM'], faixa: [150, 320], pag: 'CARTAO CREDITO' },
  { emitente: 'Posto Rodovia Sul Combustiveis', tipo: 'Combustível', itens: ['DIESEL S10'], faixa: [180, 420], pag: 'CARTAO DEBITO' },
  { emitente: 'Concessionaria Via Norte S.A.', tipo: 'Pedágio', itens: ['TARIFA CAT 1'], faixa: [7, 22], pag: 'DINHEIRO' },
  { emitente: 'Estacionamento Central Park', tipo: 'Estacionamento', itens: ['PERMANENCIA 3H'], faixa: [15, 40], pag: 'PIX' },
  { emitente: 'Papelaria e Informatica Alfa', tipo: 'Material', itens: ['CANETA ESF', 'BLOCO ANOT', 'PILHA AA C/4'], faixa: [18, 75], pag: 'CARTAO DEBITO' },
  { emitente: 'Pousada do Viajante Ltda', tipo: 'Hospedagem', itens: ['DIARIA APTO SOLTEIRO'], faixa: [140, 260], pag: 'CARTAO CREDITO' },
];
const CNPJS = new Map();
const cnpjDe = (e) => {
  if (!CNPJS.has(e)) CNPJS.set(e, `${Array.from({ length: 8 }, () => int(0, 9)).join('')}0001${int(10, 99)}`);
  return CNPJS.get(e);
};

function novoCupom({ dataAtras = int(1, 20), emit = pick(EMITENTES), legivel = true, nf, cnpj } = {}) {
  const total = Math.round((emit.faixa[0] + rnd() * (emit.faixa[1] - emit.faixa[0])) * 100) / 100;
  const n = Math.min(emit.itens.length, int(1, emit.itens.length));
  let resto = total;
  const itens = Array.from({ length: n }, (_, i) => {
    const v = i === n - 1 ? resto : Math.round(total / n * (0.6 + rnd() * 0.5) * 100) / 100;
    resto = Math.round((resto - v) * 100) / 100;
    return { desc: emit.itens[i], valor: v };
  }).filter((it) => it.valor > 0);
  const data = dias(dataAtras);
  const cn = cnpj || cnpjDe(emit.emitente);
  const numero = nf || int(1000, 99999);
  const chave = `41${data.slice(2, 4)}${data.slice(5, 7)}${cn}65001${String(numero).padStart(9, '0')}1${String(int(10000000, 99999999))}${int(0, 9)}`;
  const info = { ...emit, cnpj: cn, total, data, nf: numero, chave };
  const png = cupomPng({ ...info, itens, hora: `${String(int(7, 21)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}`, pagamento: emit.pag,
    endereco: `RUA DAS FLORES, ${int(10, 999)} - CENTRO`, seed: int(1, 1e6), legivel });
  return { png, info };
}

async function enviar(call, cupom) {
  return call(`${D}/notas?nome=cupom-${cupom.info.nf}.png`, 'POST', cupom.png, { 'Content-Type': 'image/png' });
}
async function pedido(call, notas, extra = {}) {
  return call(`${D}/pedidos`, 'POST', { notas: notas.map((n) => n.id), pix_tipo: 'CPF', pix_chave: `${int(100, 999)}.${int(100, 999)}.${int(100, 999)}-${int(10, 99)}`, ...extra });
}
async function garantirCampos(call, nota, cupom) {
  if (nota.valor && nota.data && nota.tipo) return nota;
  // sem IA (modo manual): preenche como o colaborador faria
  return call(`${D}/notas/${nota.id}`, 'PATCH', {
    valor: cupom.info.total, data: cupom.info.data, tipo: cupom.info.tipo, motivo: `${cupom.info.tipo} - ${cupom.info.emitente}`,
    emitente: cupom.info.emitente, cnpj: cupom.info.cnpj, numero_nf: String(cupom.info.nf),
  });
}

async function main() {
  console.log(`Conectando em ${URL_BASE}…`);
  const admin = await login(ADMIN.email, ADMIN.password);
  await admin('/api/admin/modules/despesas', 'PUT', { status: 'ativo', sort_order: 7, enabled: true });

  // acesso ao Despesas para as contas de teste
  const users = await admin('/api/admin/users');
  const acesso = { 'marina@qima.local': 'solicitante', 'rafael@qima.local': 'solicitante', 'joana@qima.local': 'solicitante', 'central@qima.local': 'central', 'admin@qima.local': 'ambos' };
  for (const u of users) {
    if (!acesso[u.email]) continue;
    await admin(`/api/admin/users/${u.id}`, 'PUT', { name: u.name, email: u.email, is_admin: u.is_admin, active: u.active, access: { ...u.access, despesas: acesso[u.email] } });
  }
  const [marina, rafael, joana, central] = await Promise.all(['marina', 'rafael', 'joana', 'central'].map((n) => login(`${n}@qima.local`, SENHA)));
  const cfg = await marina(`${D}/config`);
  console.log(`  IA: ${cfg.ia.ativo ? `ativa (${cfg.ia.provedor})` : 'desligada — campos preenchidos como modo manual'}`);

  const subir = async (call, opts) => { const c = novoCupom(opts); const n = await garantirCampos(call, await enviar(call, c), c); return { n, c }; };
  const ok = (n, body) => central(`${D}/central/notas/${n.id}/ok`, 'POST', body || {});
  const recusar = (n, motivo) => central(`${D}/central/notas/${n.id}/recusar`, 'POST', { motivo });
  const out = [];

  // 1 · Marina: tudo aprovado e pago
  const m1 = await Promise.all([1, 2, 3].map(() => subir(marina, { dataAtras: int(10, 25) })));
  const p1 = await pedido(marina, m1.map((x) => x.n), { centro_custo: 'Harvest 2027' });
  for (const x of m1) await ok(x.n);
  await central(`${D}/central/pedidos/${p1.id}/obs`, 'PUT', { obs_central: 'Tudo certo. Pagamento na próxima sexta.' });
  await central(`${D}/central/pedidos/${p1.id}/pagamento`, 'POST', { pago_em: dias(2) });
  out.push(`${p1.codigo} aprovado e pago`);

  // 2 · Marina: uma nota antiga recusada e reenviada com foto nova
  const m2a = await subir(marina, { dataAtras: 75 });
  const m2b = await subir(marina, { dataAtras: 5 });
  const p2 = await pedido(marina, [m2a.n, m2b.n], { centro_custo: 'Geral' });
  await ok(m2b.n);
  await recusar(m2a.n, 'Data fora do prazo — envie a nota correta da viagem');
  const nova = novoCupom({ dataAtras: 4, emit: EMITENTES[0] });
  let sub = await marina(`${D}/notas?nome=nova.png&substitui=${m2a.n.id}`, 'POST', nova.png, { 'Content-Type': 'image/png' });
  sub = await garantirCampos(marina, sub, nova);
  await marina(`${D}/notas/${sub.id}/reenviar`, 'POST');
  out.push(`${p2.codigo} parcial → nota substituída aguardando`);

  // 3 · Rafael: 4 notas aguardando, uma com valor alterado pelo colaborador
  const r3 = await Promise.all([1, 2, 3, 4].map(() => subir(rafael, { dataAtras: int(1, 12) })));
  await rafael(`${D}/notas/${r3[1].n.id}`, 'PATCH', { valor: Math.round((r3[1].c.info.total + 15) * 100) / 100 });
  const p3 = await pedido(rafael, r3.map((x) => x.n), { centro_custo: 'Monitoramento 2027', obs: 'Viagem de auditoria em Cuiabá' });
  out.push(`${p3.codigo} aguardando (valor alterado)`);

  // 4 · Rafael: reenvia a MESMA foto de uma nota da Marina (duplicada)
  let dup = await rafael(`${D}/notas?nome=foto.png`, 'POST', m1[0].c.png, { 'Content-Type': 'image/png' });
  dup = await garantirCampos(rafael, dup, m1[0].c);
  const p4 = await pedido(rafael, [dup]);
  out.push(`${p4.codigo} aguardando (mesma foto de outro pedido)`);

  // 5 · Joana: uma nota ilegível (IA não lê) preenchida à mão
  const j5a = await subir(joana, { dataAtras: 3 });
  const ileg = novoCupom({ dataAtras: 3, legivel: false, emit: EMITENTES[3] });
  let nIleg = await enviar(joana, ileg);
  nIleg = await joana(`${D}/notas/${nIleg.id}`, 'PATCH', { valor: ileg.info.total, data: ileg.info.data, tipo: 'Combustível', motivo: 'Abastecimento carro da empresa' });
  const p5 = await pedido(joana, [j5a.n, nIleg], { centro_custo: 'Fibra' });
  out.push(`${p5.codigo} aguardando (nota ilegível)`);

  // 6 · Joana: tudo recusado
  const j6 = await Promise.all([1, 2].map(() => subir(joana, { dataAtras: int(40, 60), emit: EMITENTES[6] })));
  const p6 = await pedido(joana, j6.map((x) => x.n));
  await central(`${D}/central/pedidos/${p6.id}/reprovar-tudo`, 'POST', { motivo: 'Estacionamento particular não é reembolsável' });
  await central(`${D}/central/pedidos/${p6.id}/obs`, 'PUT', { obs_central: 'Conforme política, estacionamento só com autorização prévia do gestor.' });
  out.push(`${p6.codigo} reprovado`);

  // 7 · Joana: aprovado (central corrigiu um valor) — a pagar
  const j7 = await Promise.all([1, 2, 3].map(() => subir(joana, { dataAtras: int(5, 15) })));
  const p7 = await pedido(joana, j7.map((x) => x.n), { centro_custo: 'Harvest 2027' });
  await central(`${D}/central/notas/${j7[0].n.id}`, 'PATCH', { valor: Math.round((j7[0].c.info.total - 5) * 100) / 100, motivo: 'Almoço (gorjeta não reembolsável)' });
  for (const x of j7) await ok(x.n);
  out.push(`${p7.codigo} aprovado (a pagar)`);

  // 8 · Marina: nota com a MESMA NF de outra nota (foto diferente)
  const base = j7[1].c.info;
  const mesmaNf = novoCupom({ dataAtras: Math.round((Date.parse(hoje) - Date.parse(base.data)) / 864e5), emit: EMITENTES.find((e) => e.emitente === base.emitente), nf: base.nf, cnpj: base.cnpj });
  const m8 = await garantirCampos(marina, await enviar(marina, mesmaNf), mesmaNf);
  const p8 = await pedido(marina, [m8]);
  out.push(`${p8.codigo} aguardando (mesma NF de outro pedido)`);

  // 9 · Rafael: pedido cancelado
  const r9 = await subir(rafael, { dataAtras: 2 });
  const p9 = await pedido(rafael, [r9.n]);
  await rafael(`${D}/pedidos/${p9.id}/cancelar`, 'POST');
  out.push(`${p9.codigo} cancelado`);

  // 10 · Marina e Rafael: mais pedidos aguardando para encher a fila
  for (const call of [marina, rafael, joana]) {
    const xs = await Promise.all([1, 2].map(() => subir(call, { dataAtras: int(1, 9) })));
    const p = await pedido(call, xs.map((x) => x.n));
    out.push(`${p.codigo} aguardando`);
  }

  // 11 · Joana: rascunhos (fotos enviadas, pedido ainda não enviado)
  await Promise.all([1, 2].map(() => subir(joana, { dataAtras: int(1, 3) })));
  out.push('2 rascunhos da Joana (tela Novo pedido)');

  console.log(out.map((s) => `  ${s}`).join('\n'));
  console.log(`\nContas (senha "${SENHA}"): marina@, rafael@, joana@qima.local (solicitantes) · central@qima.local (central)`);
}

main().catch((e) => { console.error('\nERRO:', e.message); process.exit(1); });
