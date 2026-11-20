import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../../api/cliente';
import { Aviso, BotaoFlutuante, Campo, Carregando, Chip, ItemLista, ListaPlana, Segmentos, Tela, Vazio } from '../../ui';
import { useCarregar } from '../../util/carregar';
import { diasEntre, fmtCurta, fmtData, norm } from '../../util/datas';
import { AjusteFolha, CartaoHospede, CartaoQuarto, useRetirar, type AlvoAjuste } from './Pedido';
import { abertasDe, statusPedido, type Hospede, type Pedido, type Quarto } from './tipos';

const M = '/api/m/hospedagens';

export function Lista() {
  const nav = useNavigation<any>();
  const { dados, erro, atualizando, recarregar } = useCarregar(() => api<Pedido[]>(`${M}/meus`));
  const [aba, setAba] = useState<'pedidos' | 'hospedes' | 'quartos'>('pedidos');
  const [busca, setBusca] = useState('');
  const [dlg, setDlg] = useState<AlvoAjuste | null>(null);
  const { retirar, ocupado } = useRetirar(() => void recarregar());
  useFocusEffect(useCallback(() => { void recarregar(); }, [recarregar]));

  const pedidos = useMemo(() => (dados ?? []).filter((p) => !busca || norm(`${p.codigo} ${p.cidade} ${p.projeto} ${p.hospedes.map((h) => h.nome).join(' ')}`).includes(norm(busca))), [dados, busca]);
  const enviados = useMemo(() => pedidos.filter((p) => p.status !== 'rascunho'), [pedidos]);
  const hospedes = useMemo(() => enviados.flatMap((p) => p.hospedes.map((h): { h: Hospede; p: Pedido } => ({ h, p }))), [enviados]);
  const quartos = useMemo(() => enviados.flatMap((p) => p.quartos.filter((q) => q.enviado).map((q): { q: Quarto; p: Pedido } => ({ q, p }))), [enviados]);

  const cabecalho = (
    <>
      {!!erro && <Aviso texto={erro} />}
      <Segmentos valor={aba} aoMudar={setAba} opcoes={[
        { valor: 'pedidos', rotulo: 'Pedidos', qtd: pedidos.length }, { valor: 'hospedes', rotulo: 'Hóspedes', qtd: hospedes.length }, { valor: 'quartos', rotulo: 'Quartos', qtd: quartos.length },
      ]} />
      <Campo rotulo="Buscar" value={busca} onChangeText={setBusca} placeholder="Código, cidade, projeto ou hóspede" />
    </>
  );
  const comum = { cabecalho, aoAtualizar: recarregar, atualizando };

  return (
    <Tela titulo="Hospedagens" subtitulo="Solicitar e acompanhar viagens" aoVoltar={() => nav.goBack()} semRolagem>
      {dados === null && !erro ? <Carregando /> : aba === 'pedidos' ? (
        <ListaPlana dados={pedidos} chave={(p) => String(p.id)} {...comum}
          vazio={<Vazio icone="bed-outline" titulo="Nenhum pedido" texto="Toque em “Nova viagem” para solicitar hospedagem." />}
          renderizar={(p) => {
            const ajustes = abertasDe(p).length;
            const st = statusPedido(p);
            return (
              <ItemLista titulo={p.codigo} destaque={`${p.cidade} - ${p.uf}`} onPress={() => nav.navigate(p.status === 'rascunho' ? 'hospedagens.Formulario' : 'hospedagens.Pedido', { id: p.id })}
                linhas={[`${fmtCurta(p.data_inicio)} → ${fmtData(p.data_fim)} · ${diasEntre(p.data_inicio, p.data_fim)} diária(s)`, `${p.projeto || 'Sem projeto'} · ${p.hospedes.filter((h) => h.status !== 'cancelado').length} hóspede(s)`]}
                chips={<><Chip texto={st.texto} tom={st.tom} />{ajustes > 0 && <Chip texto={`${ajustes} ajuste(s) aguardando`} tom="marca" />}</>} />
            );
          }} />
      ) : aba === 'hospedes' ? (
        <ListaPlana dados={hospedes} chave={(x) => `${x.p.id}-${x.h.id}`} {...comum}
          vazio={<Vazio icone="people-outline" titulo="Nenhum hóspede" texto="Os hóspedes aparecem aqui depois que o pedido é enviado." />}
          renderizar={({ h, p }) => <CartaoHospede p={p} h={h} comPedido aoAjuste={setDlg} aoRetirar={retirar} ocupado={ocupado} />} />
      ) : (
        <ListaPlana dados={quartos} chave={(x) => String(x.q.id)} {...comum}
          vazio={<Vazio icone="bed-outline" titulo="Nenhum quarto reservado" texto="Os quartos aparecem aqui quando a central confirma a reserva." />}
          renderizar={({ q, p }) => <CartaoQuarto p={p} q={q} comPedido aoAjuste={setDlg} aoRetirar={retirar} ocupado={ocupado} />} />
      )}
      <BotaoFlutuante titulo="Nova viagem" onPress={() => nav.navigate('hospedagens.Formulario', {})} />
      {dlg && <AjusteFolha alvo={dlg} aoFechar={() => setDlg(null)} aoConcluir={() => { setDlg(null); void recarregar(); }} />}
    </Tela>
  );
}
