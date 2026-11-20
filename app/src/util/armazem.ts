// Arquivos do app no aparelho (pasta privada do app): rascunhos e fila de fotos. Tudo é apagado ao sair da conta.
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

const web = Platform.OS === 'web';
const pasta = () => new Directory(Paths.document, 'qima');
const garantir = () => { const d = pasta(); if (!d.exists) d.create({ intermediates: true, idempotent: true }); return d; };
const nomeSeguro = (n: string) => n.replace(/[^a-z0-9_.-]/gi, '_').slice(0, 80);

export function lerJson<T>(nome: string, padrao: T): T {
  try {
    if (web) { const s = globalThis.localStorage?.getItem(`qima:${nome}`); return s ? JSON.parse(s) as T : padrao; }
    const f = new File(pasta(), `${nomeSeguro(nome)}.json`);
    return f.exists ? JSON.parse(f.textSync()) as T : padrao;
  } catch { return padrao; }
}

export async function gravarJson(nome: string, valor: unknown): Promise<void> {
  try {
    if (web) { globalThis.localStorage?.setItem(`qima:${nome}`, JSON.stringify(valor)); return; }
    const f = new File(garantir(), `${nomeSeguro(nome)}.json`);
    if (!f.exists) f.create();
    await f.write(JSON.stringify(valor));
  } catch { /* sem espaço ou sem permissão: o app segue sem guardar */ }
}

export function apagarJson(nome: string): void {
  try {
    if (web) { globalThis.localStorage?.removeItem(`qima:${nome}`); return; }
    const f = new File(pasta(), `${nomeSeguro(nome)}.json`);
    if (f.exists) f.delete();
  } catch { /* nada a apagar */ }
}

/** Copia um arquivo temporário (foto) para a pasta do app, onde o sistema não apaga. Devolve o endereço novo. */
export async function guardarArquivo(uriTemporario: string, nome: string): Promise<string> {
  const destino = new File(garantir(), nomeSeguro(nome));
  if (destino.exists) destino.delete();
  await new File(uriTemporario).copy(destino);
  return destino.uri;
}

export function apagarArquivo(uri: string): void {
  try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* já não existe */ }
}

/** Ao sair da conta: apaga rascunhos, fila e fotos guardadas, e o cache de imagens do app. */
export function limparTudo(): void {
  try {
    if (web) { Object.keys(globalThis.localStorage ?? {}).filter((k) => k.startsWith('qima:')).forEach((k) => globalThis.localStorage.removeItem(k)); return; }
    const d = pasta(); if (d.exists) d.delete();
    // fotos temporárias da câmera e das imagens baixadas
    for (const item of Paths.cache.list()) { try { item.delete(); } catch { /* em uso */ } }
  } catch { /* segue */ }
}
