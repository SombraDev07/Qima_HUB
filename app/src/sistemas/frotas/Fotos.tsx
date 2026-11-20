import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../../api/cliente';
import { useTema } from '../../tema';
import { Aviso, Botao, Cartao, Carregando, Chip, Icone, Tela } from '../../ui';
import { FotoAut } from '../../ui/FotoAut';
import { useCarregar } from '../../util/carregar';
import { fmtDataHora } from '../../util/datas';
import { descartar, processarFila, tentarDeNovo, useFila } from '../../util/fila';
import { veic, type Config, type Foto, type Veiculo } from './tipos';

const M = '/api/m/frotas';

/** Fotos do carro (lados, triângulo, pneu, estepe e macaco, documento, CNH e CPF/RG), com carimbo e GPS quando houver. São opcionais. */
export function Fotos() {
  const nav = useNavigation<any>();
  const t = useTema();
  const v = (useRoute().params as { veiculo: Veiculo }).veiculo;
  const fotos = useCarregar(() => api<Foto[]>(`${M}/veiculos/${v.id}/fotos`), [v.id]);
  const cfg = useCarregar(() => api<Config>(`${M}/config`));
  useFocusEffect(useCallback(() => { void fotos.recarregar(); }, [fotos.recarregar]));
  const ultima = (a: string) => (fotos.dados ?? []).find((f) => f.angulo === a);
  const angulos = cfg.dados?.angulos ?? [];
  const feitas = angulos.filter((a) => ultima(a)).length;
  const emUso = v.status === 'em_uso' || v.status === 'reservado';
  const fila = useFila().filter((x) => x.veiculoId === v.id);
  const naFila = (a: string) => fila.find((x) => x.angulo === a);
  return (
    <Tela titulo="Fotos do carro" subtitulo={veic(v)} aoVoltar={() => nav.goBack()} aoAtualizar={fotos.recarregar} atualizando={fotos.atualizando}>
      <Aviso tipo="info" texto={`A foto grava o item, data, hora, GPS (quando o celular informa) e quem tirou. Sem internet, ela fica guardada e sobe depois. As fotos são opcionais: o veículo pode ser ativado sem elas. ${feitas}/${angulos.length} feitas.`} />
      {fila.length > 0 && (
        <Cartao estilo={{ marginBottom: 12, borderColor: t.aviso }}>
          <Text style={{ color: t.texto, fontWeight: '800' }}>{fila.length} foto(s) esperando internet</Text>
          <Text style={{ color: t.suave, fontSize: 13 }}>Sobem sozinhas quando o sinal voltar, com a data e o GPS de quando foram tiradas.</Text>
          <Botao titulo="Enviar agora" icone="cloud-upload-outline" variante="suave" pequeno onPress={() => { void processarFila().then(() => fotos.recarregar()); }} estilo={{ marginTop: 10, alignSelf: 'flex-start' }} />
        </Cartao>
      )}
      {fotos.dados === null || !cfg.dados ? <Carregando /> : angulos.map((a) => {
        const f = ultima(a);
        const q = naFila(a);
        return (
          <Cartao key={a} estilo={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={{ width: 72, height: 72, borderRadius: 12, backgroundColor: t.suaveFundo, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {f ? <FotoAut caminho={`${M}/foto/${f.id}`} estilo={{ width: 72, height: 72 }} /> : <Icone nome="camera-outline" tamanho={26} cor={t.suave} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.texto, fontWeight: '800', fontSize: 16 }}>{a}</Text>
                {f ? (<>
                  <Text style={{ color: t.suave, fontSize: 12.5 }}>{fmtDataHora(f.tirada_em)}</Text>
                  <Text style={{ color: t.suave, fontSize: 12.5 }}>{f.lat != null && f.lon != null ? `${Number(f.lat).toFixed(5)}, ${Number(f.lon).toFixed(5)}` : 'Sem GPS'} · {f.autor_nome}</Text>
                </>) : !q && <View style={{ marginTop: 4 }}><Chip texto="Sem foto" /></View>}
                {q && <View style={{ marginTop: 4 }}><Chip texto={q.erro ? 'Recusada pelo servidor' : 'Esperando internet'} tom={q.erro ? 'erro' : 'aviso'} /></View>}
                {q?.erro && <Text style={{ color: t.erro, fontSize: 12.5, marginTop: 4 }}>{q.erro}</Text>}
                {q?.erro && <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <Botao titulo="Tentar de novo" variante="suave" pequeno onPress={() => tentarDeNovo(q.id)} />
                  <Botao titulo="Descartar" variante="perigo" pequeno onPress={() => descartar(q.id)} />
                </View>}
              </View>
            </View>
            {emUso && <Botao titulo={f ? 'Refazer' : 'Tirar foto'} icone="camera" variante={f ? 'contorno' : 'principal'} pequeno onPress={() => nav.navigate('frotas.Camera', { veiculoId: v.id, angulo: a, rotulo: veic(v) })} estilo={{ marginTop: 12 }} />}
          </Cartao>
        );
      })}
    </Tela>
  );
}