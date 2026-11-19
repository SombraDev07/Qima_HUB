// Regras de negócio do sistema Frotas.

export class RuleError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const hoje = () => new Date().toISOString().slice(0, 10);
export const agora = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
export const brDate = (s) => (isDate(String(s || '').slice(0, 10)) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '-');
export const txt = (v, max = 500) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
export const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

export const codigo = (prefixo, id) => `${prefixo}-${String(id).padStart(5, '0')}`;

/** Placa brasileira: ABC1234 ou Mercosul ABC1D23 → "ABC-1234" / "ABC1D23". */
export function normPlaca(v) {
  const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return null;
  if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(s)) throw new RuleError('Placa inválida. Use o formato ABC-1234 ou ABC1D23.');
  return /^[A-Z]{3}\d{4}$/.test(s) ? `${s.slice(0, 3)}-${s.slice(3)}` : s;
}

export function inteiro(v, campo) {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(String(v).replace(/\./g, '').replace(',', '.')));
  if (!Number.isFinite(n) || n < 0) throw new RuleError(`${campo} inválido.`);
  return n;
}
export function dinheiro(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  const n = typeof v === 'number' ? v : Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  if (!Number.isFinite(n) || n < 0) throw new RuleError('Valor do contrato inválido.');
  return Math.round(n * 100) / 100;
}

export const PEDIDO_STATUS = {
  rascunho: 'Rascunho', solicitado: 'Solicitado', aprovado: 'Aprovado', reprovado: 'Reprovado',
  reservado: 'Reservado', em_uso: 'Em uso', encerrado: 'Encerrado',
};
export const VEICULO_STATUS = {
  reservado: 'Reservado', em_uso: 'Em uso', substituido: 'Substituído', trocado: 'Trocado', encerrado: 'Encerrado',
};
export const CHAMADO_TIPO = {
  manutencao: 'Manutenção', troca: 'Troca de veículo', substituicao: 'Substituição de condutor', encerramento: 'Encerramento de contrato',
};
export const CHAMADO_STATUS = {
  pendente: 'Aguardando aprovação', aprovado: 'Aguardando agendamento', agendado: 'Agendado',
  reprovado: 'Reprovado', finalizado: 'Finalizado', cancelado: 'Cancelado',
};
export const CHAMADO_ABERTO = ['pendente', 'aprovado', 'agendado', 'reprovado'];
export const TIPOS_MANUTENCAO = ['Pneu', 'Elétrica', 'Mecânica', 'Funilaria', 'Revisão', 'Outros'];
export const HORAS = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];
// Fotos do carro (opcionais: o veículo pode ser ativado sem elas)
export const ANGULOS = ['Frontal', 'Traseira', 'Lateral esquerda', 'Lateral direita', 'Interior', 'Painel', 'Triângulo', 'Medidor de pneu', 'Estepe + Macaco'];

// As funções abaixo recebem "db": o banco (pg) ou, dentro de transação, o "t".
// "tabela" é sempre um nome fixo deste sistema (locais, categorias, modalidades, colaboradores), nunca texto da tela.
export function lista(db, tabela, { todos = false } = {}) {
  return db.all(`SELECT * FROM frotas_${tabela} ${todos ? '' : 'WHERE ativo'} ORDER BY ${tabela === 'colaboradores' ? 'nome' : 'id'}`);
}
export const nomes = async (db, tabela) => (await lista(db, tabela)).map((x) => x.nome);

/** Lista de ids para usar em "IN (...)": só inteiros positivos; vazia vira "0" (não casa com nada). */
export const ids = (xs) => xs.map(Number).filter((n) => Number.isInteger(n) && n > 0).join(',') || '0';

/** Grava uma ou várias linhas de histórico num INSERT só. Cada item: [ids, acao, detalhe]. */
export async function logs(db, user, itens) {
  if (!itens.length) return;
  await db.run(`INSERT INTO frotas_historico (pedido_id, veiculo_id, chamado_id, autor_id, autor_nome, acao, detalhe) VALUES ${itens.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
    ...itens.flatMap(([x, acao, detalhe = null]) => [x.pedido ?? null, x.veiculo ?? null, x.chamado ?? null, user?.id ?? null, user?.name ?? 'Sistema', acao, detalhe]));
}
export const log = (db, x, user, acao, detalhe = null) => logs(db, user, [[x, acao, detalhe]]);

/** Pedido pronto para enviar: data, local e categoria preenchidos. */
export function pedidoCompleto(p) {
  return isDate(p.data_retirada) && !!p.local && !!p.categoria;
}

/** Texto que o solicitante vê sobre o chamado aberto do veículo. */
export function situacaoChamado(c, veiculo) {
  if (!c) return null;
  if (c.status === 'pendente') return 'Aguardando aprovação da central';
  if (c.status === 'reprovado') return `Reprovado pela central${c.resposta ? `: ${c.resposta}` : ''}. Clique em Finalizar para encerrar o chamado.`;
  if (c.status === 'aprovado') return 'Aprovado — aguardando a central agendar';
  if (c.status !== 'agendado') return CHAMADO_STATUS[c.status];
  if (c.tipo === 'substituicao') return 'Liberado. Faça a troca de condutor e depois finalize o chamado.';
  if (c.tipo === 'encerramento') {
    if (c.placa_devolucao && veiculo && c.placa_devolucao !== veiculo.placa) return `Devolução não permitida — devolver a placa ${c.placa_devolucao}. Finalize para ver os detalhes.`;
    return `Devolver o veículo em ${c.local_servico || '-'} no dia ${brDate(c.data_servico)}.`;
  }
  if (c.tipo === 'troca') return `Troca agendada em ${c.local_servico || '-'} no dia ${brDate(c.data_servico)}.`;
  return `Agendado em ${c.local_servico || '-'} · ${brDate(c.data_servico)}${c.hora_servico ? ` às ${c.hora_servico}` : ''}.`;
}
