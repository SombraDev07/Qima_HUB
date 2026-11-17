// Dados de TESTE do sistema Frotas: pedidos em todos os status, reservas, veículos em uso (com fotos),
// chamados em cada etapa e um pouco de histórico (troca, substituição e encerramento já feitos).
// Uso: com o servidor rodando →  node scripts/seed-frotas.mjs
import { png, F, semAcento } from './lib/cupom.mjs';

const URL_BASE = process.env.QIMA_URL || 'http://localhost:3001';
const ADMIN = { email: process.env.QIMA_ADMIN_EMAIL || 'admin@qima.local', password: process.env.QIMA_ADMIN_PASSWORD || 'admin123' };
const SENHA = 'teste123';
const M = '/api/m/frotas';

let seed = 4242;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const hoje = new Date().toISOString().slice(0, 10);
const dias = (n) => { const d = new Date(hoje + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

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
  fn.raw = async (path, buf, mime) => {
    const res = await fetch(`${URL_BASE}${path}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': mime }, body: buf });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${data.error || ''}`);
    return data;
  };
  return fn;
}

// ------------------------------------------------------------ foto "de mentira" do carro (PNG em tons de cinza)
function fotoCarro(angulo, placa) {
  const W = 480; const H = 320;
  const g = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = y < 190 ? 215 - Math.floor(y / 6) : 120 + ((x + y) % 7);
  const rect = (x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = c; };
  const circ = (cx, cy, r, c) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) rect(cx + x, cy + y, 1, 1, c); };
  if (angulo === 'Triângulo') {
    for (let y = 0; y < 150; y++) { const half = Math.floor(y * 0.75); rect(W / 2 - half, 80 + y, half * 2, 1, 30); if (y > 18 && y < 135) rect(W / 2 - half + 16, 80 + y, Math.max(0, half * 2 - 32), 1, 200); }
  } else if (angulo === 'Medidor de pneu') {
    circ(240, 175, 95, 25); circ(240, 175, 78, 230); rect(238, 115, 4, 62, 25); circ(240, 175, 8, 25); rect(140, 260, 200, 22, 60);
  } else if (angulo === 'Interior' || angulo === 'Painel') {
    rect(40, 60, 400, 150, 60); circ(150, 140, 46, 25); circ(150, 140, 30, 70); rect(270, 100, 120, 70, 35); rect(280, 110, 100, 18, 140);
  } else {
    const lateral = angulo.startsWith('Lateral');
    const w = lateral ? 360 : 240; const x0 = (W - w) / 2;
    rect(x0, 150, w, 60, 45); rect(x0 + (lateral ? 70 : 30), 105, w - (lateral ? 150 : 60), 50, 55); rect(x0 + (lateral ? 85 : 45), 113, w - (lateral ? 180 : 90), 34, 165);
    circ(x0 + (lateral ? 70 : 40), 212, 26, 20); circ(x0 + w - (lateral ? 70 : 40), 212, 26, 20);
    if (!lateral) { rect(W / 2 - 40, 178, 80, 22, 235); }
  }
  const texto = (t, x0, y0, s, c) => {
    let x = x0;
    for (const ch of semAcento(t)) {
      const cols = F[ch] || F[' '];
      cols.forEach((bits, i) => { for (let b = 0; b < 7; b++) if (bits & (1 << b)) rect(x + i * s, y0 + b * s, s, s, c); });
      x += 6 * s;
    }
  };
  rect(0, 0, W, 34, 30);
  texto(`${angulo} - ${placa}`, 12, 8, 3, 245);
  if (angulo === 'Frontal' || angulo === 'Traseira') texto(placa.replace('-', ''), W / 2 - 36, 182, 2, 20);
  return png(W, H, g);
}

