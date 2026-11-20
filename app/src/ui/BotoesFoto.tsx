// "Tirar foto" (câmera do aparelho), "Galeria" (várias) e, se quiser, "PDF". Entrega os arquivos já reduzidos.
import { View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { escolherFotos, type FotoPronta } from '../util/foto';
import { useAviso } from '.';
import { Botao } from '.';

export function BotoesFoto({ aoEscolher, multiplas = true, comPdf = false, desabilitado = false }: { aoEscolher: (f: FotoPronta[]) => void; multiplas?: boolean; comPdf?: boolean; desabilitado?: boolean }) {
  const avisar = useAviso();
  const abrir = async (origem: 'camera' | 'galeria') => {
    try { const fs = await escolherFotos(origem, multiplas); if (fs.length) aoEscolher(fs); } catch (x) { avisar(x instanceof Error ? x.message : 'Não foi possível abrir.', 'erro'); }
  };
  const pdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (!r.canceled && r.assets?.[0]) aoEscolher([{ uri: r.assets[0].uri, nome: r.assets[0].name, mime: 'application/pdf' }]);
  };
  return (
    <View style={{ gap: 10 }}>
      <Botao titulo="Tirar foto" icone="camera" onPress={() => abrir('camera')} desabilitado={desabilitado} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Botao titulo={multiplas ? 'Galeria' : 'Escolher da galeria'} icone="images-outline" variante="contorno" onPress={() => abrir('galeria')} desabilitado={desabilitado} estilo={{ flex: 1 }} />
        {comPdf && <Botao titulo="PDF" icone="document-outline" variante="contorno" onPress={pdf} desabilitado={desabilitado} estilo={{ flex: 1 }} />}
      </View>
    </View>
  );
}