export type Alerta = { tipo: string; texto: string; nivel?: string };
export type Totais = { itens_soja: number; itens_ignorados: number; quantidade: number; sementes: number; viaveis: number; area_potencial?: number; volume_potencial?: number };
export type Item = {
  id?: number; descricao: string; cultivar?: string | null; unidade?: string | null; quantidade?: number | null; sementes_por_unidade?: number | string | null; germinacao?: number | null;
  germinacao_padrao?: number | boolean | null; incluido: boolean; motivo_exclusao?: string | null; total_sementes?: number; viaveis?: number;
  area_potencial?: number | null; volume_potencial?: number | null; spu_origem?: string | null;
};
export type NF = {
  id: number; codigo: string; status: string; mime: string; hash?: string | null; numero_nf?: string | null; serie?: string | null; chave_acesso?: string | null; chave_ok?: boolean; data_emissao?: string | null;
  emitente_nome?: string | null; emitente_doc_fmt?: string | null; produtor_nome?: string | null; produtor_doc_fmt?: string | null; municipio?: string | null; uf?: string | null; distrito?: string | null;
  peso_liquido?: number | null; ia_status?: string | null; alertas: Alerta[]; totais: Totais; itens: Item[]; motivo_recusa?: string | null; obs_central?: string | null;
  enviado_at?: string | null; substituta?: number | null;
};
export type Config = { ia: { ativo: boolean }; ufs: string[]; distritos: string[]; germinacao_padrao: number };
export const ROTULO: Record<string, string> = { rascunho: 'Rascunho', aguardando: 'Aguardando central', validada: 'Validada', recusada: 'Recusada', substituida: 'Substituída', cancelada: 'Cancelada' };
export const TOM: Record<string, 'neutro' | 'info' | 'aviso' | 'ok' | 'marca' | 'erro'> = { rascunho: 'neutro', aguardando: 'aviso', validada: 'ok', recusada: 'marca', substituida: 'neutro', cancelada: 'neutro' };
export const arquivoUrl = (n: NF) => `/api/m/nota_nf/arquivo/${n.id}?v=${n.hash?.slice(0, 8) ?? ''}`;
export const int = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('pt-BR');
export const dec = (n: unknown, d = 2) => (n == null || n === '' ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d }));