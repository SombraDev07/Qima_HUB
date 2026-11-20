export type Pessoa = { anexo_id: number; nome: string; email?: string | null; funcao?: string | null; movel?: boolean; cnh?: boolean; data_vinc?: string | null; demissao_pendente?: number | null };
export type Pedido = {
  id: number; codigo: string; projeto: string; funcao: string; cidade?: string | null; uf: string; distrito?: string | null; semana: number; data_desejada: string; observacao?: string | null;
  experiencia: boolean; cnh: boolean; movel: boolean; qtd: number; qtd_atendida: number; status: string; status_label: string; anexos: Pessoa[];
};
export type Config = { projetos: string[]; funcoes: string[]; ufs: string[] };
export const TOM: Record<string, 'neutro' | 'info' | 'aviso' | 'ok' | 'marca' | 'erro'> = { rascunho: 'neutro', pendente: 'aviso', em_recrutamento: 'info', parcial: 'marca', atendida: 'ok', finalizado: 'ok', cancelado: 'neutro', recusado: 'erro' };
export const AVISOS = ['Trabalhado', 'Indenizado', 'Não aplicável / validar com RH'];
export const JUSTIFICATIVAS = ['Comportamento', 'Desempenho', 'Pedido do colaborador', 'Término de contrato', 'Redução de quadro', 'Outro'];
export const local = (p: Pedido) => `${p.distrito || p.uf}${p.cidade ? ` · ${p.cidade} - ${p.uf}` : ''}`;
export const situacaoPessoa = (a: Pessoa) => (a.demissao_pendente ? 'Demissão em análise' : 'Anexado');
