// Câmera do app para as fotos do carro: tira a foto, pega o GPS NO MOMENTO do clique, grava o carimbo (lado, placa, data, GPS, quem tirou)
// na própria imagem e envia. Não aceita foto da galeria: é a prova de "tirada agora, neste lugar".
import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { captureRef } from 'react-native-view-shot';
import { useNavigation, useRoute } from '@react-navigation/native';
import { enviarArquivo } from '../../api/cliente';
import { useAuth } from '../../auth/AuthContext';
import { Aviso, Botao, Icone, Tela, useAviso } from '../../ui';
import { useAcao } from '../../util/carregar';
import { reduzirFoto } from '../../util/foto';

type Tirada = { uri: string; w: number; h: number; lat: number; lon: number; precisao: number | null; quando: Date };
const LARGURA = 1400;

export function Camera() {
  const nav = useNavigation<any>();
  const { veiculoId, angulo, rotulo } = useRoute().params as { veiculoId: number; angulo: string; rotulo: string };
  const { usuario } = useAuth();
  const avisar = useAviso();
  const { executar, ocupado } = useAcao();
  const [perm, pedirPerm] = useCameraPermissions();
  const [tirando, setTirando] = useState(false);
  const [foto, setFoto] = useState<Tirada | null>(null);
  const [erro, setErro] = useState('');
  const cam = useRef<CameraView>(null);
  const carimbo = useRef<any>(null);

  const linhas = foto ? [
    `${angulo} · ${rotulo}`,
    `${foto.quando.toLocaleString('pt-BR')} · ${foto.lat.toFixed(5)}, ${foto.lon.toFixed(5)}`,
    `${usuario?.name} · ${usuario?.email}`,
  ] : [];

  const tirar = async () => {
    setErro(''); setTirando(true);
    try {
      const loc = await Location.requestForegroundPermissionsAsync();
      if (!loc.granted) throw new Error('Libere a localização (GPS) nas configurações do aparelho. Sem ela a foto não entra.');
      const [pos, img] = await Promise.all([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        cam.current!.takePictureAsync({ quality: 0.9, skipProcessing: false }),
      ]);
      if (!img) throw new Error('Não foi possível tirar a foto. Tente de novo.');
      const uri = await reduzirFoto(img.uri, img.width, img.height);
      setFoto({ uri, w: img.width, h: img.height, lat: pos.coords.latitude, lon: pos.coords.longitude, precisao: pos.coords.accuracy ?? null, quando: new Date() });
    } catch (x) { setErro(x instanceof Error ? x.message : 'Sem localização. Libere o GPS e tire a foto de novo.'); } finally { setTirando(false); }
  };

  const usar = async () => {
    if (!foto || !carimbo.current) return;
    const r = await executar(async () => {
      const arquivo = await captureRef(carimbo.current!, { format: 'jpg', quality: 0.86, result: 'tmpfile', width: LARGURA });
      const qs = new URLSearchParams({ angulo, lat: String(foto.lat), lon: String(foto.lon), precisao: foto.precisao != null ? String(foto.precisao) : '', tirada_em: foto.quando.toISOString().slice(0, 19) });
      return enviarArquivo(`/api/m/frotas/veiculos/${veiculoId}/fotos?${qs}`, arquivo, 'image/jpeg');
    });
    if (!r.ok) { setErro(r.erro); return; }
    avisar(`Foto ${angulo} salva`); nav.goBack();
  };

  if (!perm) return <Tela titulo={`Foto: ${angulo}`} aoVoltar={() => nav.goBack()}><View /></Tela>;
  if (!perm.granted) {
    return (
      <Tela titulo={`Foto: ${angulo}`} aoVoltar={() => nav.goBack()}>
        <Aviso tipo="info" texto="Para fotografar o carro o app precisa usar a câmera." />
        <Botao titulo="Liberar câmera" icone="camera" onPress={pedirPerm} />
      </Tela>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {!foto ? (
        <>
          <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" />
          <View style={e.topo}><Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => nav.goBack()} style={e.btnRedondo}><Icone nome="arrow-back" cor="#fff" /></Pressable>
            <View style={e.etiqueta}><Text style={{ color: '#fff', fontWeight: '800' }}>{angulo}</Text><Text style={{ color: '#d6e3e8', fontSize: 12 }}>{rotulo}</Text></View></View>
          {!!erro && <View style={e.erro}><Aviso texto={erro} /></View>}
          <View style={e.base}>
            <Pressable accessibilityRole="button" accessibilityLabel="Tirar foto" onPress={tirar} disabled={tirando} style={[e.disparo, { opacity: tirando ? 0.5 : 1 }]}><View style={e.disparoMiolo} /></Pressable>
            <Text style={{ color: '#d6e3e8', marginTop: 8, fontSize: 12.5 }}>{tirando ? 'Pegando a localização…' : 'A foto grava data, hora e GPS'}</Text>
          </View>
        </>
      ) : (
        <>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            {/* a imagem com o carimbo é montada aqui e capturada ao confirmar */}
            <View ref={carimbo} collapsable={false} style={{ width: '100%', aspectRatio: foto.w / foto.h, backgroundColor: '#000' }}>
              <Image source={{ uri: foto.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(12,48,62,.78)', paddingHorizontal: 12, paddingVertical: 8 }}>
                {linhas.map((l, i) => <Text key={i} style={{ color: '#fff', fontWeight: '700', fontSize: 11.5 }}>{l}</Text>)}
              </View>
            </View>
          </View>
          <View style={e.acoes}>
            {!!erro && <Aviso texto={erro} />}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Botao titulo="Refazer" variante="contorno" onPress={() => { setFoto(null); setErro(''); }} desabilitado={ocupado} estilo={{ flex: 1, backgroundColor: '#fff' }} />
              <Botao titulo="Usar foto" icone="checkmark" onPress={usar} carregando={ocupado} estilo={{ flex: 1.4 }} />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const e = StyleSheet.create({
  topo: { position: 'absolute', top: 44, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  btnRedondo: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  etiqueta: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  erro: { position: 'absolute', top: 110, left: 16, right: 16 },
  base: { position: 'absolute', bottom: 36, left: 0, right: 0, alignItems: 'center' },
  disparo: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  disparoMiolo: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  acoes: { padding: 16, paddingBottom: 30, backgroundColor: '#0b161b' },
});