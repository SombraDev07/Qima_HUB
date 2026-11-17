// Regras de negócio do sistema Solicitações.

export class RuleError extends Error {
  constructor(msg, status = 400, extra = {}) { super(msg); this.status = status; this.extra = extra; }
}

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const hoje = () => new Date().toISOString().slice(0, 10);
export const txt = (v, max = 2000) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
export const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
export const codigoPedido = (id) => `SOL-${String(id).padStart(4, '0')}`;
export const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

export const TIPOS = { exclusao: 'Exclusão de cargas', insercao: 'Inserção de dados', acumulado: 'Acumulado' };
export const SUBTIPOS = { insercao: 'Inserção', correcao: 'Correção' };
export const STATUS = { pendente: 'Pendente', analise: 'Em análise', correcao: 'Aguardando correção', feito: 'Feito', cancelado: 'Cancelado' };
export const EDITAVEIS = ['pendente', 'correcao'];
export const VALOR_MAX = 200_000_000;
export const VALOR_AVISO = 50_000_000;

export const tipoLabel = (p) => `${TIPOS[p.tipo] || p.tipo}${p.subtipo ? ` · ${SUBTIPOS[p.subtipo]}` : ''}`;
export const precisaAnexo = (tipo, subtipo) => tipo === 'insercao' || (tipo === 'acumulado' && subtipo === 'insercao');

export function cpfValido(d) {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
export function cnpjValido(d) {
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((a, p, i) => a + p * Number(d[i]), 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}
export const fmtDoc = (d) => (d?.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  : d?.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d || '');

const inteiro = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : NaN;
};

/**
 * Confere as linhas do Acumulado · Correção.
 * Retorna { linhas, avisos } — erros bloqueiam (RuleError); avisos pedem confirmação.
 */
export function lerLinhas(entrada) {
  if (!Array.isArray(entrada) || !entrada.length) throw new RuleError('Inclua ao menos uma linha na tabela.');
  if (entrada.length > 500) throw new RuleError('No máximo 500 linhas por solicitação. Para mais, use Inserção com planilha.');
  const erros = [];
  const linhas = entrada.map((l, i) => {
    const n = i + 1;
    const cod = txt(l.cod_visita, 60);
    if (!cod) erros.push(`Linha ${n}: falta o código da visita.`);
    const doc = soDigitos(l.documento);
    if (doc && !(doc.length === 11 ? cpfValido(doc) : doc.length === 14 ? cnpjValido(doc) : false)) {
      erros.push(`Linha ${n}: ${doc.length === 11 ? 'CPF inválido' : doc.length === 14 ? 'CNPJ inválido' : 'CPF tem 11 dígitos e CNPJ tem 14'}.`);
    }
    if (l.data && !isDate(l.data)) erros.push(`Linha ${n}: data inválida.`);
    const v = {};
    for (const k of ['negativa', 'declarada', 'positiva', 'participante']) {
      v[k] = inteiro(l[k] ?? 0);
      if (!Number.isFinite(v[k]) || v[k] < 0) erros.push(`Linha ${n}: valor de ${k} inválido.`);
      else if (v[k] > VALOR_MAX) erros.push(`Linha ${n}: ${k} acima do máximo (200.000.000).`);
    }
    return { ordem: n, cod_visita: cod, documento: doc || null, data: l.data || null, ...v };
  });
  if (erros.length) throw new RuleError(erros.slice(0, 6).join(' ') + (erros.length > 6 ? ` (+${erros.length - 6})` : ''));

  const avisos = [];
  const vals = (l) => [l.negativa, l.declarada, l.positiva, l.participante];
  if (linhas.some((l) => vals(l).some((x) => x > VALOR_AVISO))) avisos.push('Há valor acima de 50 milhões.');
  const cods = linhas.map((l) => l.cod_visita.toLowerCase());
  if (new Set(cods).size !== cods.length) avisos.push('Código da visita repetido.');
  const chaves = linhas.map((l) => vals(l).join('|'));
  if (new Set(chaves).size !== chaves.length) avisos.push('Os valores da tecnologia se repetem em outra linha.');
  if (linhas.some((l) => { const [ng, dc, ps, pt] = vals(l); return (ng > 0 && (ng === dc || ng === ps || ng === pt)) || (dc > 0 && (dc === ps || dc === pt)) || (ps > 0 && ps === pt); })) {
    avisos.push('Valores repetidos na mesma linha.');
  }
  return { linhas, avisos };
}
