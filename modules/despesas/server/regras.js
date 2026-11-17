// Regras de negócio do Despesas (independentes de HTTP).
// Banco: Postgres. As funções que usam o banco recebem "db": o banco (pg) ou, dentro de transação, o "t".

export class RuleError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const hoje = () => new Date().toISOString().slice(0, 10);
export const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export const brDate = (s) => (isDate(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
export const brMoney = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const soDigitos = (s) => String(s || '').replace(/\D/g, '');
export const codigoPedido = (id) => `PED-${String(id).padStart(5, '0')}`;
export const codigoNota = (id) => `DESP-${String(id).padStart(5, '0')}`;
/** Lista de ids para usar em "IN (...)": só inteiros positivos; vazia vira "0" (não casa com nada). */
export const ids = (xs) => xs.map(Number).filter((n) => Number.isInteger(n) && n > 0).join(',') || '0';

export function fmtCnpj(s) {
  const d = soDigitos(s);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d;
}

export function parseValor(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const s = String(v ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Configuração do sistema (dias limite, tipos e centros de custo ativos) numa consulta só. */
export async function config(db) {
  const r = await db.get(`SELECT (SELECT valor FROM despesas_config WHERE chave = 'dias_limite') AS dias,
    (SELECT COALESCE(json_agg(nome ORDER BY id), '[]'::json) FROM despesas_tipos WHERE ativo) AS tipos,
    (SELECT COALESCE(json_agg(nome ORDER BY id), '[]'::json) FROM despesas_centros WHERE ativo) AS centros`);
  const arr = (v) => (typeof v === 'string' ? JSON.parse(v) : v || []);
  return { dias_limite: Number(r.dias) || 30, tipos: arr(r.tipos), centros: arr(r.centros) };
}

export function log(db, pedidoId, notaId, user, acao, detalhe = '') {
  return db.run('INSERT INTO despesas_historico (pedido_id, nota_id, user_id, user_nome, acao, detalhe) VALUES (?, ?, ?, ?, ?, ?)',
    pedidoId ?? null, notaId ?? null, user?.id ?? null, user?.name ?? 'sistema', acao, detalhe);
}

/**
 * Notas parecidas já existentes no banco, para VÁRIAS notas de uma vez (uma consulta, não 4 por nota).
 * Considera notas enviadas de qualquer pessoa e os rascunhos do próprio dono; a nota que esta substitui não conta.
 * Devolve Map(id da nota → lista de parecidas, cada uma com "motivos").
 */
export async function duplicadosDe(db, notas) {
  const out = new Map(notas.map((n) => [n.id, []]));
  if (!notas.length) return out;
  const FOTO = '(n.hash = a.hash OR (n.hash_original IS NOT NULL AND n.hash_original = COALESCE(a.hash_original, a.hash)))';
  const CHAVE = '(length(a.chave_acesso) = 44 AND n.chave_acesso = a.chave_acesso)';
  const NF = '(a.cnpj IS NOT NULL AND a.numero_nf IS NOT NULL AND n.cnpj = a.cnpj AND n.numero_nf = a.numero_nf)';
  const CVD = '(a.cnpj IS NOT NULL AND a.valor <> 0 AND a.data IS NOT NULL AND n.cnpj = a.cnpj AND n.valor = a.valor AND n.data = a.data)';
  const rows = await db.all(`
    SELECT a.id AS de, n.id, n.codigo, n.valor, n.data, n.status, n.dono_id, p.codigo AS pedido_codigo, p.solicitante_nome,
      ${FOTO} AS m_foto, ${CHAVE} AS m_chave, ${NF} AS m_nf, ${CVD} AS m_cvd
    FROM despesas_notas a
    JOIN despesas_notas n ON n.id <> a.id AND n.id <> COALESCE(a.substitui_id, -1)
      AND n.status NOT IN ('cancelada','substituida') AND (n.status <> 'rascunho' OR n.dono_id = a.dono_id)
      AND (${FOTO} OR ${CHAVE} OR ${NF} OR ${CVD})
    LEFT JOIN despesas_pedidos p ON p.id = n.pedido_id
    WHERE a.id IN (${ids(notas.map((n) => n.id))}) ORDER BY n.id`);
  for (const { de, m_foto, m_chave, m_nf, m_cvd, ...r } of rows) {
    const motivos = [m_foto && 'Mesma foto', m_chave && 'Mesma chave de acesso', m_nf && 'Mesma NF (CNPJ + número)', m_cvd && 'Mesmo CNPJ, valor e data'].filter(Boolean);
    out.get(de).push({ ...r, motivos });
  }
  return out;
}

/** Alertas para a central (e para o solicitante). "parecidas" = quantas notas parecidas existem no banco. */
export function alertas(n, cfg, parecidas = 0) {
  const out = [];
  if (!isDate(n.data)) out.push({ tipo: 'sem_data', texto: 'Sem data da despesa' });
  else {
    const d = diasEntre(n.data, hoje());
    if (d > cfg.dias_limite) out.push({ tipo: 'data_antiga', texto: `Data antiga (há ${d} dias)` });
    if (d < 0) out.push({ tipo: 'data_futura', texto: 'Data no futuro' });
  }
  if (!(n.valor > 0)) out.push({ tipo: 'sem_valor', texto: 'Sem valor' });
  if (n.ia_status === 'ok') {
    if (n.ia_valor != null && n.valor != null && Math.abs(n.ia_valor - n.valor) > 0.009) out.push({ tipo: 'valor_alterado', texto: `Valor diferente do lido pela IA (${brMoney(n.ia_valor)})` });
    if (n.ia_data && n.data && n.ia_data !== n.data) out.push({ tipo: 'data_alterada', texto: `Data diferente da lida pela IA (${brDate(n.ia_data)})` });
  } else if (n.ia_status === 'falhou') out.push({ tipo: 'ia_falhou', texto: 'A IA não conseguiu ler esta nota' });
  if (parecidas) out.push({ tipo: 'duplicada', texto: `${parecidas} nota(s) parecida(s) no banco` });
  return out;
}

/** Recalcula totais e status do pedido a partir das notas. Retorna o pedido atualizado e se acabou de concluir. */
export async function recalcPedido(db, pedidoId) {
  const p = await db.get('SELECT * FROM despesas_pedidos WHERE id = ?', pedidoId);
  if (!p || p.status === 'cancelado') return { pedido: p, concluiu: false };
  const ativas = await db.all("SELECT status, valor, valor_aprovado FROM despesas_notas WHERE pedido_id = ? AND status IN ('aguardando','ok','recusada')", pedidoId);
  const total = ativas.reduce((s, n) => s + (n.valor || 0), 0);
  const aprovado = ativas.filter((n) => n.status === 'ok').reduce((s, n) => s + (n.valor_aprovado ?? n.valor ?? 0), 0);
  let status = 'aguardando';
  if (ativas.length && !ativas.some((n) => n.status === 'aguardando')) {
    status = ativas.every((n) => n.status === 'ok') ? 'aprovado' : ativas.every((n) => n.status === 'recusada') ? 'reprovado' : 'parcial';
  }
  const concluiu = status !== 'aguardando' && p.status === 'aguardando';
  const pedido = await db.get(`UPDATE despesas_pedidos SET total_declarado = ?, total_aprovado = ?, status = ?,
    analisado_at = ${concluiu ? 'now()' : 'analisado_at'}, updated_at = now() WHERE id = ? RETURNING *`,
  Math.round(total * 100) / 100, Math.round(aprovado * 100) / 100, status, pedidoId);
  return { pedido, concluiu };
}

export const STATUS_LABEL = { aguardando: 'Aguardando central', aprovado: 'Aprovado', parcial: 'Aprovado parcial', reprovado: 'Reprovado', cancelado: 'Cancelado' };
export const NOTA_LABEL = { rascunho: 'Rascunho', aguardando: 'Aguardando', ok: 'OK', recusada: 'Recusada', substituida: 'Substituída', cancelada: 'Cancelada' };
