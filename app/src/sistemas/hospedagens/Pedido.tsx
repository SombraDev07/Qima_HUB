import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../../api/cliente';
import { useTema } from '../../tema';
import { Aviso, Botao, Campo, CampoData, Cartao, Carregando, Chip, Folha, Secao, Tela, useAviso, useConfirmar } from '../../ui';
import { useAcao, useCarregar } from '../../util/carregar';
import { diasEntre, fmtData, somaDias } from '../../util/datas';
import {
  ROTULO_AJUSTE, abertasDe, ajusteDoHospede, ajusteDoQuarto, pedidoAtivo, quartoDe, statusHospede, statusPedido, statusQuarto,
  type Ajuste, type Hospede, type Pedido, type Quarto, type TipoAjuste,
} from './tipos';

const M = '/api/m/hospedagens';
type TipoHospede = Exclude<TipoAjuste, 'cancelar_pedido'>;
export type AlvoAjuste = { pedido: Pedido; tipo: TipoHospede; hospede?: Hospede; quarto?: Quarto };

// ------------------------------------------------------------------ pedido de ajuste (de um hóspede ou do quarto inteiro)
export function AjusteFolha({ alvo, aoFechar, aoConcluir }: { alvo: AlvoAjuste; aoFechar: () => void; aoConcluir: () => void }) {
  const t = useTema();
  const avisar = useAviso();
  const { executar, ocupado } = useAcao();
  const { pedido, tipo, hospede, quarto: quartoAlvo } = alvo;
  const quarto = quartoAlvo ?? pedido.quartos.find((q) => q.id === hospede?.quarto_id);
  const [data, setData] = useState(tipo === 'prorrogar' ? somaDias(quarto?.data_out ?? pedido.data_fim, 1) : (quarto?.data_out ?? pedido.data_fim));
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const nomes = quartoAlvo ? quartoAlvo.ocupantes.map((o) => o.nome).join(', ') : '';
  const textos: Record<TipoHospede, string> = quartoAlvo ? {
    cancelar: `Cancelar o quarto ${quartoAlvo.codigo}? A central vai cancelar a hospedagem de todos: ${nomes}.`,
    prorrogar: `Até quando o quarto ${quartoAlvo.codigo} (${nomes}) precisa ficar?`,
    checkout: `Em que data todos do quarto ${quartoAlvo.codigo} (${nomes}) saem do hotel?`,
    editar: `O que precisa mudar no quarto ${quartoAlvo.codigo}?`,
  } : {
    cancelar: `Cancelar a hospedagem de ${hospede?.nome}? A central vai retirar a pessoa do quarto.`,
    prorrogar: `Até quando ${hospede?.nome} precisa ficar?`,
    checkout: `Em que data ${hospede?.nome} sai do hotel?`,
    editar: `O que precisa mudar para ${hospede?.nome}? (nome, datas, quarto…)`,
  };
  const enviar = async () => {
    setErro('');
    if (tipo === 'editar' && !obs.trim()) { setErro('Descreva o que precisa mudar.'); return; }
    const corpo = { ...(quartoAlvo ? { quarto_id: quartoAlvo.id } : { hospede_id: hospede!.id }), tipo, data, obs };
    const r = await executar(() => api(`${M}/meus/${pedido.id}/solicitacoes`, { metodo: 'POST', corpo }));
    if (!r.ok) { setErro(r.erro); return; }
    avisar('Ajuste enviado à central. Nada muda até ela confirmar.');
    aoConcluir();
  };
  return (
    <Folha aberto titulo={`${ROTULO_AJUSTE[tipo]} · ${quartoAlvo ? `quarto ${quartoAlvo.codigo}` : hospede?.nome}`} aoFechar={aoFechar} rodape={<Botao titulo="Enviar à central" onPress={enviar} carregando={ocupado} />}>
      {!!erro && <Aviso texto={erro} />}
      <Text style={{ color: t.texto, fontSize: 15.5, lineHeight: 22, marginBottom: 6 }}>{textos[tipo]}</Text>
      {quarto && <Text style={{ color: t.suave, fontSize: 13, marginBottom: 12 }}>Hoje: {quarto.codigo} · {quarto.hotel_nome || 'hotel a definir'} · {fmtData(quarto.data_in)} → {fmtData(quarto.data_out)}</Text>}
      {(tipo === 'prorrogar' || tipo === 'checkout') && (
        <CampoData rotulo={tipo === 'prorrogar' ? 'Novo check-out' : 'Data do check-out'} valor={data} aoMudar={setData} minimo={quarto?.data_in} maximo={tipo === 'checkout' ? quarto?.data_out : undefined} />
      )}
      <Campo rotulo={tipo === 'editar' ? 'Descrição' : 'Observação (opcional)'} value={obs} onChangeText={setObs} multilinha />
    </Folha>
  );
}

