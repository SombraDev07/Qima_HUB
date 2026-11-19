// Regras de negócio do Hospedagens (independentes de HTTP).
// Banco: Postgres. Toda função recebe "db": o banco (pg) ou, dentro de transação, o "t".

export const TIPOS = ['—', 'Simples', 'Duplo', 'Triplo', 'Quádruplo'];
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const dias = (a, b) => (isDate(a) && isDate(b) ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : 0);
export const today = () => new Date().toISOString().slice(0, 10);
export const brDate = (s) => (isDate(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
/** Lista de ids para usar em "IN (...)": só inteiros positivos; vazia vira "0" (não casa com nada). */
export const lista = (ids) => ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).join(',') || '0';

export class RuleError extends Error {
  constructor(msg, status = 400) {
    super(msg);
    this.status = status;
  }
}

/** Diária do hotel conforme ocupação (1 = simples ... 4 = quádruplo). */
export function diariaDoHotel(hotel, ocupantes) {
  if (!hotel) return 0;
  const v = [0, hotel.valor_s, hotel.valor_d, hotel.valor_t, hotel.valor_q][Math.min(ocupantes, 4)] || 0;
  return v || hotel.valor_s || 0;
}
// A mesma regra em SQL, para recalcular vários quartos de uma vez (q = quarto, h = hotel).
const DIARIA_SQL = `COALESCE(NULLIF(CASE LEAST((SELECT COUNT(*) FROM hospedagens_quarto_hospedes qh WHERE qh.quarto_id = q.id), 4)
  WHEN 1 THEN h.valor_s WHEN 2 THEN h.valor_d WHEN 3 THEN h.valor_t WHEN 4 THEN h.valor_q ELSE 0 END, 0), h.valor_s, 0)`;

export function log(db, pedidoId, user, acao, detalhe = '') {
  return db.run('INSERT INTO hospedagens_historico (pedido_id, user_id, user_nome, acao, detalhe) VALUES (?, ?, ?, ?, ?)',
    pedidoId, user?.id ?? null, user?.name ?? 'sistema', acao, detalhe);
}

export async function getPedido(db, id) {
  const p = await db.get('SELECT * FROM hospedagens_pedidos WHERE id = ?', Number(id) || 0);
  if (!p) throw new RuleError('Pedido não encontrado', 404);
  return p;
}

export async function getQuarto(db, id) {
  const q = await db.get('SELECT * FROM hospedagens_quartos WHERE id = ?', Number(id) || 0);
  if (!q) throw new RuleError('Quarto não encontrado', 404);
  return q;
}

export function ocupantes(db, quartoId) {
  return db.all(`
    SELECT h.*, qh.slot FROM hospedagens_quarto_hospedes qh
    JOIN hospedagens_hospedes h ON h.id = qh.hospede_id
    WHERE qh.quarto_id = ? ORDER BY qh.slot
  `, quartoId);
}

async function setOcupantes(db, quartoId, hospedeIds) {
  await db.run('DELETE FROM hospedagens_quarto_hospedes WHERE quarto_id = ?', quartoId);
  if (!hospedeIds.length) return;
  await db.run(`INSERT INTO hospedagens_quarto_hospedes (quarto_id, hospede_id, slot) VALUES ${hospedeIds.map(() => '(?, ?, ?)').join(', ')}`,
    ...hospedeIds.flatMap((hid, i) => [quartoId, hid, i + 1]));
}

/** Recalcula a diária (se não for manual) a partir do hotel e da ocupação atual. Sem hotel, a diária é zero. */
export async function recalcDiaria(db, quartoId) {
  await db.run(`UPDATE hospedagens_quartos q SET updated_at = now(),
    diaria = COALESCE((SELECT ${DIARIA_SQL} FROM hospedagens_hoteis h WHERE h.id = q.hotel_id), 0)
    WHERE q.id = ? AND NOT q.diaria_manual`, quartoId);
}

/** Depois de mudar os valores de um hotel: os quartos ainda vivos dele (sem diária manual) herdam o valor novo. */
export async function recalcDiariasDoHotel(db, hotelId) {
  const r = await db.run(`UPDATE hospedagens_quartos q SET updated_at = now(), diaria = ${DIARIA_SQL}
    FROM hospedagens_hoteis h WHERE h.id = q.hotel_id AND q.hotel_id = ? AND q.situacao <> 'finalizado' AND NOT q.diaria_manual`, hotelId);
  return r.rowCount;
}

/** Datas do pedido acompanham o período coberto pelos quartos. */
export async function recalcPedidoDatas(db, pedidoId) {
  await db.run(`UPDATE hospedagens_pedidos p SET data_inicio = x.ini, data_fim = x.fim, updated_at = now()
    FROM (SELECT MIN(data_in) AS ini, MAX(data_out) AS fim FROM hospedagens_quartos
          WHERE pedido_id = ? AND data_in IS NOT NULL AND data_out IS NOT NULL) x
    WHERE p.id = ? AND x.ini IS NOT NULL AND x.fim IS NOT NULL`, pedidoId, pedidoId);
}

/** Pedido sai de "novo" quando todos os quartos foram enviados. */
export async function atualizarStatusAposEnvio(db, pedidoId) {
  await db.run(`UPDATE hospedagens_pedidos p SET status = 'em_andamento', updated_at = now()
    WHERE p.id = ? AND p.status IN ('pendente','ajustado')
      AND NOT EXISTS (SELECT 1 FROM hospedagens_quartos q WHERE q.pedido_id = p.id AND NOT q.enviado)`, pedidoId);
}

export async function proximoCodigoQuarto(db, pedidoId) {
  const rows = await db.all('SELECT codigo FROM hospedagens_quartos WHERE pedido_id = ?', pedidoId);
  const max = rows.reduce((m, r) => Math.max(m, Number(String(r.codigo).replace(/\D/g, '')) || 0), 0);
  return `q-${String(max + 1).padStart(4, '0')}`;
}

/** Salva um quarto (hóspedes, hotel, datas, diária). */
export async function salvarQuarto(db, quartoId, { hospedes = [], hotel_id = null, data_in, data_out, diaria = null, obs = '' }) {
  const q = await getQuarto(db, quartoId);
  if (q.situacao === 'finalizado') throw new RuleError('Este trecho já foi finalizado (check-out). Não pode ser alterado.');
  const ids = [...new Set(hospedes.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length > 4) throw new RuleError('Um quarto comporta no máximo 4 hóspedes.');
  if (!isDate(data_in) || !isDate(data_out)) throw new RuleError('Informe check-in e check-out do quarto.');
  if (data_out <= data_in) throw new RuleError('O check-out precisa ser depois do check-in.');

  if (ids.length) {
    // os hóspedes marcados e, se houver, o outro quarto vivo em que cada um já está — numa consulta só
    const hs = await db.all(`SELECT h.id, h.nome, h.pedido_id, h.status,
        (SELECT o.codigo FROM hospedagens_quarto_hospedes qh JOIN hospedagens_quartos o ON o.id = qh.quarto_id
          WHERE qh.hospede_id = h.id AND o.id <> ? AND o.situacao <> 'finalizado' LIMIT 1) AS outro
      FROM hospedagens_hospedes h WHERE h.id IN (${lista(ids)})`, q.id);
    for (const hid of ids) {
      const h = hs.find((x) => x.id === hid);
      if (!h || h.pedido_id !== q.pedido_id) throw new RuleError('Hóspede não pertence a este pedido.');
      if (h.status === 'cancelado') throw new RuleError(`${h.nome} está cancelado(a) neste pedido.`);
      if (h.outro) throw new RuleError(`${h.nome} já está no quarto ${h.outro}.`);
    }
  }
  let hotel = null;
  if (hotel_id) {
    hotel = await db.get('SELECT id, valor_s, valor_d, valor_t, valor_q FROM hospedagens_hoteis WHERE id = ?', Number(hotel_id) || 0);
    if (!hotel) throw new RuleError('Hotel não encontrado.');
  }

  const manual = diaria !== null && diaria !== '' && diaria !== undefined;
  const valor = manual ? Number(diaria) || 0 : diariaDoHotel(hotel, ids.length);

  await db.run(`
    UPDATE hospedagens_quartos
    SET hotel_id = ?, data_in = ?, data_out = ?, diaria = ?, diaria_manual = ?, obs = ?, situacao = ?, updated_at = now()
    WHERE id = ?
  `, hotel?.id ?? null, data_in, data_out, valor, manual, obs || null, q.enviado ? 'alterado' : 'novo', q.id);
  await setOcupantes(db, q.id, ids);
  await recalcPedidoDatas(db, q.pedido_id);
  return getQuarto(db, q.id);
}

/** Marca quarto como enviado ao solicitante. */
export async function enviarQuarto(db, quartoId) {
  const q = await getQuarto(db, quartoId);
  if (!q.hotel_id) throw new RuleError(`${q.codigo}: escolha o hotel antes de enviar.`);
  const { n } = await db.get('SELECT COUNT(*) AS n FROM hospedagens_quarto_hospedes WHERE quarto_id = ?', q.id);
  if (!n && q.situacao !== 'finalizado') throw new RuleError(`${q.codigo}: coloque ao menos um hóspede.`);
  await db.run(`
    UPDATE hospedagens_quartos
    SET enviado = TRUE, situacao = CASE WHEN situacao IN ('finalizado','prorrogado') THEN situacao ELSE 'enviado' END, updated_at = now()
    WHERE id = ?
  `, q.id);
  return q;
}

/**
 * Check-out de hóspede(s) numa data. O trecho atual é finalizado nessa data e,
 * se sobrar alguém no quarto, abre-se um novo trecho (mesmo código) com quem ficou.
 */
export async function checkout(db, quartoId, hospedeIds, data) {
  const q = await getQuarto(db, quartoId);
  if (q.situacao === 'finalizado') throw new RuleError('Este trecho já está finalizado.');
  if (!isDate(data)) throw new RuleError('Informe a data do check-out.');
  if (q.data_in && data < q.data_in) throw new RuleError(`A data (${brDate(data)}) é antes do check-in (${brDate(q.data_in)}).`);
  if (q.data_out && data > q.data_out) throw new RuleError(`A data (${brDate(data)}) é depois do check-out previsto (${brDate(q.data_out)}). Use prorrogação.`);

  const occ = await ocupantes(db, q.id);
  const saem = occ.filter((h) => hospedeIds.includes(h.id));
  if (!saem.length) throw new RuleError('Hóspede não está neste quarto.');
  const ficam = occ.filter((h) => !hospedeIds.includes(h.id));
  const nomes = saem.map((h) => h.nome).join(', ');

  const fimOriginal = q.data_out;
  await db.run("UPDATE hospedagens_quartos SET situacao = 'finalizado', data_out = ?, obs = ?, updated_at = now() WHERE id = ?", data, `${nomes} fez check-out`, q.id);
  await db.run(`UPDATE hospedagens_hospedes SET status = 'checkout' WHERE id IN (${lista(saem.map((h) => h.id))})`);

  let novoId = null;
  if (ficam.length && fimOriginal && data < fimOriginal) {
    const r = await db.get(`
      INSERT INTO hospedagens_quartos (pedido_id, codigo, hotel_id, data_in, data_out, diaria, situacao, enviado, origem_id, obs)
      VALUES (?, ?, ?, ?, ?, 0, 'enviado', TRUE, ?, ?) RETURNING id
    `, q.pedido_id, q.codigo, q.hotel_id, data, fimOriginal, q.id, `Continua após check-out de ${nomes}`);
    novoId = r.id;
    await setOcupantes(db, novoId, ficam.map((h) => h.id));
    await recalcDiaria(db, novoId);
  }
  await recalcPedidoDatas(db, q.pedido_id);
  return { nomes, novoId, ficam: ficam.length };
}

/** Remove hóspede do quarto "como se não tivesse sido anexado". */
export async function cancelarHospede(db, hospedeId) {
  const h = await db.get('SELECT id, nome, pedido_id FROM hospedagens_hospedes WHERE id = ?', hospedeId);
  if (!h) throw new RuleError('Hóspede não encontrado.');
  const rooms = await db.all(`
    SELECT q.id FROM hospedagens_quarto_hospedes qh JOIN hospedagens_quartos q ON q.id = qh.quarto_id
    WHERE qh.hospede_id = ? AND q.situacao <> 'finalizado'
  `, hospedeId);
  await db.run("UPDATE hospedagens_hospedes SET status = 'cancelado' WHERE id = ?", hospedeId);
  let removido = false;
  for (const q of rooms) {
    await db.run('DELETE FROM hospedagens_quarto_hospedes WHERE quarto_id = ? AND hospede_id = ?', q.id, hospedeId);
    const resto = await ocupantes(db, q.id);
    if (!resto.length) {
      await db.run('DELETE FROM hospedagens_quartos WHERE id = ?', q.id);
      removido = true;
    } else {
      await setOcupantes(db, q.id, resto.map((r) => r.id)); // reordena slots
      await db.run(`UPDATE hospedagens_quartos SET situacao = CASE WHEN enviado THEN 'alterado' ELSE situacao END,
                  obs = ?, updated_at = now() WHERE id = ?`, `${h.nome} cancelado`, q.id);
      await recalcDiaria(db, q.id);
    }
  }
  await recalcPedidoDatas(db, h.pedido_id);
  return { nome: h.nome, removido };
}

/**
 * Prorroga o quarto até "data". Com hotelId diferente do atual, a prorrogação é reservada em outro hotel:
 * o trecho atual termina no check-out original e abre-se um novo trecho (mesmo código, mesmos hóspedes) no hotel novo.
 */
export async function prorrogar(db, quartoId, data, { hotelId = null } = {}) {
  const q = await getQuarto(db, quartoId);
  if (q.situacao === 'finalizado') throw new RuleError('Este trecho já está finalizado.');
  if (!isDate(data)) throw new RuleError('Informe a nova data de check-out.');
  if (q.data_in && data <= q.data_in) throw new RuleError(`A data (${brDate(data)}) precisa ser depois do check-in (${brDate(q.data_in)}).`);

  const novoHotel = Number(hotelId) || null;
  if (!novoHotel || novoHotel === q.hotel_id) {
    await db.run("UPDATE hospedagens_quartos SET data_out = ?, situacao = 'prorrogado', updated_at = now() WHERE id = ?", data, q.id);
    await recalcPedidoDatas(db, q.pedido_id);
    return { novoId: null, hotelNome: null };
  }

  const hotel = await db.get('SELECT id, nome FROM hospedagens_hoteis WHERE id = ?', novoHotel);
  if (!hotel) throw new RuleError('Hotel não encontrado.');
  if (!q.data_out || data <= q.data_out) throw new RuleError(`Para prorrogar em outro hotel, a nova data precisa ser depois do check-out atual (${brDate(q.data_out)}).`);
  const occ = await ocupantes(db, q.id);
  if (!occ.length) throw new RuleError('O quarto não tem hóspedes.');

  await db.run("UPDATE hospedagens_quartos SET situacao = 'finalizado', obs = ?, updated_at = now() WHERE id = ?", `Prorrogação no hotel ${hotel.nome}`, q.id);
  const r = await db.get(`
    INSERT INTO hospedagens_quartos (pedido_id, codigo, hotel_id, data_in, data_out, diaria, situacao, enviado, origem_id, obs)
    VALUES (?, ?, ?, ?, ?, 0, 'prorrogado', TRUE, ?, ?) RETURNING id
  `, q.pedido_id, q.codigo, hotel.id, q.data_out, data, q.id, 'Prorrogação em outro hotel');
  await setOcupantes(db, r.id, occ.map((h) => h.id));
  await recalcDiaria(db, r.id);
  await recalcPedidoDatas(db, q.pedido_id);
  return { novoId: r.id, hotelNome: hotel.nome };
}

/** Quarto "vivo" (não finalizado) onde o hóspede está. */
export function quartoDoHospede(db, hospedeId) {
  return db.get(`
    SELECT q.* FROM hospedagens_quarto_hospedes qh JOIN hospedagens_quartos q ON q.id = qh.quarto_id
    WHERE qh.hospede_id = ? AND q.situacao <> 'finalizado' ORDER BY q.id LIMIT 1
  `, hospedeId);
}

// ------------------------------------------------------------------ e-mails

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function emailQuartos(pedido, quartos, titulo = 'Confirmação de Reserva') {
  const blocos = quartos.map((q) => `
    <p><b>Hóspedes:</b><br>${q.ocupantes.map((o) => esc(o.nome)).join('<br>') || '—'}</p>
    <p><b>Hotel:</b> ${esc(q.hotel_nome)}${q.hotel_endereco ? `<br>${esc(q.hotel_endereco)}` : ''}${q.hotel_telefone ? `<br>Tel.: ${esc(q.hotel_telefone)}` : ''}</p>
    <p><b>Check-in:</b> ${brDate(q.data_in)} &nbsp; <b>Check-out:</b> ${brDate(q.data_out)} &nbsp; <b>Quarto:</b> ${esc(q.codigo)} (${TIPOS[q.ocupantes.length] || '—'})</p>
  `).join('<hr style="border:none;border-top:1px solid #e5e7eb">');
  return {
    subject: `Hospedagem - ${titulo} · ${pedido.codigo}`,
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#1f2937;line-height:1.6">
      <p>Olá, ${esc(pedido.solicitante_nome)}.</p>
      <p>Pedido <b>${esc(pedido.codigo)}</b> · ${esc(pedido.cidade)} - ${esc(pedido.uf)}</p>${blocos}
      <p style="color:#6b7280;font-size:13px">QIMA HUB · Hospedagens</p></div>`,
  };
}
