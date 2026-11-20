// Imagem que o servidor só entrega a quem está logado. Baixada com o token e mostrada da memória:
// não fica gravada no cache de imagens do aparelho (fotos de documentos, CNH, notas). A memória é limpa ao sair da conta.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, View, type ImageStyle, type StyleProp } from 'react-native';
import { URL_API, autorizacao } from '../api/cliente';

const memoria = new Map<string, string>();
const MAX = 40;
export const limparFotosEmMemoria = () => memoria.clear();

async function baixar(caminho: string): Promise<string> {
  const ja = memoria.get(caminho);
  if (ja) return ja;
  const r = await fetch(`${URL_API}${caminho}`, { headers: autorizacao() });
  if (!r.ok) throw new Error(String(r.status));
  const blob = await r.blob();
  const dataUri = await new Promise<string>((ok, falha) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result));
    leitor.onerror = () => falha(new Error('leitura'));
    leitor.readAsDataURL(blob);
  });
  if (memoria.size >= MAX) memoria.delete(memoria.keys().next().value as string);
  memoria.set(caminho, dataUri);
  return dataUri;
}

export function FotoAut({ caminho, estilo, resizeMode = 'cover' }: { caminho: string; estilo?: StyleProp<ImageStyle>; resizeMode?: 'cover' | 'contain' }) {
  const [uri, setUri] = useState<string | null>(memoria.get(caminho) ?? null);
  useEffect(() => {
    let vivo = true;
    baixar(caminho).then((u) => { if (vivo) setUri(u); }).catch(() => { /* fica o espaço vazio */ });
    return () => { vivo = false; };
  }, [caminho]);
  if (!uri) return <View style={[{ alignItems: 'center', justifyContent: 'center' }, estilo as object]}><ActivityIndicator /></View>;
  return <Image source={{ uri }} style={estilo} resizeMode={resizeMode} accessibilityIgnoresInvertColors />;
}
