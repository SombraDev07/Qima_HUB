export type Anexo = { id: number; nome: string; tamanho: number; ativo?: boolean; created_at?: string };
export type Linha = { k: string; cod_visita: string; documento: string; data: string; negativa: number; declarada: number; positiva: number; participante: number };
export type Mensagem = { id: number; papel: 'solicitante' | 'central' | 'sistema'; autor_nome?: string; texto: string; lida: boolean; created_at: string };
export type Pedido = {
  id: number; codigo: string; tipo: 'exclusao' | 'insercao' | 'acumulado'; subtipo?: 'insercao' | 'correcao' | null; tipo_label: string; status: string; status_label: string;
  projeto: string; cod_visita?: string | null; id_carga?: string | null; motivo?: string | null; titulo?: string | null; descricao?: string | null;
  data_inicial?: string | null; data_final?: string | null; obs_central?: string | null; responsavel_nome?: string | null; created_at: string;
  linhas_qtd?: number; msgs_central?: number; anexo?: Anexo | null; linhas?: Omit<Linha, 'k'>[]; arquivos?: Anexo[]; mensagens?: Mensagem[];
};
export type Config = { projetos: string[]; tipos: Record<string, string>; subtipos: Record<string, string>; status: Record<string, string> };
export const TOM: Record<string, 'neutro' | 'info' | 'aviso' | 'ok' | 'marca' | 'erro'> = { pendente: 'aviso', analise: 'info', correcao: 'marca', feito: 'ok', cancelado: 'neutro' };
export const EDITAVEIS = ['pendente', 'correcao'];
export const linhaVazia = (): Linha => ({ k: Math.random().toString(36).slice(2), cod_visita: '', documento: '', data: '', negativa: 0, declarada: 0, positiva: 0, participante: 0 });
export const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
export const kb = (n?: number) => (n ? (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : '');