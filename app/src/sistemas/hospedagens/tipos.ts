// Tipos das respostas do sistema Hospedagens (rotas do Solicitante em /api/m/hospedagens).
export type StatusPedido = 'rascunho' | 'pendente' | 'ajustado' | 'em_andamento' | 'finalizado' | 'cancelado';
export type Hospede = { id: number; pessoa_id: number | null; nome: string; email?: string | null; tipo: 'colaborador' | 'open'; status: 'ativo' | 'checkout' | 'cancelado'; quarto_id?: number | null; demitido?: boolean };
export type Ocupante = { id: number; nome: string };
export type Quarto = {
  id: number; codigo: string; tipo: string; hotel_nome?: string | null; hotel_endereco?: string | null; hotel_telefone?: string | null;
  data_in: string; data_out: string; dias: number; situacao: string; enviado: boolean; ocupantes: Ocupante[];
};
export type Ajuste = { id: number; tipo: TipoAjuste; hospede_id?: number | null; hospede_nome?: string | null; quarto_id?: number | null; quarto_codigo?: string | null; quarto_ocupantes?: string | null; data?: string | null; obs?: string | null; status: string; resposta?: string | null };
export type TipoAjuste = 'cancelar' | 'prorrogar' | 'checkout' | 'editar' | 'cancelar_pedido';
export type Historico = { id: number; acao: string; detalhe?: string | null; user_nome?: string | null; created_at: string };
export type Pedido = {
  id: number; codigo: string; cidade: string; uf: string; data_inicio: string; data_fim: string; projeto?: string | null; garagem?: string | null; obs?: string | null;
  status: StatusPedido; hospedes: Hospede[]; quartos: Quarto[]; solicitacoes: Ajuste[]; historico: Historico[];
};
export type Opcoes = { projetos: string[]; ufs: string[] };
export type Pessoa = { id: number; nome: string; email?: string | null; funcao?: string | null; cidade?: string | null; demitido?: boolean };

export const ROTULO_STATUS: Record<string, { texto: string; tom: 'neutro' | 'info' | 'aviso' | 'ok' | 'marca' | 'erro' }> = {
  rascunho: { texto: 'Rascunho', tom: 'neutro' }, pendente: { texto: 'Solicitado', tom: 'aviso' }, ajustado: { texto: 'Ajustado', tom: 'aviso' },
  em_andamento: { texto: 'Em andamento', tom: 'info' }, finalizado: { texto: 'Finalizado', tom: 'ok' }, cancelado: { texto: 'Cancelado', tom: 'neutro' },
};
export const ROTULO_SITUACAO: Record<string, { texto: string; tom: 'neutro' | 'info' | 'aviso' | 'ok' | 'marca' | 'erro' }> = {
  novo: { texto: 'Novo', tom: 'neutro' }, enviado: { texto: 'Reservado', tom: 'info' }, alterado: { texto: 'Alterado', tom: 'aviso' }, prorrogado: { texto: 'Prorrogado', tom: 'marca' }, finalizado: { texto: 'Finalizado', tom: 'ok' },
};
export const ROTULO_AJUSTE: Record<TipoAjuste, string> = { cancelar: 'Cancelar', prorrogar: 'Prorrogar', checkout: 'Check-out', editar: 'Editar', cancelar_pedido: 'Cancelar pedido' };

// ------------------------------------------------------------------ status pelas datas (mesma regra do site)
// Depois da reserva: antes do check-in = Reservado; do check-in ao check-out = Em andamento; depois = Encerrado.
// Finalizado pela central (no financeiro) prevalece e trava os ajustes do solicitante.
type Tom = 'neutro' | 'info' | 'aviso' | 'ok' | 'marca' | 'erro';
export type StatusExibido = { chave: string; texto: string; tom: Tom };
const FASE: Record<string, StatusExibido> = {
  reservado: { chave: 'reservado', texto: 'Reservado', tom: 'neutro' },
  em_andamento: { chave: 'em_andamento', texto: 'Em andamento', tom: 'info' },
  encerrado: { chave: 'encerrado', texto: 'Encerrado', tom: 'ok' },
};
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const faseDatas = (ini?: string | null, fim?: string | null, hoje = hojeLocal()) => (fim && hoje > fim ? 'encerrado' : ini && hoje >= ini ? 'em_andamento' : 'reservado');
export function statusPedido(p: Pick<Pedido, 'status' | 'data_inicio' | 'data_fim'>): StatusExibido {
  if (p.status === 'finalizado') return { chave: 'finalizado', texto: 'Finalizado', tom: 'ok' };
  if (p.status === 'em_andamento') return FASE[faseDatas(p.data_inicio, p.data_fim)];
  const r = ROTULO_STATUS[p.status];
  return { chave: p.status, texto: r?.texto ?? p.status, tom: r?.tom ?? 'neutro' };
}
export function statusQuarto(q: Quarto, p?: Pick<Pedido, 'status' | 'data_inicio' | 'data_fim'>): StatusExibido {
  if (p?.status === 'finalizado') return statusPedido(p);
  return FASE[q.situacao === 'finalizado' ? 'encerrado' : faseDatas(q.data_in, q.data_out)];
}
export function statusHospede(h: Hospede, q: Quarto | undefined, p: Pick<Pedido, 'status' | 'data_inicio' | 'data_fim'>): StatusExibido {
  if (h.status === 'cancelado') return { chave: 'cancelado', texto: 'Cancelado', tom: 'neutro' };
  if (h.status === 'checkout') return FASE.encerrado;
  if (p.status === 'finalizado') return statusPedido(p);
  if (q?.enviado) return statusQuarto(q);
  return statusPedido(p);
}
export const pedidoAtivo = (p: Pick<Pedido, 'status'>) => !['finalizado', 'cancelado', 'rascunho'].includes(p.status);
export const abertasDe = (p: Pedido) => p.solicitacoes.filter((s) => s.status === 'aberta');
/** Quarto do hóspede: o atual ou o último em que esteve. */
export const quartoDe = (p: Pedido, h: Hospede): Quarto | undefined => p.quartos.find((x) => x.id === h.quarto_id) ?? [...p.quartos].reverse().find((x) => x.ocupantes.some((o) => o.id === h.id));
/** Ajuste aberto que já cobre o hóspede (dele ou do quarto inteiro dele). */
export const ajusteDoHospede = (p: Pedido, h: Hospede, q?: Quarto) => abertasDe(p).find((s) => s.hospede_id === h.id || (!s.hospede_id && !!s.quarto_id && !!q && s.quarto_codigo === q.codigo));
export const ajusteDoQuarto = (p: Pedido, q: Quarto) => abertasDe(p).find((s) => !s.hospede_id && !!s.quarto_id && s.quarto_codigo === q.codigo);
