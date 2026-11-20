export type Item = { tipo: string; qtd: number; motivo?: string };
export type Solicitacao = {
  id: number; codigo: string; colaborador?: string | null; cpf?: string | null; projeto: string; base: string; retirada?: string | null; devolucao?: string | null;
  obs?: string | null; status: string; status_label: string; itens: Item[]; anexados: number; precisa: number;
};
export type Equip = { id: number; tipo: string; modelo: string; patrimonio: string; status: string; base: string; colaborador?: string | null; projeto?: string | null; superior?: string | null; inicio?: string | null; fim?: string | null };
export type Config = { tipos: string[]; bases: string[]; projetos?: string[]; status_req: Record<string, string>; status_eq: Record<string, string> };
export const TOM: Record<string, 'neutro' | 'info' | 'aviso' | 'ok' | 'marca' | 'erro'> = {
  rascunho: 'neutro', enviado: 'info', reservado: 'info', em_uso: 'ok', devolucao_pendente: 'aviso', devolvido: 'neutro',
};
export const resumoItens = (s: Solicitacao) => s.itens.map((i) => `${i.qtd}× ${i.tipo}`).join(', ');
/** Projetos da Central de Viagens (mantém um projeto antigo que já não está na lista). */
export const opcoesProjeto = (cfg: Config | null | undefined, atual?: string | null) => {
  const l = [...(cfg?.projetos ?? [])];
  if (atual && !l.includes(atual)) l.unshift(atual);
  return l.map((p) => ({ valor: p, rotulo: p }));
};
