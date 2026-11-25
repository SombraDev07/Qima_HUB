// Regras e utilitários do sistema Viagem (validação do pedido e dos passageiros).
export class RuleError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
export const TRANSPORTE = { onibus: 'Ônibus', aviao: 'Avião' };
export const STATUS_LABEL = { pendente: 'Aguardando central', agendando: 'Em agendamento', agendado: 'Agendado', recusado: 'Recusado', cancelado: 'Cancelado' };

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const brDate = (s) => (isDate(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
export const brMoney = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtCpf = (v) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : String(v ?? ''); };
export const codigoPedido = (id) => `VG-${String(id).padStart(5, '0')}`;
/** Ids numéricos vindos do banco para usar em IN (...). */
export const ids = (arr) => arr.map((x) => Number(x)).filter((x) => Number.isInteger(x)).join(',') || '0';

export function cpfValido(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

const texto = (v, max) => String(v ?? '').trim().slice(0, max);
/** Hoje no fuso do Brasil (YYYY-MM-DD). */
export const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

/** Valida a viagem (trecho e datas). Devolve os campos limpos. */
export function lerViagem(b) {
  const v = {
    origem: texto(b.origem, 80), origem_uf: String(b.origem_uf || ''),
    destino: texto(b.destino, 80), destino_uf: String(b.destino_uf || ''),
    transporte: b.transporte, data_ida: b.data_ida, data_volta: b.data_volta || null,
    horario: String(b.horario || ''), obs: texto(b.obs, 1000) || null,
  };
  if (!v.origem || !UFS.includes(v.origem_uf)) throw new RuleError('Informe a cidade de saída.');
  if (!v.destino || !UFS.includes(v.destino_uf)) throw new RuleError('Informe a cidade de destino.');
  if (v.origem.toLowerCase() === v.destino.toLowerCase() && v.origem_uf === v.destino_uf) throw new RuleError('A cidade de destino é igual à de saída.');
  if (!TRANSPORTE[v.transporte]) throw new RuleError('Escolha o tipo de transporte.');
  if (!isDate(v.data_ida)) throw new RuleError('Informe a data em que precisa sair.');
  if (v.data_ida < hojeBR()) throw new RuleError('A data de saída já passou.');
  if (v.data_volta && !isDate(v.data_volta)) throw new RuleError('Data de volta inválida.');
  if (v.data_volta && v.data_volta < v.data_ida) throw new RuleError('A data de volta é antes da saída.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.horario)) throw new RuleError('Informe o horário de saída.');
  return v;
}

/** Valida os passageiros (todos os campos obrigatórios, menos a poltrona). */
export function lerPassageiros(lista, bus) {
  if (!Array.isArray(lista) || !lista.length) throw new RuleError('Adicione pelo menos um passageiro.');
  if (lista.length > 30) throw new RuleError('No máximo 30 passageiros por pedido.');
  const cpfs = new Set();
  return lista.map((x, i) => {
    const quem = texto(x.nome, 120) || `Passageiro ${i + 1}`;
    const p = {
      pessoa_id: Number(x.pessoa_id) > 0 ? Number(x.pessoa_id) : null,
      nome: texto(x.nome, 120),
      cpf: String(x.cpf ?? '').replace(/\D/g, ''),
      rg: texto(x.rg, 20),
      nascimento: x.nascimento,
      email: texto(x.email, 160).toLowerCase(),
      telefone: String(x.telefone ?? '').replace(/\D/g, '').slice(0, 13),
      bu: texto(x.bu, 80),
      poltrona: texto(x.poltrona, 10) || null,
    };
    if (!p.nome) throw new RuleError(`Passageiro ${i + 1}: informe o nome completo.`);
    if (!cpfValido(p.cpf)) throw new RuleError(`${quem}: CPF inválido.`);
    if (cpfs.has(p.cpf)) throw new RuleError(`${quem}: CPF repetido na lista.`);
    cpfs.add(p.cpf);
    if (!p.rg) throw new RuleError(`${quem}: informe o RG.`);
    if (!isDate(p.nascimento) || p.nascimento >= hojeBR() || p.nascimento < '1900-01-01') throw new RuleError(`${quem}: informe a data de nascimento.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw new RuleError(`${quem}: e-mail inválido.`);
    if (p.telefone.length < 10) throw new RuleError(`${quem}: informe o telefone com DDD.`);
    if (!bus.includes(p.bu)) throw new RuleError(`${quem}: escolha a BU.`);
    return p;
  });
}
