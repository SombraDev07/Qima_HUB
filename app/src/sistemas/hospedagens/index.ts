import type { SistemaApp } from '../registro';
import { Formulario } from './Formulario';
import { Lista } from './Lista';
import { Pedido_ } from './Pedido';

export const hospedagens: SistemaApp = { cor: '#c8456b', icone: 'bed', inicial: 'Lista', telas: { Lista, Formulario, Pedido: Pedido_ } };