/** Botões de ajuste (ou o aviso de ajuste já enviado, com "retirar"). */
export function Acoes({ pode, ajuste, temQuarto, aoAjuste, aoRetirar, ocupado }: {
  pode: boolean; ajuste?: Ajuste; temQuarto: boolean; aoAjuste: (tipo: TipoHospede) => void; aoRetirar: (a: Ajuste) => void; ocupado: boolean;
}) {
  if (ajuste) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <Chip texto={`${ROTULO_AJUSTE[ajuste.tipo]} enviado`} tom="marca" />
        <Botao titulo="Retirar" variante="suave" pequeno onPress={() => aoRetirar(ajuste)} desabilitado={ocupado} />
      </View>
    );
  }
  if (!pode) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      {temQuarto && <Botao titulo="Prorrogar" icone="calendar-outline" variante="suave" pequeno onPress={() => aoAjuste('prorrogar')} />}
      {temQuarto && <Botao titulo="Check-out" icone="log-out-outline" variante="suave" pequeno onPress={() => aoAjuste('checkout')} />}
      <Botao titulo="Editar" icone="create-outline" variante="suave" pequeno onPress={() => aoAjuste('editar')} />
      <Botao titulo="Cancelar" icone="close-outline" variante="perigo" pequeno onPress={() => aoAjuste('cancelar')} />
    </View>
  );
}

/** Cartão de um hóspede com o status pelas datas e os ajustes. */
export function CartaoHospede({ p, h, aoAjuste, aoRetirar, ocupado, comPedido = false }: {
  p: Pedido; h: Hospede; aoAjuste: (a: AlvoAjuste) => void; aoRetirar: (a: Ajuste) => void; ocupado: boolean; comPedido?: boolean;
}) {
  const t = useTema();
  const q = quartoDe(p, h);
  const visivel = !!q?.enviado;
  const st = statusHospede(h, q, p);
  return (
    <Cartao estilo={{ marginBottom: 10, ...(h.demitido ? { borderColor: t.erro, borderWidth: 2 } : {}) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: t.texto, fontSize: 16.5, fontWeight: '800', flex: 1 }}>{h.nome}</Text>
        <Chip texto={st.texto} tom={st.tom} />
      </View>
      {h.tipo === 'open' && <Text style={{ color: t.suave, fontSize: 13 }}>vaga Open</Text>}
      {h.demitido && <Text style={{ color: t.erro, fontSize: 13, fontWeight: '700' }}>Demitido(a) na Contratação</Text>}
      {comPedido && <Text style={{ color: t.suave, marginTop: 4 }}>{p.codigo} · {p.cidade} - {p.uf}</Text>}
      <Text style={{ color: t.suave, marginTop: 6 }}>{visivel && q ? `${q.codigo} · ${q.tipo} · ${q.hotel_nome}` : 'Aguardando a central'}</Text>
      <Text style={{ color: t.suave }}>{fmtData(visivel && q ? q.data_in : p.data_inicio)} → {fmtData(visivel && q ? q.data_out : p.data_fim)}</Text>
      <Acoes pode={pedidoAtivo(p) && h.status === 'ativo'} ajuste={ajusteDoHospede(p, h, q)} temQuarto={!!h.quarto_id} ocupado={ocupado}
        aoAjuste={(tipo) => aoAjuste({ pedido: p, hospede: h, tipo })} aoRetirar={aoRetirar} />
    </Cartao>
  );
}

