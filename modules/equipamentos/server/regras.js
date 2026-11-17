// Regras de negócio do sistema Equipamentos.

export class RuleError extends Error {
  constructor(msg, status = 400, extra = {}) { super(msg); this.status = status; this.extra = extra; }
}

export const TIPOS = ['Notebook', 'Celular', 'Monitor', 'Chip telefônico'];
export const BASES = ['Londrina', 'Passo Fundo'];

export const STATUS_EQ = { estoque: 'Em estoque', reservado: 'Reservado', em_uso: 'Em uso', devolucao_pendente: 'Devolução pendente', baixado: 'Baixado' };
export const STATUS_REQ = { rascunho: 'Rascunho', enviado: 'Enviado', reservado: 'Reservado', em_uso: 'Em uso', devolucao_pendente: 'Devolução pendente', devolvido: 'Devolvido' };

export const MAX_QTD_ITEM = 50;
export const MAX_ITENS = 12;
export const VALOR_MAX = 1_000_000;

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const hoje = () => new Date().toISOString().slice(0, 10);
export const txt = (v, max = 500) => { const s = String(v ?? '').trim().replace(/\s+/g, ' '); return s ? s.slice(0, max) : null; };
export const txtLivre = (v, max = 1000) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
export const dataOuNula = (v) => (isDate(v) ? v : null);
export const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
export const codigoSolicitacao = (id) => `VG-${String(id).padStart(3, '0')}`;
export const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

/** Só números inteiros positivos e distintos (seguro para IN (...)). */
export const ids = (v, max = 500) => [...new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, max);

export function cpfValido(d) {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** CPF opcional: vazio vira null; se vier preenchido precisa ser válido. Guarda só os dígitos. */
export function lerCpf(v) {
  const d = soDigitos(v);
  if (!d) return null;
  if (!cpfValido(d)) throw new RuleError('CPF inválido.');
  return d;
}

export const tipoValido = (t) => TIPOS.includes(t);
export const baseValida = (b) => BASES.includes(b);

/** Quantidade necessária por tipo, a partir dos itens de uma solicitação. */
export function necessidades(itens) {
  const m = {};
  for (const i of itens) m[i.tipo] = (m[i.tipo] || 0) + Number(i.qtd);
  return m;
}

/** Valida e normaliza a lista de itens do pedido. */
export function lerItens(lista) {
  if (!Array.isArray(lista) || !lista.length) throw new RuleError('Inclua pelo menos um item.');
  if (lista.length > MAX_ITENS) throw new RuleError(`No máximo ${MAX_ITENS} itens por solicitação.`);
  return lista.map((i) => {
    if (!tipoValido(i?.tipo)) throw new RuleError('Tipo de equipamento inválido.');
    const qtd = Number(i.qtd);
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > MAX_QTD_ITEM) throw new RuleError(`A quantidade de cada item deve ficar entre 1 e ${MAX_QTD_ITEM}.`);
    return { tipo: i.tipo, qtd, motivo: txt(i.motivo, 80) || 'Novo' };
  });
}