const COLAB = [
  ['Thalita Moraes', 'Ederlan Souza'], ['Marcos Pereira', 'Ederlan Souza'], ['Ana Beatriz Lima', 'Ederlan Souza'], ['João Victor Ramos', 'Paula Zanetti'],
  ['Carla Menezes', 'Paula Zanetti'], ['Diego Fontana', 'Paula Zanetti'], ['Fernanda Kuhn', 'Rodrigo Silveira'], ['Gustavo Bortoli', 'Rodrigo Silveira'],
  ['Helena Castro', 'Rodrigo Silveira'], ['Igor Tessaro', 'Ederlan Souza'], ['Jéssica Dalmolin', 'Paula Zanetti'], ['Lucas Zanella', 'Rodrigo Silveira'],
  ['Mariana Rech', 'Ederlan Souza'], ['Nicolas Baggio', 'Paula Zanetti'], ['Otávio Grando', 'Rodrigo Silveira'], ['Patrícia Lunardi', 'Ederlan Souza'],
];
const MODELOS = { B: ['Onix 1.0', 'HB20 1.0', 'Mobi Like', 'Kwid Zen'], C: ['Onix Plus', 'Virtus 1.6', 'Cronos Drive'], CE: ['T-Cross', 'Creta Action', 'Renegade'], D: ['Corolla GLi', 'Sentra'], Picape: ['Strada Freedom', 'Saveiro Robust', 'Montana LT'] };
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const placa = () => `${pick(LETRAS)}${pick(LETRAS)}${pick(LETRAS)}${int(0, 9)}${pick(LETRAS)}${int(10, 99)}`;
const MOTIVOS = ['Equipe de auditoria da safra', 'Visita a produtores da região', 'Reposição de veículo devolvido', 'Novo técnico de campo', 'Projeto de monitoramento', 'Coleta de amostras'];
const GPS = { 'Chapecó-SC': [-27.1004, -52.6152], 'Londrina-PR': [-23.3045, -51.1696], 'Erechim-RS': [-27.6342, -52.2734] };

