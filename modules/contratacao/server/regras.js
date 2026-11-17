// Regras de negócio da Contratação.

export class RuleError extends Error {
  constructor(msg, status = 400, extra = {}) { super(msg); this.status = status; this.extra = extra; }
}

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const hoje = () => new Date().toISOString().slice(0, 10);
export const brDate = (s) => (isDate(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
export const codigoPedido = (id) => `CT-${String(id).padStart(4, '0')}`;
export const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

export const STATUS = {
  rascunho: 'Rascunho', pendente: 'Pendente', em_recrutamento: 'Em Recrutamento', parcial: 'Parcialmente Atendida',
  atendida: 'Atendida', finalizado: 'Fechado', cancelado: 'Cancelado', recusado: 'Recusado',
};
export const FECHADOS = ['finalizado', 'cancelado', 'recusado'];
export const AVISOS = ['Trabalhado', 'Indenizado', 'Não aplicável / validar com RH'];
export const JUSTIFICATIVAS = ['Comportamento', 'Desempenho', 'Pedido do colaborador', 'Término de contrato', 'Redução de quadro', 'Outro'];

/** Semana do ano (ISO 8601). */
export function semanaISO(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - inicioAno) / 86400000 + 1) / 7);
}

/** Atraso: data já passou · Urgente: começa em até 7 dias · Novo: pedido há até 7 dias · Antigo. */
export function situacao(p) {
  const h = Date.parse(hoje());
  const ate = Math.round((Date.parse(p.data_desejada) - h) / 86400000);
  if (ate < 0) return 'Atraso';
  if (ate <= 7) return 'Urgente';
  const desde = Math.round((h - Date.parse((p.enviado_at || p.created_at || '').slice(0, 10))) / 86400000);
  return desde <= 7 ? 'Novo' : 'Antigo';
}

// As funções abaixo recebem "db": o banco (pg) ou, dentro de transação, o "t".

/** Distrito de uma cidade: o cadastrado em contratacao_regioes ou, sem cadastro, a UF. */
export async function distritoDe(db, cidade, uf) {
  if (!cidade) return uf || null;
  const r = await db.get('SELECT regiao FROM contratacao_regioes WHERE lower(cidade) = lower(?) AND uf = ?', cidade, uf);
  return r?.regiao || uf || null;
}

/** Situação da pessoa. "anexada" = já se sabe se ela está em alguma vaga (true/false). */
export const statusDe = (b, anexada) => (b.demitido ? 'demitido' : anexada ? 'anexado' : b.contratado ? 'contratado' : 'livre');

export async function statusPessoa(db, b) {
  return statusDe(b, b.demitido ? false : !!(await db.get('SELECT 1 FROM contratacao_anexos WHERE banco_id = ? LIMIT 1', b.id)));
}

/** Ajusta o status do pedido conforme as pessoas anexadas (não mexe em pedidos fechados). */
export async function recalcPedido(db, pedidoId) {
  const p = await db.get(`SELECT status, qtd, (SELECT COUNT(*) FROM contratacao_anexos a WHERE a.pedido_id = p.id) AS n
    FROM contratacao_pedidos p WHERE id = ?`, pedidoId);
  if (!p || p.status === 'rascunho' || FECHADOS.includes(p.status)) return;
  let st = p.status;
  if (p.n >= p.qtd) st = 'atendida';
  else if (p.n > 0) st = 'parcial';
  else if (['parcial', 'atendida'].includes(p.status)) st = 'em_recrutamento';
  if (st !== p.status) await db.run('UPDATE contratacao_pedidos SET status = ?, updated_at = now() WHERE id = ?', st, pedidoId);
}

export function log(db, { pedidoId = null, bancoId = null }, user, acao, detalhe = '') {
  return db.run('INSERT INTO contratacao_historico (pedido_id, banco_id, user_id, user_nome, acao, detalhe) VALUES (?, ?, ?, ?, ?, ?)',
    pedidoId, bancoId, user?.id ?? null, user?.name ?? 'sistema', acao, detalhe);
}

export function cpfValido(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
export const fmtCpf = (v) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d; };

export const bool = (v) => v === true || v === 1 || /^(1|s|sim|x|true|yes)$/i.test(String(v ?? '').trim());
