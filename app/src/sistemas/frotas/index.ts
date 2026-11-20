import type { SistemaApp } from '../registro';
import { Camera } from './Camera';
import { Fotos } from './Fotos';
import { Lista } from './Lista';

export const frotas: SistemaApp = { cor: '#1d6a85', icone: 'car', inicial: 'Lista', telas: { Lista, Fotos, Camera } };