import type { SistemaApp } from '../registro';
import { Formulario } from './Formulario';
import { Lista } from './Lista';

export const contratacao: SistemaApp = { cor: '#0e7490', icone: 'people', inicial: 'Lista', telas: { Lista, Formulario } };