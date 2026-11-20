// Fotos no celular: escolher (câmera do aparelho ou galeria) e reduzir antes de enviar (a Vercel recusa corpo acima de ~4,5 MB).
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type FotoPronta = { uri: string; nome: string; mime: string; largura?: number; altura?: number };
const LADO_MAXIMO = 2000;

/** Reduz a foto (lado maior de 2000 px, JPEG 85%). Devolve o arquivo novo, normalmente abaixo de 1,5 MB. */
export async function reduzirFoto(uri: string, largura?: number, altura?: number): Promise<string> {
  const maior = Math.max(largura ?? 0, altura ?? 0);
  const acoes = maior > LADO_MAXIMO && largura && altura ? [{ resize: largura >= altura ? { width: LADO_MAXIMO } : { height: LADO_MAXIMO } }] : [];
  const r = await ImageManipulator.manipulateAsync(uri, acoes, { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
  return r.uri;
}

const nomeDe = (uri: string, i = 0) => uri.split('/').pop()?.split('?')[0] || `foto-${Date.now()}-${i}.jpg`;

/** Abre a câmera do sistema (uma foto) ou a galeria (várias). Devolve as fotos já reduzidas; lista vazia se a pessoa cancelou. */
export async function escolherFotos(origem: 'camera' | 'galeria', multiplas = true): Promise<FotoPronta[]> {
  if (origem === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Libere a câmera nas configurações do aparelho para tirar a foto.');
  }
  const r = origem === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: multiplas, quality: 1, selectionLimit: multiplas ? 15 : 1 });
  if (r.canceled) return [];
  return Promise.all(r.assets.map(async (a, i) => ({ uri: await reduzirFoto(a.uri, a.width, a.height), nome: (a.fileName || nomeDe(a.uri, i)).replace(/\.(heic|heif|png|webp)$/i, '.jpg'), mime: 'image/jpeg' })));
}