/** Cartão de um quarto reservado: o ajuste vale para todos os hóspedes dele. */
export function CartaoQuarto({ p, q, aoAjuste, aoRetirar, ocupado, comPedido = false }: {
  p: Pedido; q: Quarto; aoAjuste: (a: AlvoAjuste) => void; aoRetirar: (a: Ajuste) => void; ocupado: boolean; comPedido?: boolean;
}) {
  const t = useTema();
  const st = statusQuarto(q, p);
  return (
    <Cartao estilo={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: t.texto, fontWeight: '800', fontSize: 16, flex: 1 }}>{q.codigo} · {q.tipo}</Text>
        <Chip texto={st.texto} tom={st.tom} />
      </View>
      {comPedido && <Text style={{ color: t.suave, marginTop: 4 }}>{p.codigo} · {p.cidade} - {p.uf}</Text>}
      <Text style={{ color: t.texto, marginTop: 6 }}>{q.hotel_nome}</Text>
      <Text style={{ color: t.suave, fontSize: 13.5 }}>{[q.hotel_endereco, q.hotel_telefone].filter(Boolean).join(' · ')}</Text>
      <Text style={{ color: t.texto, marginTop: 8 }}>{fmtData(q.data_in)} → {fmtData(q.data_out)} · {q.dias} diária(s)</Text>
      <Text style={{ color: t.suave, fontSize: 13.5 }}>{q.ocupantes.map((o) => o.nome).join(', ') || 'Sem hóspedes'}</Text>
      <Acoes pode={pedidoAtivo(p) && q.situacao !== 'finalizado' && q.ocupantes.length > 0} ajuste={q.situacao !== 'finalizado' ? ajusteDoQuarto(p, q) : undefined} temQuarto ocupado={ocupado}
        aoAjuste={(tipo) => aoAjuste({ pedido: p, quarto: q, tipo })} aoRetirar={aoRetirar} />
    </Cartao>
  );
}

/** Retirar um pedido de ajuste ainda não tratado pela central. */
export function useRetirar(aoConcluir: () => void) {
  const avisar = useAviso();
  const { executar, ocupado } = useAcao();
  const retirar = async (a: Ajuste) => {
    const r = await executar(() => api(`${M}/meus/solicitacoes/${a.id}`, { metodo: 'DELETE' }));
    if (!r.ok) { avisar(r.erro, 'erro'); return; }
    avisar('Pedido de ajuste retirado'); aoConcluir();
  };
  return { retirar, ocupado };
}