async function main() {
  console.log(`Conectando em ${URL_BASE}…`);
  const admin = await login(ADMIN.email, ADMIN.password);
  await admin('/api/admin/modules/frotas', 'PUT', { status: 'ativo', sort_order: 4, enabled: true });
  const acesso = { 'marina@qima.local': 'solicitante', 'rafael@qima.local': 'solicitante', 'joana@qima.local': 'solicitante', 'central@qima.local': 'central', 'admin@qima.local': 'ambos' };
  for (const u of await admin('/api/admin/users')) {
    if (acesso[u.email]) await admin(`/api/admin/users/${u.id}`, 'PUT', { name: u.name, email: u.email, is_admin: u.is_admin, active: u.active, access: { ...u.access, frotas: acesso[u.email] } });
  }
  const [marina, rafael, joana, central] = await Promise.all(['marina', 'rafael', 'joana', 'central'].map((n) => login(`${n}@qima.local`, SENHA)));
  const sols = [marina, rafael, joana];

  if ((await marina(`${M}/meus/pedidos`)).length) { console.log('Frotas já tem dados de teste — nada a fazer.'); return; }

  // colaboradores (motoristas) e superiores
  const listas = await central(`${M}/central/listas`);
  for (const [nome, superior] of COLAB) if (!listas.colaboradores.some((c) => c.nome === nome)) await central(`${M}/central/listas/colaboradores`, 'POST', { nome, superior });
  const cfg = await central(`${M}/config`);

  const criar = async (sol, { qtd = 1, enviar = true, local, categoria, motorista, data = dias(int(3, 25)) }) => {
    await sol(`${M}/meus/pedidos`, 'POST', { qtd, enviar, data_retirada: data, local, categoria, motorista, motivo: pick(MOTIVOS) });
    return (await sol(`${M}/meus/pedidos`)).slice(0, qtd); // os mais novos primeiro
  };
  const L = cfg.locais; const C = ['B', 'B', 'C', 'CE', 'Picape'];
  const motoristas = COLAB.map((c) => c[0]);
  let mi = 0;
  const proxMotorista = () => motoristas[mi++ % motoristas.length];

  // 1) rascunhos (não enviados)
  await criar(marina, { qtd: 2, enviar: false, local: L[1], categoria: 'B' });
  await criar(joana, { qtd: 1, enviar: false, local: L[0], categoria: 'C', motorista: 'Igor Tessaro' });
  // 2) solicitados (aguardando aprovação) — em lotes
  await criar(rafael, { qtd: 3, local: L[2], categoria: 'B' });
  await criar(marina, { qtd: 1, local: L[1], categoria: 'CE', motorista: 'Thalita Moraes' });
  await criar(joana, { qtd: 2, local: L[0], categoria: 'Picape' });
  // 3) reprovados
  const rep = await criar(rafael, { qtd: 2, local: L[1], categoria: 'D' });
  await central(`${M}/central/pedidos/reprovar`, 'POST', { ids: rep.map((p) => p.id), motivo: 'Categoria D só com aprovação da diretoria. Peça categoria C.' });
  // 4) aprovados aguardando reserva
  const apr = [...await criar(marina, { qtd: 2, local: L[0], categoria: 'B' }), ...await criar(joana, { qtd: 1, local: L[2], categoria: 'CE', motorista: 'Lucas Zanella' })];
  await central(`${M}/central/pedidos/aprovar`, 'POST', { ids: apr.map((p) => p.id) });

  // 5) reservados (aguardando ativação) e em uso
  let reserva = 50400;
  const veiculos = [];
  const plano = [
    ...Array.from({ length: 3 }, (_, i) => ({ sol: sols[i % 3], ativar: false })),
    ...Array.from({ length: 13 }, (_, i) => ({ sol: sols[i % 3], ativar: true })),
  ];
  for (const [i, item] of plano.entries()) {
    const categoria = pick(C); const local = L[i % 3];
    const [p] = await criar(item.sol, { local, categoria, motorista: item.ativar ? proxMotorista() : undefined });
    await central(`${M}/central/pedidos/aprovar`, 'POST', { ids: [p.id] });
    const retirada = item.ativar ? dias(-int(10, 120)) : dias(int(1, 8));
    const r = await central(`${M}/central/pedidos/${p.id}/reservar`, 'POST', {
      codigo_reserva: String(reserva += int(3, 90)), modalidade: rnd() > 0.35 ? 'Mensal' : 'Diária', valor_contrato: rnd() > 0.35 ? int(18, 42) * 100 : int(9, 25) * 10, data_retirada: retirada,
    });
    if (item.ativar) {
      const pl = placa();
      const kmIni = int(5, 60) * 1000 + int(0, 999);
      // todas as fotos são obrigatórias para ativar
      const [lat, lon] = GPS[local] || [-27.1, -52.6];
      for (const a of cfg.angulos) {
        const qs = new URLSearchParams({ angulo: a, lat: (lat + (rnd() - 0.5) / 500).toFixed(6), lon: (lon + (rnd() - 0.5) / 500).toFixed(6), precisao: int(4, 20) });
        await central.raw(`${M}/veiculos/${r.veiculo_id}/fotos?${qs}`, fotoCarro(a, pl), 'image/png');
      }
      await central(`${M}/central/veiculos/${r.veiculo_id}/ativar`, 'POST', {
        modelo: pick(MODELOS[categoria]), placa: pl, motorista: p.motorista || proxMotorista(), cartao: String(int(100000, 999999)), km_retirada: kmIni, data_retirada: retirada,
      });
      veiculos.push({ id: r.veiculo_id, sol: item.sol, placa: pl, km: kmIni, local });
    }
  }

  // 6) chamados em cada etapa
  const meus = async (sol) => sol(`${M}/meus/veiculos`);
  const vSol = async (v) => (await meus(v.sol)).find((x) => x.id === v.id);
  const abrir = async (v, body) => { const x = await vSol(v); return v.sol(`${M}/meus/veiculos/${x.id}/chamados`, 'POST', body); };
  const [v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12] = veiculos;

  // pendentes (central aprova)
  await abrir(v1, { tipo: 'manutencao', tipo_manutencao: 'Pneu', motivo: 'Pneu dianteiro direito furado, rodando com o estepe.' });
  await abrir(v2, { tipo: 'troca', data_inicio_nova: dias(4), local_servico: 'Agência Localiza - centro', motivo: 'Barulho na suspensão e ar-condicionado sem gelar.' });
  await abrir(v3, { tipo: 'substituicao', condutor_novo: 'Otávio Grando', data_saida_condutor: dias(2), data_inicio_nova: dias(3), motivo: 'Motorista atual entra de férias.' });
  await abrir(v4, { tipo: 'encerramento', km_devolucao: v4.km + 4210, data_devolucao: dias(6), motivo: 'Fim do projeto na região.' });
  // aprovado aguardando agendamento
  const c5 = await abrir(v5, { tipo: 'manutencao', tipo_manutencao: 'Revisão', motivo: 'Revisão dos 60 mil km.' });
  await central(`${M}/central/chamados/${c5.id}/aprovar`, 'POST');
  const c6 = await abrir(v6, { tipo: 'encerramento', km_devolucao: v6.km + 8800, data_devolucao: dias(5), motivo: 'Colaborador desligado.' });
  await central(`${M}/central/chamados/${c6.id}/aprovar`, 'POST');
  // agendados (o solicitante finaliza)
  const c7 = await abrir(v7, { tipo: 'troca', data_inicio_nova: dias(1), local_servico: 'Movida aeroporto', motivo: 'Para-brisa trincado.' });
  await central(`${M}/central/chamados/${c7.id}/aprovar`, 'POST');
  await central(`${M}/central/chamados/${c7.id}/agendar`, 'POST', { data_servico: dias(1), local_servico: 'Movida - Av. Brasil, 1200' });
  const c8 = await abrir(v8, { tipo: 'manutencao', tipo_manutencao: 'Elétrica', motivo: 'Luz de bateria acendendo no painel.' });
  await central(`${M}/central/chamados/${c8.id}/aprovar`, 'POST');
  await central(`${M}/central/chamados/${c8.id}/agendar`, 'POST', { data_servico: dias(2), hora_servico: '09:00', local_servico: 'Auto Elétrica Central - Rua XV, 300' });
  const c9 = await abrir(v9, { tipo: 'substituicao', condutor_novo: 'Patrícia Lunardi', data_saida_condutor: dias(0), data_inicio_nova: dias(1), motivo: 'Troca de equipe.' });
  await central(`${M}/central/chamados/${c9.id}/aprovar`, 'POST');
  // reprovado (solicitante dá ciente)
  const c10 = await abrir(v10, { tipo: 'troca', data_inicio_nova: dias(3), local_servico: 'Qualquer agência', motivo: 'Prefiro um carro maior.' });
  await central(`${M}/central/chamados/${c10.id}/reprovar`, 'POST', { motivo: 'Categoria atual atende a operação.' });

  // 7) histórico já concluído: troca e substituição finalizadas, e um contrato encerrado
  const c11 = await abrir(v11, { tipo: 'substituicao', condutor_novo: 'Helena Castro', data_saida_condutor: dias(-20), data_inicio_nova: dias(-19), motivo: 'Motorista mudou de projeto.' });
  await central(`${M}/central/chamados/${c11.id}/aprovar`, 'POST');
  await v11.sol(`${M}/meus/chamados/${c11.id}/finalizar`, 'POST', {});
  const kmT = v12.km + 15320;
  await central(`${M}/central/veiculos/${v12.id}/troca`, 'POST', { km_devolucao: kmT, data_devolucao: dias(-12), placa_nova: placa(), modelo_novo: 'Onix Plus', data_inicio: dias(-12), km_inicial: int(3, 15) * 1000, motivo: 'Sinistro: batida leve na traseira.' });
  await central(`${M}/central/veiculos/${v0.id}/encerrar`, 'POST', { km_devolucao: v0.km + 22100, data_devolucao: dias(-3), motivo: 'Fim do contrato da safra.' });

  const todos = await central(`${M}/central/veiculos`);
  const cont = todos.reduce((a, v) => ({ ...a, [v.status]: (a[v.status] || 0) + 1 }), {});
  console.log('Frotas pronto:', cont);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
