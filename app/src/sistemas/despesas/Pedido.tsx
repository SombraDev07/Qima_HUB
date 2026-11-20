import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { api, enviarArquivo } from '../../api/cliente';
import { useTema } from '../../tema';
import { Aviso, Botao, Cartao, Carregando, Chip, Secao, Tela, useAviso, useConfirmar } from '../../ui';
import { BotoesFoto } from '../../ui/BotoesFoto';
import { FotoAut } from '../../ui/FotoAut';
import { useAcao, useCarregar } from '../../util/carregar';
import { dinheiro, fmtData, fmtDataHora } from '../../util/datas';
import type { FotoPronta } from '../../util/foto';
import { NotaEditor } from './NotaEditor';
import { ROTULO_NOTA, ROTULO_PEDIDO, TOM_NOTA, TOM_PEDIDO, arquivoUrl, type Config, type Nota, type Pedido } from './tipos';

const M = '/api/m/despesas';

export function Pedido_() {
  const nav = useNavigation<any>();
  const t = useTema();
  const id = (useRoute().params as { id: number }).id;
  const avisar = useAviso();
  const confirmar = useConfirmar();
  const { executar, ocupado } = useAcao();
  const { dados: p, erro, atualizando, recarregar, definir } = useCarregar(() => api<Pedido>(`${M}/pedidos/${id}`), [id]);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [subindo, setSubindo] = useState<number | null>(null);
  useEffect(() => { api<Config>(`${M}/config`).then(setCfg).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { void recarregar(); }, [recarregar]));

  if (erro && !p) return <Tela titulo="Pedido" aoVoltar={() => nav.goBack()}><Aviso texto={erro} /></Tela>;
  if (!p || !cfg) return <Tela titulo="Pedido" aoVoltar={() => nav.goBack()}><Carregando /></Tela>;

  const principais = p.notas.filter((n) => ['aguardando', 'ok', 'recusada'].includes(n.status));
  const substitutas = p.notas.filter((n) => n.status === 'rascunho' && n.substitui_id);
  const podeCancelar = p.status === 'aguardando' && principais.every((n) => n.status === 'aguardando');

  const novaFoto = async (nota: Nota, fotos: FotoPronta[]) => {
    const f = fotos[0];
    setSubindo(nota.id);
    try { await enviarArquivo(`${M}/notas?nome=${encodeURIComponent(f.nome)}&substitui=${nota.id}`, f.uri, f.mime); await recarregar(); avisar('Foto nova recebida. Confira os dados e toque em Reenviar.'); }
    catch (x) { avisar(x instanceof Error ? x.message : 'Não foi possível enviar.', 'erro'); } finally { setSubindo(null); }
  };
  const reenviar = async (n: Nota) => {
    const r = await executar(() => api(`${M}/notas/${n.id}/reenviar`, { metodo: 'POST', corpo: {} }));
    if (!r.ok) { avisar(r.erro, 'erro'); return; }
    avisar(`${n.codigo} reenviada para a central`); void recarregar();
  };
  const descartar = async (n: Nota) => { const r = await executar(() => api(`${M}/notas/${n.id}`, { metodo: 'DELETE' })); if (!r.ok) avisar(r.erro, 'erro'); else void recarregar(); };
  const cancelar = async () => {
    if (!await confirmar({ titulo: `Cancelar o pedido ${p.codigo}?`, mensagem: 'O pedido de reembolso deixa de ser analisado pela central.', confirmar: 'Cancelar pedido', perigo: true })) return;
    const r = await executar(() => api(`${M}/pedidos/${p.id}/cancelar`, { metodo: 'POST', corpo: {} }));
    if (!r.ok) { avisar(r.erro, 'erro'); return; }
    avisar('Pedido cancelado'); void recarregar();
  };

  return (
    <Tela titulo={p.codigo} subtitulo={`PIX ${p.pix_tipo}: ${p.pix_chave}`} aoVoltar={() => nav.goBack()} aoAtualizar={recarregar} atualizando={atualizando}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Chip texto={ROTULO_PEDIDO[p.status] ?? p.status} tom={TOM_PEDIDO[p.status]} />
        {!!p.pago_em && <Chip texto={`Pago em ${fmtData(p.pago_em)}`} tom="ok" />}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Cartao estilo={{ flex: 1 }}><Text style={{ color: t.suave, fontSize: 12.5 }}>Declarado</Text><Text style={{ color: t.texto, fontSize: 18, fontWeight: '800' }}>{dinheiro(p.total_declarado)}</Text></Cartao>
        <Cartao estilo={{ flex: 1 }}><Text style={{ color: t.suave, fontSize: 12.5 }}>Aprovado</Text><Text style={{ color: t.ok, fontSize: 18, fontWeight: '800' }}>{p.status === 'aguardando' && !principais.some((n) => n.status === 'ok') ? '—' : dinheiro(p.total_aprovado)}</Text></Cartao>
      </View>
      {!!p.obs_central && <View style={{ marginTop: 14 }}><Aviso tipo="info" texto={`Central: ${p.obs_central}`} /></View>}

      <Secao titulo={`Notas (${principais.length})`} />
      {principais.map((n) => {
        const sub = substitutas.find((s) => s.substitui_id === n.id);
        return (
          <View key={n.id}>
            <Cartao estilo={{ marginBottom: 10, borderColor: n.status === 'recusada' ? t.destaque : t.linha }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <FotoAut caminho={arquivoUrl(n)} estilo={{ width: 70, height: 94, borderRadius: 10, backgroundColor: t.suaveFundo }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={{ color: t.texto, fontWeight: '800', flex: 1 }}>{n.tipo}{n.emitente ? ` · ${n.emitente}` : ''}</Text>
                    <Chip texto={ROTULO_NOTA[n.status] ?? n.status} tom={TOM_NOTA[n.status]} />
                  </View>
                  <Text style={{ color: t.suave, fontSize: 12.5 }}>{n.codigo}</Text>
                  {!!n.motivo && <Text style={{ color: t.texto, fontSize: 14, marginTop: 4 }}>{n.motivo}</Text>}
                  <Text style={{ color: t.suave, marginTop: 4 }}>{fmtData(n.data)} · {dinheiro(n.valor)}{n.status === 'ok' ? ` · aprovado ${dinheiro(n.valor_aprovado)}` : ''}</Text>
                  {n.editado_central && <Text style={{ color: t.suave, fontSize: 12 }}>Dados ajustados pela central.</Text>}
                </View>
              </View>
              {n.status === 'recusada' && (
                <View style={{ marginTop: 12 }}>
                  <Aviso texto={`Recusada: ${n.motivo_recusa ?? ''}`} />
                  {!sub && <><Text style={{ color: t.suave, fontSize: 13, marginBottom: 8 }}>Envie outra foto desta despesa:</Text><BotoesFoto multiplas={false} aoEscolher={(f) => novaFoto(n, f)} desabilitado={subindo === n.id} /></>}
                </View>
              )}
            </Cartao>
            {sub && (
              <View style={{ marginLeft: 12, marginBottom: 10 }}>
                <Text style={{ color: t.suave, fontSize: 12.5, fontWeight: '700', marginBottom: 6 }}>NOVA FOTO PARA {n.codigo}</Text>
                <NotaEditor cfg={cfg} nota={sub} indice="nova" aoMudar={(x) => definir({ ...p, notas: p.notas.map((y) => (y.id === x.id ? x : y)) })} aoRemover={() => descartar(sub)}
                  acao={<Botao titulo="Reenviar nota" icone="send" onPress={() => reenviar(sub)} carregando={ocupado} estilo={{ marginTop: 12 }} />} />
              </View>
            )}
          </View>
        );
      })}
      {podeCancelar && <Botao titulo="Cancelar pedido" icone="close-circle-outline" variante="perigo" onPress={cancelar} desabilitado={ocupado} estilo={{ marginTop: 8 }} />}

      <Secao titulo={`Histórico (${p.historico.length})`} />
      <Cartao>
        {p.historico.map((h) => (
          <View key={h.id} style={{ borderLeftWidth: 3, borderLeftColor: t.marca, paddingLeft: 10, marginVertical: 5 }}>
            <Text style={{ color: t.texto, fontWeight: '700' }}>{h.acao}{h.detalhe ? ` · ${h.detalhe}` : ''}</Text>
            <Text style={{ color: t.suave, fontSize: 12.5 }}>{fmtDataHora(h.created_at)}</Text>
          </View>
        ))}
      </Cartao>
    </Tela>
  );
}