// ------------------------------------------------------------------ detalhe do pedido
export function Pedido_() {
  const nav = useNavigation<any>();
  const t = useTema();
  const id = (useRoute().params as { id: number }).id;
  const avisar = useAviso();
  const confirmar = useConfirmar();
  const { executar, ocupado } = useAcao();
  const { dados: p, erro, atualizando, recarregar } = useCarregar(() => api<Pedido>(`${M}/pedidos/${id}`), [id]);
  const [dlg, setDlg] = useState<AlvoAjuste | null>(null);
  const { retirar, ocupado: retirando } = useRetirar(() => void recarregar());
  useFocusEffect(useCallback(() => { void recarregar(); }, [recarregar]));

  if (erro && !p) return <Tela titulo="Pedido" aoVoltar={() => nav.goBack()}><Aviso texto={erro} /></Tela>;
  if (!p) return <Tela titulo="Pedido" aoVoltar={() => nav.goBack()}><Carregando /></Tela>;

  const abertas = abertasDe(p);
  const respondidas = p.solicitacoes.filter((s) => s.status === 'recusada' && s.resposta);
  const podeEditar = ['pendente', 'ajustado', 'rascunho'].includes(p.status) && !p.quartos.length;
  const ativo = pedidoAtivo(p);
  const pedidoCancel = abertas.some((s) => s.tipo === 'cancelar_pedido');
  const reservas = p.quartos.filter((q) => q.enviado);
  const st = statusPedido(p);

  const cancelarPedido = async () => {
    const semQuarto = !p.quartos.some((q) => q.enviado);
    const ok = await confirmar(semQuarto
      ? { titulo: `Cancelar o pedido ${p.codigo}?`, mensagem: 'Nenhum quarto foi reservado ainda, então o cancelamento é imediato.', confirmar: 'Cancelar pedido', perigo: true }
      : { titulo: `Pedir o cancelamento de ${p.codigo}?`, mensagem: 'Já existem quartos reservados. A central vai analisar o pedido de cancelamento.', confirmar: 'Pedir cancelamento', perigo: true });
    if (!ok) return;
    const r = await executar(() => api<{ direto: boolean }>(`${M}/meus/${p.id}/cancelar`, { metodo: 'POST', corpo: {} }));
    if (!r.ok) { avisar(r.erro, 'erro'); return; }
    avisar(r.valor.direto ? 'Pedido cancelado' : 'Pedido de cancelamento enviado à central'); void recarregar();
  };

  return (
    <Tela titulo={p.codigo} subtitulo={`${p.cidade} - ${p.uf}`} aoVoltar={() => nav.goBack()} aoAtualizar={recarregar} atualizando={atualizando}>
      {!!erro && <Aviso texto={erro} />}
      {p.status === 'finalizado' && <Aviso tipo="ok" texto="Pedido finalizado pela central. Não dá mais para prorrogar, fazer check-out ou cancelar." />}
      <Cartao>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Chip texto={st.texto} tom={st.tom} />
          <Text style={{ color: t.suave, fontSize: 13 }}>{diasEntre(p.data_inicio, p.data_fim)} diária(s)</Text>
        </View>
        <Text style={{ color: t.texto, fontSize: 18, fontWeight: '800', marginTop: 12 }}>{fmtData(p.data_inicio)} → {fmtData(p.data_fim)}</Text>
        <Text style={{ color: t.suave, marginTop: 4 }}>{p.projeto || 'Sem projeto'}{p.garagem && p.garagem !== 'sem' ? ` · garagem ${p.garagem}` : ''}</Text>
        {!!p.obs && <Text style={{ color: t.texto, marginTop: 10 }}>{p.obs}</Text>}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          {podeEditar && <Botao titulo="Editar" icone="create-outline" variante="contorno" pequeno onPress={() => nav.navigate('hospedagens.Formulario', { id: p.id })} estilo={{ flex: 1 }} />}
          {ativo && !pedidoCancel && <Botao titulo="Cancelar pedido" icone="close-circle-outline" variante="perigo" pequeno onPress={cancelarPedido} desabilitado={ocupado} estilo={{ flex: 1 }} />}
        </View>
      </Cartao>

      {abertas.length > 0 && (
        <>
          <Secao titulo="Aguardando a central" />
          <Cartao estilo={{ borderColor: t.aviso }}>
            {abertas.map((s) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ flex: 1, color: t.texto, fontSize: 14.5 }}>
                  <Text style={{ fontWeight: '800' }}>{ROTULO_AJUSTE[s.tipo]}</Text>
                  {s.hospede_nome ? ` · ${s.hospede_nome}` : s.quarto_codigo ? ` · quarto ${s.quarto_codigo}` : ''}{s.data ? ` · ${fmtData(s.data)}` : ''}{s.obs ? ` · “${s.obs}”` : ''}
                </Text>
                <Botao titulo="Retirar" variante="suave" pequeno onPress={() => retirar(s)} desabilitado={retirando} />
              </View>
            ))}
          </Cartao>
        </>
      )}
      {respondidas.map((s) => <View key={s.id} style={{ marginTop: 10 }}><Aviso tipo="info" texto={`Ajuste “${ROTULO_AJUSTE[s.tipo]}”${s.hospede_nome ? ` de ${s.hospede_nome}` : s.quarto_codigo ? ` do quarto ${s.quarto_codigo}` : ''} não aprovado: ${s.resposta}`} /></View>)}

      <Secao titulo={`Hóspedes (${p.hospedes.length})`} />
      {p.hospedes.map((h) => <CartaoHospede key={h.id} p={p} h={h} aoAjuste={setDlg} aoRetirar={retirar} ocupado={retirando} />)}

      {reservas.length > 0 && (
        <>
          <Secao titulo={`Quartos (${reservas.length})`} />
          {reservas.map((q) => <CartaoQuarto key={q.id} p={p} q={q} aoAjuste={setDlg} aoRetirar={retirar} ocupado={retirando} />)}
        </>
      )}

      {dlg && <AjusteFolha alvo={dlg} aoFechar={() => setDlg(null)} aoConcluir={() => { setDlg(null); void recarregar(); }} />}
    </Tela>
  );
}
