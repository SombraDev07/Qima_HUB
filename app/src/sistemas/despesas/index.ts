import type { SistemaApp } from '../registro';
import { Lista } from './Lista';
import { Pedido_ } from './Pedido';

export const despesas: SistemaApp = { cor: '#0f7a4b', icone: 'receipt', inicial: 'Lista', telas: { Lista, Pedido: Pedido_ } };