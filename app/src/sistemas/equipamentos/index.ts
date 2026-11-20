import type { SistemaApp } from '../registro';
import { Formulario } from './Formulario';
import { Lista } from './Lista';

export const equipamentos: SistemaApp = { cor: '#5b4bc4', icone: 'laptop', inicial: 'Lista', telas: { Lista, Formulario } };