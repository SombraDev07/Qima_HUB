// Dados de TESTE do sistema Nota NF: DANFEs fictícios de semente de soja em todas as situações.
// Uso: servidor rodando (QIMA_AI_PROVIDER=demo no .env para simular a leitura)  →  node scripts/seed-nota-nf.mjs
import { danfePng } from './lib/danfe.mjs';

const URL_BASE = process.env.QIMA_URL || 'http://localhost:3001';
const ADMIN = { email: process.env.QIMA_ADMIN_EMAIL || 'admin@qima.local', password: process.env.QIMA_ADMIN_PASSWORD || 'admin123' };
const SENHA = 'teste123';
const M = '/api/m/nota_nf';

let seed = 4141;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const hoje = new Date().toISOString().slice(0, 10);
const dias = (n) => { const d = new Date(hoje + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

// ---------------------------------------------------------------- documentos válidos (fictícios)
function cnpj(base8) {
  const d = (base8 + '0001').split('').map(Number);
  const dv = (w) => { const s = w.reduce((a, x, i) => a + x * d[i], 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  d.push(dv([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])); d.push(dv([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  return d.join('');
}
function cpf() {
  const d = Array.from({ length: 9 }, () => int(0, 9));
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  d.push(dv(9)); d.push(dv(10));
  return d.join('');
}
const UF_COD = { PR: '41', SC: '42', RS: '43', MT: '51', GO: '52', MS: '50' };
function chave(uf, data, cnpjEmit, serie, numero) {
  const c43 = `${UF_COD[uf]}${data.slice(2, 4)}${data.slice(5, 7)}${cnpjEmit}55${String(serie).padStart(3, '0')}${String(numero).padStart(9, '0')}1${String(int(10000000, 99999999))}`;
  let peso = 2; let soma = 0;
  for (let i = c43.length - 1; i >= 0; i--) { soma += Number(c43[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return c43 + (r < 2 ? 0 : 11 - r);
}

const EMITENTES = [
  { nome: 'Cooperativa Agroindustrial Campos Gerais', cnpj: cnpj('48213077'), endereco: 'RODOVIA BR 277 KM 12 S/N', cidade: 'PONTA GROSSA', uf: 'PR', ie: '9012345611', marca: 'CAMPOS' },
  { nome: 'Cooperativa Agricola Vale Verde', cnpj: cnpj('63150244'), endereco: 'AV DAS INDUSTRIAS 1500', cidade: 'CHAPECO', uf: 'SC', ie: '255120737', marca: 'VALEVERDE' },
  { nome: 'Sementes Planalto Ltda', cnpj: cnpj('17330598'), endereco: 'ESTRADA MUNICIPAL KM 4', cidade: 'PASSO FUNDO', uf: 'RS', ie: '0870123456', marca: 'PLANALTO' },
  { nome: 'Agro Sementes Cerrado S.A.', cnpj: cnpj('29874410'), endereco: 'RODOVIA MT 130 KM 8', cidade: 'RONDONOPOLIS', uf: 'MT', ie: '133456789', marca: 'CERRADO' },
];
const PRODUTORES = [
  ['Luciano Santana', 'Papanduva', 'SC'], ['Marcia Kowalski', 'Ponta Grossa', 'PR'], ['Joao Batista Webber', 'Castro', 'PR'],
  ['Agropecuaria Tres Irmaos Ltda', 'Chapeco', 'SC'], ['Rosana Fiorentin', 'Passo Fundo', 'RS'], ['Claudio Hoffmann', 'Erechim', 'RS'],
  ['Fazenda Boa Esperanca', 'Rondonopolis', 'MT'], ['Paulo Henrique Dalla Costa', 'Sorriso', 'MT'], ['Edson Tamura', 'Guarapuava', 'PR'],
].map(([nome, municipio, uf]) => ({ nome, municipio, uf, doc: nome.includes('Ltda') ? cnpj(String(int(10000000, 99999999))) : cpf(), endereco: `LINHA ${pick(['FLORESTA', 'BOA VISTA', 'SAO JOSE', 'ITAPIRANGA'])} S/N`, ie: String(int(100000000, 999999999)) }));
const CULTIVARES = ['NA 5909 RG', 'BMX ZEUS IPRO', 'TMG 7062 IPRO', 'DM 66I68 IPRO', 'BRS 1003 IPRO', 'M 6410 IPRO', 'NS 6601 IPRO'];

function itemSoja(emit, { germ, spu = pick([140000, 160000, 180000, 200000]), qtd = int(10, 80) } = {}) {
  const cult = pick(CULTIVARES);
  const k = `${spu / 1000}K`;
  const desc = `SEM CERT SOJA ${emit.marca} ${cult} C1 TI ${k} SC${germ ? ` GERM ${germ}%` : ''} DATA MAXIMA DE RETIRADA ${dias(-300).split('-').reverse().join('/')}`;
  return { codigo: String(int(1500000, 1599999)), ncm: '12011000', descricao: desc, cultivar: cult, unidade: 'SACO', qtd, vunit: 150 + rnd() * 140, spu, germ, soja: true };
}
const itemInoculante = () => ({ codigo: String(int(2000000, 2099999)), ncm: '30029090', descricao: 'INOCULANTE LIQUIDO SOJA BRADYRHIZOBIUM 1 LT', unidade: 'LT', qtd: int(2, 10), vunit: 45, soja: false });
const itemMilho = () => ({ codigo: String(int(1700000, 1799999)), ncm: '10051000', descricao: 'SEMENTE MILHO HIBRIDO AG 9025 PRO3 60K', unidade: 'SACO', qtd: int(5, 20), vunit: 690, soja: false });

function novaNF({ emit = pick(EMITENTES), prod = pick(PRODUTORES), diasAtras = int(5, 120), itens, germAdicional, numero = int(10000, 99999), chaveErrada = false } = {}) {
  const data = dias(diasAtras);
  const its = itens || [itemSoja(emit, { germ: pick([85, 88, 90, undefined]) })];
  const valorTotal = its.reduce((a, i) => a + i.qtd * i.vunit, 0);
  const serie = pick([1, 2, 3]);
  let ch = chave(emit.uf, data, emit.cnpj, serie, numero);
  if (chaveErrada) ch = ch.slice(0, 43) + ((Number(ch[43]) + 3) % 10);
  const nf = { emitente: emit, produtor: prod, data, numero, serie, chave: ch, itens: its, valorTotal, desconto: valorTotal * 0.03,
    pesoLiquido: its.filter((i) => i.unidade === 'SACO').reduce((a, i) => a + i.qtd * 40, 0), germAdicional,
    adicionais: germAdicional ? `LOTE ${int(1000, 9999)} GERMINACAO ${germAdicional}% VIGOR 85%` : undefined, seed: int(1, 1e6) };
  return { nf, png: danfePng(nf) };
}

async function login(email, password) {
  const r = await fetch(`${URL_BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`Login falhou para ${email}. Rode antes: node scripts/seed-demo.mjs`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return async (path, method = 'GET', body, headers = {}) => {
    const isBuf = Buffer.isBuffer(body);
    const res = await fetch(`${URL_BASE}${path}`, { method, headers: { Cookie: cookie, ...(body !== undefined && !isBuf ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : isBuf ? body : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data.error || ''}`);
    return data;
  };
}

async function main() {
  console.log(`Conectando em ${URL_BASE}…`);
  const admin = await login(ADMIN.email, ADMIN.password);
  await admin('/api/admin/modules/nota_nf', 'PUT', { status: 'ativo', sort_order: 8, enabled: true });
  const acesso = { 'marina@qima.local': 'solicitante', 'rafael@qima.local': 'solicitante', 'joana@qima.local': 'solicitante', 'central@qima.local': 'central', 'admin@qima.local': 'ambos' };
  for (const u of await admin('/api/admin/users')) {
    if (acesso[u.email]) await admin(`/api/admin/users/${u.id}`, 'PUT', { name: u.name, email: u.email, is_admin: u.is_admin, active: u.active, access: { ...u.access, nota_nf: acesso[u.email] } });
  }
  const [marina, rafael, joana, central] = await Promise.all(['marina', 'rafael', 'joana', 'central'].map((n) => login(`${n}@qima.local`, SENHA)));
  const cfg = await marina(`${M}/config`);
  console.log(`  IA: ${cfg.ia.ativo ? `ativa (${cfg.ia.provedor})` : 'desligada — os campos serão preenchidos à mão'}`);

  const subir = async (call, opts) => {
    const { nf, png } = novaNF(opts);
    let n = await call(`${M}/notas?nome=nf-${nf.numero}.png`, 'POST', png, { 'Content-Type': 'image/png' });
    if (n.ia_status !== 'ok') {
      n = await call(`${M}/notas/${n.id}`, 'PATCH', {
        numero_nf: nf.numero, serie: nf.serie, chave_acesso: nf.chave, emitente_nome: nf.emitente.nome, emitente_doc: nf.emitente.cnpj,
        produtor_nome: nf.produtor.nome, produtor_doc: nf.produtor.doc, data_emissao: nf.data, municipio: nf.produtor.municipio, uf: nf.produtor.uf,
        peso_liquido: nf.pesoLiquido, itens: nf.itens.map((i) => ({ descricao: i.descricao, cultivar: i.cultivar, unidade: i.unidade, quantidade: i.qtd, sementes_por_unidade: i.spu, germinacao: i.germ })),
      });
    }
    return { n, nf, png };
  };
  const enviar = (call, ns) => call(`${M}/enviar`, 'POST', { notas: ns.map((x) => x.n.id) });
  const out = [];

  // Validadas (várias cooperativas e produtores)
  const val = [];
  for (const call of [marina, rafael, joana, marina, rafael]) {
    const emit = pick(EMITENTES);
    const x = await subir(call, { emit, itens: [itemSoja(emit, { germ: pick([85, 88, 90]) }), ...(rnd() > 0.5 ? [itemSoja(emit, { germ: 87 })] : [])] });
    await enviar(call, [x]); val.push(x);
  }
  for (const x of val) await central(`${M}/central/notas/${x.n.id}/validar`, 'POST');
  out.push(`${val.length} NFs validadas`);

  // Aguardando: com inoculante líquido + milho (itens ignorados)
  const e1 = EMITENTES[0];
  const a1 = await subir(rafael, { emit: e1, itens: [itemSoja(e1, { germ: 90 }), itemInoculante(), itemMilho()] });
  // Aguardando: sem germinação (usa 92%)
  const e2 = EMITENTES[1];
  const a2 = await subir(marina, { emit: e2, prod: PRODUTORES[0], itens: [itemSoja(e2, { spu: 160000, qtd: 20 }), itemSoja(e2, { spu: 160000, qtd: 57 })] });
  // Aguardando: germinação só nos dados adicionais
  const e3 = EMITENTES[2];
  const a3 = await subir(joana, { emit: e3, germAdicional: 91, itens: [itemSoja(e3, { qtd: 40 })] });
  // Aguardando: chave de acesso com dígito errado
  const a4 = await subir(rafael, { chaveErrada: true });
  await enviar(rafael, [a1, a4]); await enviar(marina, [a2]); await enviar(joana, [a3]);
  out.push('4 NFs aguardando (item líquido/milho ignorado, germinação padrão 92%, germinação nos dados adicionais, chave inválida)');

  // Duplicada: Joana envia a MESMA foto que a Marina já enviou
  let dup = await joana(`${M}/notas?nome=nf.png`, 'POST', val[0].png, { 'Content-Type': 'image/png' });
  if (dup.ia_status !== 'ok') dup = await joana(`${M}/notas/${dup.id}`, 'PATCH', { numero_nf: val[0].nf.numero, chave_acesso: val[0].nf.chave });
  await joana(`${M}/enviar`, 'POST', { notas: [dup.id] });
  out.push('1 NF duplicada aguardando');

  // Recusada e reenviada com foto nova
  const rec = await subir(marina, {});
  await enviar(marina, [rec]);
  await central(`${M}/central/notas/${rec.n.id}/recusar`, 'POST', { motivo: 'Foto ilegível — Falta a parte de baixo da NF (produtos)' });
  const novo = novaNF({ emit: rec.nf.emitente, prod: rec.nf.produtor, numero: rec.nf.numero });
  let s = await marina(`${M}/notas?nome=nova.png&substitui=${rec.n.id}`, 'POST', novo.png, { 'Content-Type': 'image/png' });
  await marina(`${M}/enviar`, 'POST', { notas: [s.id] });
  out.push('1 NF recusada → reenviada');

  // Recusada (aguardando o solicitante mandar outra foto)
  const rec2 = await subir(rafael, {});
  await enviar(rafael, [rec2]);
  await central(`${M}/central/notas/${rec2.n.id}/recusar`, 'POST', { motivo: 'Não é NF de semente de soja' });
  await central(`${M}/central/notas/${rec2.n.id}/obs`, 'PUT', { obs_central: 'Envie somente notas de semente de soja.' });
  out.push('1 NF recusada');

  // Rascunhos da Joana
  await subir(joana, {}); await subir(joana, { itens: [itemSoja(EMITENTES[3], { germ: 89 }), itemInoculante()] });
  out.push('2 rascunhos da Joana (tela Enviar NF)');

  console.log(out.map((x) => `  ${x}`).join('\n'));
  console.log(`\nContas (senha "${SENHA}"): marina@, rafael@, joana@qima.local (solicitantes) · central@qima.local (central)`);
}

main().catch((e) => { console.error('\nERRO:', e.message); process.exit(1); });
