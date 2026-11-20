// Imagem que o servidor só entrega a quem está logado (o app manda o token no cabeçalho).
import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { URL_API, autorizacao } from '../api/cliente';

export function FotoAut({ caminho, estilo, resizeMode = 'cover' }: { caminho: string; estilo?: StyleProp<ImageStyle>; resizeMode?: 'cover' | 'contain' }) {
  return <Image source={{ uri: `${URL_API}${caminho}`, headers: autorizacao() }} style={estilo} resizeMode={resizeMode} accessibilityIgnoresInvertColors />;
}