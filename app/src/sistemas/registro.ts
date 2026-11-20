// Registro dos sistemas que já têm telas no app. Um sistema nunca importa outro: o núcleo só consulta este mapa.
import type { ComponentType } from 'react';
import type { NomeIcone } from '../ui';
import { contratacao } from './contratacao';
import { despesas } from './despesas';
import { equipamentos } from './equipamentos';
import { frotas } from './frotas';
import { hospedagens } from './hospedagens';
import { nota_nf } from './nota_nf';
import { solicitacoes } from './solicitacoes';

export type SistemaApp = { cor: string; icone: NomeIcone; inicial: string; telas: Record<string, ComponentType<any>> };

/** Sistemas com telas prontas no app. */
export const sistemasApp: Record<string, SistemaApp> = { contratacao, despesas, equipamentos, frotas, hospedagens, nota_nf, solicitacoes };

/** Cor e ícone de cada sistema. */
export const identidade: Record<string, { cor: string; icone: NomeIcone }> = {
  frotas: { cor: '#1d6a85', icone: 'car' },
  despesas: { cor: '#0f7a4b', icone: 'receipt' },
  nota_nf: { cor: '#6b8f23', icone: 'leaf' },
  equipamentos: { cor: '#5b4bc4', icone: 'laptop' },
  solicitacoes: { cor: '#b45309', icone: 'clipboard' },
  hospedagens: { cor: '#c8456b', icone: 'bed' },
  contratacao: { cor: '#0e7490', icone: 'people' },
};
export const identidadeDe = (chave: string) => identidade[chave] ?? { cor: '#1d6a85', icone: 'apps' as NomeIcone };