// Cores e medidas do QIMA HUB no celular (mesma identidade do site: azul-escuro #0c303e e vermelho QIMA).
import { useColorScheme } from 'react-native';

export const claro = {
  fundo: '#f3f6f7',
  cartao: '#ffffff',
  texto: '#14232b',
  suave: '#5b6b73',
  suaveFundo: '#e9eef0',
  linha: '#dbe3e7',
  marca: '#0c303e',
  destaque: '#e4002b',
  destaqueFundo: '#fde6ea',
  sobreMarca: '#ffffff',
  erro: '#b42318',
  erroFundo: '#fdeceb',
  ok: '#0f7a4b',
  okFundo: '#e3f5ea',
  aviso: '#9a5b00',
  avisoFundo: '#fff1dc',
  info: '#1d4f91',
  infoFundo: '#e5eefb',
  campo: '#ffffff',
};

export const escuro: typeof claro = {
  fundo: '#0b161b',
  cartao: '#13232a',
  texto: '#eef3f5',
  suave: '#9db0b8',
  suaveFundo: '#1b2f37',
  linha: '#24383f',
  marca: '#0c303e',
  destaque: '#ff5c75',
  destaqueFundo: '#3d1c24',
  sobreMarca: '#ffffff',
  erro: '#ff8a80',
  erroFundo: '#3a1a1a',
  ok: '#5fd39a',
  okFundo: '#16342a',
  aviso: '#f5b062',
  avisoFundo: '#3a2c14',
  info: '#8ab8f5',
  infoFundo: '#1a2d44',
  campo: '#0f1d23',
};

export type Tema = typeof claro;
export const useTema = (): Tema => (useColorScheme() === 'dark' ? escuro : claro);

/** Medidas: alvo de toque de pelo menos 48 (recomendação do Android). */
export const medida = { toque: 48, raio: 16, espaco: 16, gutter: 16 };