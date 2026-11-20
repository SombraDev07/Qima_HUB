export type Chamado = {
  id: number; codigo: string; tipo: 'manutencao' | 'troca' | 'substituicao' | 'encerramento'; tipo_label: string; status: string; status_label: string; resposta?: string | null; resultado?: string | null;
  tipo_manutencao?: string | null; local_servico?: string | null; data_servico?: string | null; hora_servico?: string | null; condutor_novo?: string | null; data_inicio_nova?: string | null;
  data_saida_condutor?: string | null; placa_devolucao?: string | null; km_devolucao?: number | null; data_devolucao?: string | null; created_at?: string; modelo?: string | null; placa?: string | null;
};
export type Veiculo = {
  id: number; placa?: string | null; modelo?: string | null; categoria?: string | null; codigo_reserva?: string | null; local?: string | null; status: string; status_label: string; motorista?: string | null;
  inicio_contrato?: string | null; data_retirada?: string | null; km_retirada?: number | null; modalidade?: string | null; data_limite?: string | null; fotos_angulos: number; fotos_total: number; chamado?: Chamado | null; situacao?: string | null;
};
export type PedidoV = { id: number; codigo: string; data_retirada?: string | null; local?: string | null; categoria?: string | null; motivo?: string | null; motorista?: string | null; modalidade?: string | null; data_prevista?: string | null; status: string; status_label: string; resposta?: string | null; completo?: boolean; created_at: string; updated_at?: string };
export type Foto = { id: number; angulo: string; lat: number; lon: number; tirada_em: string; autor_nome?: string };
export type Config = { locais: string[]; categorias: string[]; modalidades: string[]; colaboradores: string[]; tipos_manutencao: string[]; angulos: string[] };
export const TOM: Record<string, 'neutro' | 'info' | 'aviso' | 'ok' | 'marca' | 'erro'> = {
  rascunho: 'neutro', solicitado: 'aviso', aprovado: 'info', reprovado: 'marca', reservado: 'info', em_uso: 'ok', encerrado: 'neutro', substituido: 'neutro', trocado: 'neutro', pendente: 'aviso', agendado: 'ok', finalizado: 'neutro', cancelado: 'neutro',
};
export const placaFmt = (v: string) => { const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); return /^[A-Z]{3}\d{4}$/.test(s) ? `${s.slice(0, 3)}-${s.slice(3)}` : s; };
export const km = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('pt-BR'));
export const veic = (v: Pick<Veiculo, 'modelo' | 'placa'>) => [v.modelo, v.placa].filter(Boolean).join(' · ') || 'Veículo sem placa';

// ------------------------------------------------------------------ modalidade e prazo (mesma regra do site)
/** 'mensal', 'diaria' ou '' pelo nome cadastrado da modalidade. */
export const tipoModalidade = (nome?: string | null) => {
  const n = String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return n.startsWith('mens') ? 'mensal' : n.startsWith('diar') ? 'diaria' : '';
};
export const DIAS_MENSAL = 30;
const hojeUtc = () => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
/** Dias de hoje até a data (negativo = venceu). */
export const diasAte = (iso?: string | null) => (iso ? Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - hojeUtc()) / 86400000) : null);
/** Verde, amarelo (até 7 dias) ou vermelho (até 2 dias ou vencido). */
export const tomPrazo = (n: number | null): 'ok' | 'aviso' | 'erro' | 'neutro' => (n === null ? 'neutro' : n <= 2 ? 'erro' : n <= 7 ? 'aviso' : 'ok');
export const textoPrazo = (n: number | null) => (n === null ? '' : n === 0 ? 'vence hoje' : n === 1 ? 'falta 1 dia' : n > 0 ? `faltam ${n} dias` : n === -1 ? 'venceu há 1 dia' : `venceu há ${-n} dias`);
