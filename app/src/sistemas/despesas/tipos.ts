export type Alerta = { tipo: string; texto: string };
export type Nota = {
  id: number; codigo: string; valor: number | null; data: string | null; tipo: string | null; centro_custo: string | null; motivo: string | null; emitente: string | null;
  cnpj_fmt?: string | null; cnpj?: string | null; numero_nf: string | null; ia_status?: string | null; ia_valor?: number | null; ia_data?: string | null; alertas: Alerta[];
  status: string; mime: string; hash?: string | null; substitui_id?: number | null; valor_aprovado?: number | null; motivo_recusa?: string | null; editado_central?: boolean;
};
export type Pedido = {
  id: number; codigo: string; status: string; notas: Nota[]; total_declarado: number; total_aprovado: number; pago_em?: string | null; pix_tipo: string; pix_chave: string;
  obs_central?: string | null; created_at: string; historico: { id: number; acao: string; detalhe?: string | null; created_at: string }[];
};
export type Config = {
  tipos: string[]; centros: string[]; dias_limite: number; pix_tipos: string[]; colaborador: string; ia: { ativo: boolean };
  perfil: { centro_custo?: string; pix_tipo?: string; pix_chave?: string };
};
export const TOM_PEDIDO: Record<string, 'neutro' | 'info' | 'aviso' | 'ok' | 'marca' | 'erro'> = { aguardando: 'aviso', aprovado: 'ok', parcial: 'info', reprovado: 'marca', cancelado: 'neutro' };
export const ROTULO_PEDIDO: Record<string, string> = { aguardando: 'Aguardando central', aprovado: 'Aprovado', parcial: 'Aprovado parcial', reprovado: 'Reprovado', cancelado: 'Cancelado' };
export const TOM_NOTA: Record<string, 'neutro' | 'info' | 'aviso' | 'ok' | 'marca' | 'erro'> = { rascunho: 'neutro', aguardando: 'aviso', ok: 'ok', recusada: 'marca', substituida: 'neutro', cancelada: 'neutro' };
export const ROTULO_NOTA: Record<string, string> = { rascunho: 'Rascunho', aguardando: 'Aguardando', ok: 'OK', recusada: 'Recusada', substituida: 'Substituída', cancelada: 'Cancelada' };
export const arquivoUrl = (n: Nota) => `/api/m/despesas/arquivo/${n.id}?v=${n.hash?.slice(0, 8) ?? ''}`;