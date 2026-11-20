import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../../api/cliente';
import { useTema } from '../../tema';
import { Aviso, Botao, Campo, Cartao, Carregando, Chip, Icone, Secao, Tela, Vazio, useAviso, useConfirmar } from '../../ui';
import { useAcao, useCarregar } from '../../util/carregar';
import { fmtData, fmtDataHora } from '../../util/datas';
import { EDITAVEIS, TOM, kb, type Mensagem, type Pedido } from './tipos';

const M = '/api/m/solicitacoes';

export function Ver() {
  const nav = useNavigation<any>();
  const t = useTema();
  const id = (useRoute().params as { id: number }).id;
  const avisar = useAviso();
  const confirmar = useConfirmar();
  const { executar, ocupado } = useAcao();
  const { dados: p, erro, atualizando, recarregar } = useCarregar(() => api<Pedido>(`${M}/pedidos/${id}`), [id]);
  const [msgs, setMsgs] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const ref = useRef(recarregar);
  ref.current = recarregar;
  useFocusEffect(useCallback(() => { void ref.current(); }, []));
  useEffect(() => { if (p?.mensagens) setMsgs(p.mensagens); }, [p]);
  // a conversa se atualiza sozinha enquanto a tela está aberta
  useEffect(() => {
    const i = setInterval(() => { api<{ mensagens: Mensagem[] }>(`${M}/pedidos/${id}/mensagens`).then((r) => setMsgs(r.mensagens)).catch(() => {}); }, 20000);
    return () => clearInterval(i);
  }, [id]);

  if (erro && !p) return <Tela titulo="Solicitação" aoVoltar={() => nav.goBack()}><Aviso texto={erro} /></Tela>;
  if (!p) return <Tela titulo="Solicitação" aoVoltar={() => nav.goBack()}><Carregando /></Tela>;
  const editavel = EDITAVEIS.includes(p.status);
  const campos = ([['Projeto', p.projeto], ['Código da visita', p.cod_visita], ['ID da carga', p.id_carga], ['Título', p.titulo], p.data_inicial ? ['Período', `${fmtData(p.data_inicial)} a ${fmtData(p.data_final)}`] : null,
    p.responsavel_nome ? ['Atendido por', p.responsavel_nome] : null] as ([string, string | null | undefined] | null)[]).filter((c): c is [string, string] => !!c && !!c[1]);

  const cancelar = async () => {
    if (!await confirmar({ titulo: `Cancelar ${p.codigo}?`, mensagem: 'A central não vai mais atender esta solicitação.', confirmar: 'Cancelar solicitação', cancelar: 'Voltar', perigo: true })) return;
    const r = await executar(() => api(`${M}/meus/${p.id}/cancelar`, { metodo: 'POST', corpo: {} }));
    if (!r.ok) { avisar(r.erro, 'erro'); return; }
    avisar('Solicitação cancelada'); void recarregar();
  };
  const enviarMsg = async () => {
    if (!texto.trim()) return;
    const r = await executar(() => api<{ mensagens: Mensagem[] }>(`${M}/pedidos/${p.id}/mensagens`, { metodo: 'POST', corpo: { texto, lado: 'solicitante' } }));
    if (!r.ok) { avisar(r.erro, 'erro'); return; }
    setMsgs(r.valor.mensagens); setTexto('');
  };

  return (
    <Tela titulo={p.codigo} subtitulo={p.tipo_label} aoVoltar={() => nav.goBack()} aoAtualizar={recarregar} atualizando={atualizando}>
      <Chip texto={p.status_label} tom={TOM[p.status]} />
      {p.status === 'correcao' && <View style={{ marginTop: 12 }}><Aviso tipo="info" texto="A central devolveu para correção. Veja a conversa abaixo, toque em Corrigir, ajuste e reenvie." /></View>}
      <Cartao estilo={{ marginTop: 14 }}>
        {campos.map(([k, v]) => <View key={k} style={{ marginBottom: 8 }}><Text style={{ color: t.suave, fontSize: 12.5 }}>{k}</Text><Text style={{ color: t.texto, fontSize: 15.5, fontWeight: '600' }}>{v}</Text></View>)}
        {!!p.motivo && <View style={{ marginBottom: 8 }}><Text style={{ color: t.suave, fontSize: 12.5 }}>Motivo</Text><Text style={{ color: t.texto }}>{p.motivo}</Text></View>}
        {!!p.descricao && <View><Text style={{ color: t.suave, fontSize: 12.5 }}>{p.subtipo === 'correcao' ? 'Observação' : 'Descrição'}</Text><Text style={{ color: t.texto }}>{p.descricao}</Text></View>}
      </Cartao>
      {(p.arquivos ?? []).length > 0 && (
        <>
          <Secao titulo="Anexo" />
          {p.arquivos!.map((a) => <Cartao key={a.id} estilo={{ marginBottom: 8, padding: 12, flexDirection: 'row', alignItems: 'center' }}><Icone nome="document-text-outline" tamanho={22} cor={t.suave} /><Text style={{ flex: 1, color: t.texto, marginLeft: 10 }} numberOfLines={2}>{a.nome} · {kb(a.tamanho)}{a.ativo ? '' : ' (versão anterior)'}</Text></Cartao>)}
        </>
      )}
      {(p.linhas ?? []).length > 0 && (
        <>
          <Secao titulo={`Linhas da correção (${p.linhas!.length})`} />
          {p.linhas!.slice(0, 30).map((l, i) => (
            <Cartao key={i} estilo={{ marginBottom: 6, padding: 10 }}>
              <Text style={{ color: t.texto, fontWeight: '700' }}>{l.cod_visita}</Text>
              <Text style={{ color: t.suave, fontSize: 12.5 }}>Neg {l.negativa} · Decl {l.declarada} · Pos {l.positiva} · Part {l.participante}</Text>
            </Cartao>
          ))}
        </>
      )}

      <Secao titulo="Conversa com a central" />
      {!msgs.length ? <Vazio icone="chatbubbles-outline" titulo="Nenhuma mensagem ainda" /> : msgs.map((m) => (m.papel === 'sistema' ? (
        <Text key={m.id} style={{ color: t.suave, fontSize: 12.5, textAlign: 'center', marginVertical: 6 }}>{m.texto} · {fmtDataHora(m.created_at)}</Text>
      ) : (
        <View key={m.id} style={{ alignSelf: m.papel === 'solicitante' ? 'flex-end' : 'flex-start', maxWidth: '86%', marginVertical: 4, padding: 10, borderRadius: 14, backgroundColor: m.papel === 'solicitante' ? t.infoFundo : t.cartao, borderWidth: m.papel === 'solicitante' ? 0 : 0.5, borderColor: t.linha }}>
          <Text style={{ color: t.suave, fontSize: 12 }}>{m.autor_nome} · {m.papel === 'central' ? 'Central' : 'Você'}</Text>
          <Text style={{ color: t.texto, fontSize: 15, marginTop: 2 }}>{m.texto}</Text>
          <Text style={{ color: t.suave, fontSize: 11.5, marginTop: 3 }}>{fmtDataHora(m.created_at)}{m.papel === 'solicitante' ? (m.lida ? ' · lida' : ' · não lida') : ''}</Text>
        </View>
      )))}
      {p.status !== 'cancelado' && (
        <View style={{ marginTop: 10 }}>
          <Campo rotulo="Mensagem" value={texto} onChangeText={setTexto} multilinha placeholder="Escreva para a central" />
          <Botao titulo="Enviar mensagem" icone="send" onPress={enviarMsg} desabilitado={!texto.trim()} carregando={ocupado} />
        </View>
      )}

      <View style={{ gap: 10, marginTop: 26 }}>
        <Botao titulo={p.status === 'correcao' ? 'Corrigir' : 'Editar pedido'} icone="create-outline" variante={p.status === 'correcao' ? 'principal' : 'contorno'} desabilitado={!editavel} onPress={() => nav.navigate('solicitacoes.Formulario', { id: p.id })} />
        <Botao titulo="Cancelar pedido" icone="close-circle-outline" variante="perigo" desabilitado={!editavel || ocupado} onPress={cancelar} />
        {!editavel && <Text style={{ color: t.suave, fontSize: 12.5, textAlign: 'center' }}>Edição e cancelamento só enquanto estiver Pendente ou devolvida para correção.</Text>}
      </View>
    </Tela>
  );
}