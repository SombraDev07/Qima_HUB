import type { SistemaApp } from '../registro';
import { Formulario } from './Formulario';
import { Lista } from './Lista';
import { Ver } from './Ver';

export const solicitacoes: SistemaApp = { cor: '#b45309', icone: 'clipboard', inicial: 'Lista', telas: { Lista, Formulario, Pedido: Ver } };