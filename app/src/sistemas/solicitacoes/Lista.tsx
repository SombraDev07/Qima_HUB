import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../../api/cliente';
import { Aviso, BotaoFlutuante, Carregando, Chip, ItemLista, ListaPlana, Tela, Vazio } from '../../ui';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTema } from '../../tema';
import { useCarregar } from '../../util/carregar';
import { fmtData } from '../../util/datas';
import { TOM, type Pedido } from './tipos';

const ABAS = [
  { k: 'pendente', rotulo: 'Pendente', f: (p: Pedido) => p.status === 'pendente' },
  { k: 'correcao', rotulo: 'Para corrigir', f: (p: Pedido) => p.status === 'correcao' },
  { k: 'analise', rotulo: 'Em análise', f: (p: Pedido) => p.status === 'analise' },
  { k: 'final', rotulo: 'Finalizado', f: (p: Pedido) => ['feito', 'cancelado'].includes(p.status) },
];

export function Lista() {
  const nav = useNavigation<any>();
  const t = useTema();
  const { dados, erro, atualizando, recarregar } = useCarregar(() => api<Pedido[]>('/api/m/solicitacoes/meus'));
  const [aba, setAba] = useState('pendente');
  useFocusEffect(useCallback(() => { void recarregar(); }, [recarregar]));
  const todos = dados ?? [];
  const lista = todos.filter(ABAS.find((a) => a.k === aba)!.f);
  const cabecalho = (
    <>
      {!!erro && <Aviso texto={erro} />}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
        {ABAS.map((a) => {
          const n = todos.filter(a.f).length;
          const ativo = aba === a.k;
          const alerta = a.k === 'correcao' && n > 0;
          return (
            <Pressable key={a.k} accessibilityRole="tab" onPress={() => setAba(a.k)} style={{ minHeight: 40, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', backgroundColor: ativo ? t.marca : alerta ? t.avisoFundo : t.suaveFundo }}>
              <Text style={{ fontWeight: '700', color: ativo ? '#fff' : alerta ? t.aviso : t.texto }}>{a.rotulo} ({n})</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
  return (
    <Tela titulo="Solicitações" subtitulo="Central Harvest" aoVoltar={() => nav.goBack()} semRolagem>
      {dados === null && !erro ? <Carregando /> : (
        <ListaPlana dados={lista} chave={(p) => String(p.id)} cabecalho={cabecalho} aoAtualizar={recarregar} atualizando={atualizando}
          vazio={<Vazio icone="clipboard-outline" titulo="Nada aqui" texto="Toque em “Nova” para abrir uma solicitação." />}
          renderizar={(p) => (
            <ItemLista titulo={p.codigo} destaque={p.tipo_label} onPress={() => nav.navigate('solicitacoes.Pedido', { id: p.id })}
              linhas={[[p.cod_visita && `Visita ${p.cod_visita}`, p.titulo, p.linhas_qtd ? `${p.linhas_qtd} linha(s)` : ''].filter(Boolean)[0] as string, `${p.projeto} · ${fmtData(p.created_at.slice(0, 10))}`, p.status === 'correcao' && p.obs_central ? `Central: ${p.obs_central}` : '']}
              chips={<><Chip texto={p.status_label} tom={TOM[p.status]} />{!!p.msgs_central && <Chip texto={`${p.msgs_central} mensagem(ns) nova(s)`} tom="marca" />}</>} />
          )} />
      )}
      <BotaoFlutuante titulo="Nova" onPress={() => nav.navigate('solicitacoes.Formulario', {})} />
      <View />
    </Tela>
  );
}