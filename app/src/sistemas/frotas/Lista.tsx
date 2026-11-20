import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../../api/cliente';
import { useTema } from '../../tema';
import { Aviso, Botao, Campo, CampoBusca, CampoData, CampoSelecao, Carregando, Cartao, Chip, Folha, ItemLista, Segmentos, Tela, Vazio, useAviso, useConfirmar } from '../../ui';
import { useAcao, useCarregar } from '../../util/carregar';
import { fmtData, fmtDataHora, hoje, somaDias } from '../../util/datas';
import { DIAS_MENSAL, TOM, diasAte, km, placaFmt, textoPrazo, tipoModalidade, tomPrazo, veic, type Chamado, type Config, type PedidoV, type Veiculo } from './tipos';

/** Devolução prevista: mensal = retirada + 30 dias; diária = a data informada. */
const devolucao = (p: { modalidade?: string | null; data_retirada?: string | null; data_prevista?: string | null }) =>
  (tipoModalidade(p.modalidade) === 'mensal' ? (p.data_retirada ? somaDias(p.data_retirada, DIAS_MENSAL) : '') : (p.data_prevista ?? ''));
const completo = (p: { data_retirada?: string | null; local?: string | null; categoria?: string | null; modalidade?: string | null; data_prevista?: string | null }) =>
  !!(p.data_retirada && p.local && p.categoria && p.modalidade && (tipoModalidade(p.modalidade) !== 'diaria' || p.data_prevista));

/** Modalidade + devolução (diária) ou prazo de 30 dias (mensal). */
function CamposModalidade({ cfg, v, aoMudar }: { cfg: Config; v: { modalidade?: string | null; data_retirada?: string | null; data_prevista?: string | null }; aoMudar: (k: 'modalidade' | 'data_prevista', x: string) => void }) {
  const tipo = tipoModalidade(v.modalidade);
  return (
    <>
      <CampoSelecao rotulo="Modalidade" valor={v.modalidade ?? ''} opcoes={cfg.modalidades.map((x) => ({ valor: x, rotulo: x }))} aoMudar={(x) => aoMudar('modalidade', x)} />
      {tipo === 'mensal'
        ? <Campo rotulo="Prazo limite" value={v.data_retirada ? fmtData(devolucao(v)) : 'Informe a data de retirada'} editable={false} dica={`Mensal: até ${DIAS_MENSAL} dias a partir da retirada.`} />
        : !!v.modalidade && <CampoData rotulo={`Data de devolução${tipo === 'diaria' ? '' : ' (opcional)'}`} valor={v.data_prevista ?? ''} minimo={v.data_retirada || hoje()} aoMudar={(x) => aoMudar('data_prevista', x)} />}
    </>
  );
}

/** Data limite do veículo com a contagem de dias (amarela e vermelha perto do fim; negativa quando venceu). */
function Prazo({ v }: { v: Veiculo }) {
  const t = useTema();
  if (!v.data_limite) return null;
  const n = v.status === 'em_uso' ? diasAte(v.data_limite) : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <Text style={{ color: t.suave, fontSize: 13 }}>Prazo limite: <Text style={{ color: t.texto, fontWeight: '700' }}>{fmtData(v.data_limite)}</Text></Text>
      {n !== null && <Chip texto={textoPrazo(n)} tom={tomPrazo(n)} />}
    </View>
  );
}

const M = '/api/m/frotas';
const EDITAVEL = (p: PedidoV) => ['rascunho', 'reprovado'].includes(p.status);
const TIPOS = { troca: 'Trocar veículo', substituicao: 'Substituir condutor', manutencao: 'Manutenção', encerramento: 'Encerrar contrato' } as const;
const ICONE = { troca: 'repeat', substituicao: 'person', manutencao: 'construct', encerramento: 'document-text' } as const;

// ------------------------------------------------------------------ pedidos de veículo
function Pedidos({ cfg }: { cfg: Config }) {
  const t = useTema();
  const avisar = useAviso();
  const confirmar = useConfirmar();
  const { executar, ocupado } = useAcao();
  const { dados, erro, atualizando, recarregar } = useCarregar(() => api<PedidoV[]>(`${M}/meus/pedidos`));
  useFocusEffect(useCallback(() => { void recarregar(); }, [recarregar]));
  const [filtro, setFiltro] = useState('');
  const [edit, setEdit] = useState<(PedidoV & { _dirty?: boolean }) | null>(null);
  const [nova, setNova] = useState(false);
  const VAZIO = { qtd: '1', data_retirada: '', local: '', categoria: '', motivo: '', motorista: '', modalidade: '', data_prevista: '' };
  const [n, setN] = useState(VAZIO);
  const [erroForm, setErroForm] = useState('');
  const todos = dados ?? [];
  const prontos = todos.filter((p) => p.status === 'rascunho' && p.completo).length;
  const reprovados = todos.filter((p) => p.status === 'reprovado').length;
  const lista = useMemo(() => todos.filter((p) => !filtro || (filtro === 'enviadas' ? ['solicitado', 'aprovado'].includes(p.status) : p.status === filtro)), [todos, filtro]);

  const rodar = async (fn: () => Promise<unknown>, ok: (r: any) => string) => { const r = await executar(fn); if (!r.ok) { avisar(r.erro, 'erro'); return false; } avisar(ok(r.valor)); void recarregar(); return true; };
  const enviarTudo = async () => {
    if (!await confirmar({ titulo: `Enviar ${prontos} solicitação(ões)?`, mensagem: 'Todos os rascunhos completos (data, local, categoria e modalidade) vão para a central aprovar.', confirmar: 'Enviar tudo' })) return;
    await rodar(() => api(`${M}/meus/pedidos/enviar-todos`, { metodo: 'POST', corpo: {} }), (r) => `${r.enviados} solicitação(ões) enviada(s)`);
  };
  const excluirReprovadas = async () => {
    if (!await confirmar({ titulo: 'Excluir reprovadas?', mensagem: `Você vai excluir ${reprovados} solicitação(ões) reprovada(s). Não pode ser desfeito.`, confirmar: 'Excluir', perigo: true })) return;
    await rodar(() => api(`${M}/meus/pedidos/reprovados`, { metodo: 'DELETE' }), (r) => `${r.excluidos} excluída(s)`);
  };
  const salvarEdicao = async (enviar: boolean) => {
    if (!edit) return;
    const corpo = { data_retirada: edit.data_retirada, local: edit.local, categoria: edit.categoria, motivo: edit.motivo, motorista: edit.motorista, modalidade: edit.modalidade, data_prevista: edit.data_prevista };
    if (await rodar(async () => { await api(`${M}/meus/pedidos/${edit.id}`, { metodo: 'PUT', corpo }); if (enviar) await api(`${M}/meus/pedidos/${edit.id}/enviar`, { metodo: 'POST', corpo: {} }); }, () => (enviar ? 'Solicitação enviada' : 'Linha salva'))) setEdit(null);
  };
  const excluir = async (p: PedidoV) => {
    if (!await confirmar({ titulo: `Excluir ${p.codigo}?`, mensagem: 'A linha será removida. Não pode ser desfeito.', confirmar: 'Excluir', perigo: true })) return;
    setEdit(null); await rodar(() => api(`${M}/meus/pedidos/${p.id}`, { metodo: 'DELETE' }), () => 'Linha excluída');
  };
  const criar = async (enviar: boolean) => {
    setErroForm('');
    const q = Number(n.qtd);
    if (!/^\d+$/.test(n.qtd) || q < 1 || q > 30) { setErroForm('Quantidade inválida: digite um número de 1 a 30.'); return; }
    const r = await executar(() => api<{ criados?: number; enviados?: number }>(`${M}/meus/pedidos`, { metodo: 'POST', corpo: { ...n, qtd: q, enviar } }));
    if (!r.ok) { setErroForm(r.erro); return; }
    avisar(enviar ? `${r.valor.enviados} pedido(s) enviado(s) para a central` : `${r.valor.criados} rascunho(s) criado(s)`); setNova(false); setN(VAZIO); void recarregar();
  };

  const chips = [['', 'Total'], ['rascunho', 'Rascunho'], ['enviadas', 'Enviadas'], ['reprovado', 'Reprovadas'], ['reservado', 'Reservados'], ['em_uso', 'Em uso'], ['encerrado', 'Encerrados']] as const;
  const conta = (k: string) => (k === '' ? todos.length : todos.filter((p) => (k === 'enviadas' ? ['solicitado', 'aprovado'].includes(p.status) : p.status === k)).length);
  return (
    <View>
      {!!erro && <Aviso texto={erro} />}
      <Botao titulo="Nova solicitação" icone="add" onPress={() => setNova(true)} estilo={{ marginBottom: 12 }} />
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <Botao titulo={`Enviar tudo${prontos ? ` (${prontos})` : ''}`} icone="send" pequeno onPress={enviarTudo} desabilitado={!prontos || ocupado} estilo={{ flex: 1 }} />
        <Botao titulo="Reprovadas" icone="trash-outline" variante="contorno" pequeno onPress={excluirReprovadas} desabilitado={!reprovados || ocupado} estilo={{ flex: 1 }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {chips.map(([k, r]) => <Botao key={k} titulo={`${r} ${conta(k)}`} variante={filtro === k ? 'principal' : 'suave'} pequeno onPress={() => setFiltro(k)} />)}
      </View>
      {dados === null && !erro ? <Carregando /> : !lista.length ? <Vazio icone="car-outline" titulo={todos.length ? 'Nenhum pedido neste filtro' : 'Nenhum pedido de veículo'} texto="Toque em “Nova” para solicitar." /> : lista.map((p) => (
        <ItemLista key={`${p.id}-${p.updated_at}`} titulo={p.codigo} destaque={fmtDataHora(p.created_at)} onPress={() => setEdit({ ...p })}
          linhas={[`Retirada ${fmtData(p.data_retirada)} · ${p.local ?? 'sem local'}`, `${p.categoria ?? 'sem categoria'}${p.motorista ? ` · ${p.motorista}` : ''}`,
            p.modalidade ? `${p.modalidade}${devolucao(p) ? ` · devolução ${fmtData(devolucao(p))}` : ''}` : 'Sem modalidade', p.motivo ?? '', p.status === 'reprovado' && p.resposta ? `Central: ${p.resposta}` : '']}
          chips={<Chip texto={p.status_label} tom={TOM[p.status]} />} />
      ))}

      <Folha aberto={!!edit} titulo={edit?.codigo ?? ''} aoFechar={() => setEdit(null)}
        rodape={edit && EDITAVEL(edit) ? <View style={{ flexDirection: 'row', gap: 10 }}><Botao titulo="Salvar" variante="contorno" onPress={() => salvarEdicao(false)} carregando={ocupado} estilo={{ flex: 1 }} /><Botao titulo="Enviar" icone="send" onPress={() => salvarEdicao(true)} desabilitado={!completo(edit)} carregando={ocupado} estilo={{ flex: 1 }} /></View> : undefined}>
        {edit && (
          <>
            <Chip texto={edit.status_label} tom={TOM[edit.status]} />
            {edit.status === 'reprovado' && !!edit.resposta && <View style={{ marginTop: 10 }}><Aviso texto={edit.resposta} /></View>}
            <View style={{ height: 12 }} />
            {EDITAVEL(edit) ? (
              <>
                <CampoData rotulo="Data de retirada" valor={edit.data_retirada ?? ''} minimo={hoje()} aoMudar={(v) => setEdit({ ...edit, data_retirada: v })} />
                <CampoSelecao rotulo="Local de retirada" valor={edit.local ?? ''} opcoes={cfg.locais.map((x) => ({ valor: x, rotulo: x }))} aoMudar={(v) => setEdit({ ...edit, local: v })} />
                <CampoSelecao rotulo="Categoria" valor={edit.categoria ?? ''} opcoes={cfg.categorias.map((x) => ({ valor: x, rotulo: x }))} aoMudar={(v) => setEdit({ ...edit, categoria: v })} />
                <CamposModalidade cfg={cfg} v={edit} aoMudar={(k, x) => setEdit({ ...edit, [k]: x })} />
                <Campo rotulo="Motivo" value={edit.motivo ?? ''} onChangeText={(v) => setEdit({ ...edit, motivo: v })} multilinha />
                <CampoBusca rotulo="Motorista" valor={edit.motorista ?? ''} opcoes={cfg.colaboradores} aoMudar={(v) => setEdit({ ...edit, motorista: v })} dica="Do banco de pessoas. Pode deixar em branco e informar depois." />
              </>
            ) : (
              <>
                <Text style={{ color: t.texto }}>Retirada {fmtData(edit.data_retirada)} · {edit.local}</Text>
                <Text style={{ color: t.suave }}>{edit.categoria}{edit.motorista ? ` · ${edit.motorista}` : ''}</Text>
                {!!edit.modalidade && <Text style={{ color: t.suave }}>{edit.modalidade}{devolucao(edit) ? ` · devolução ${fmtData(devolucao(edit))}` : ''}</Text>}
                {!!edit.motivo && <Text style={{ color: t.texto, marginTop: 8 }}>{edit.motivo}</Text>}
              </>
            )}
            {['rascunho', 'solicitado', 'reprovado'].includes(edit.status) && <Botao titulo="Excluir" icone="trash-outline" variante="perigo" onPress={() => excluir(edit)} estilo={{ marginTop: 14 }} />}
          </>
        )}
      </Folha>

      <Folha aberto={nova} titulo="Solicitação de veículos" aoFechar={() => setNova(false)}
        rodape={<View style={{ flexDirection: 'row', gap: 10 }}><Botao titulo="Rascunho" variante="contorno" onPress={() => criar(false)} carregando={ocupado} estilo={{ flex: 1 }} /><Botao titulo="Enviar" icone="send" onPress={() => criar(true)} carregando={ocupado} estilo={{ flex: 1 }} /></View>}>
        {!!erroForm && <Aviso texto={erroForm} />}
        <Campo rotulo="Quantidade de veículos" value={n.qtd} onChangeText={(v) => setN({ ...n, qtd: v.replace(/\D/g, '').slice(0, 2) })} keyboardType="number-pad" dica="De 1 a 30: cria uma linha por veículo." />
        <CampoData rotulo="Data de retirada" valor={n.data_retirada} minimo={hoje()} aoMudar={(v) => setN({ ...n, data_retirada: v })} />
        <CampoSelecao rotulo="Local de retirada" valor={n.local} opcoes={cfg.locais.map((x) => ({ valor: x, rotulo: x }))} aoMudar={(v) => setN({ ...n, local: v })} />
        <CampoSelecao rotulo="Categoria do veículo" valor={n.categoria} opcoes={cfg.categorias.map((x) => ({ valor: x, rotulo: x }))} aoMudar={(v) => setN({ ...n, categoria: v })} />
        <CamposModalidade cfg={cfg} v={n} aoMudar={(k, x) => setN({ ...n, [k]: x })} />
        <CampoBusca rotulo="Motorista" valor={n.motorista} opcoes={cfg.colaboradores} aoMudar={(v) => setN({ ...n, motorista: v })} dica="Do banco de pessoas. Pode deixar em branco e informar depois." />
        <Campo rotulo="Motivo da solicitação" value={n.motivo} onChangeText={(v) => setN({ ...n, motivo: v })} multilinha />
      </Folha>
    </View>
  );
}

// ------------------------------------------------------------------ meus veículos (ativos) e chamados
function Veiculos({ cfg }: { cfg: Config }) {
  const nav = useNavigation<any>();
  const t = useTema();
  const avisar = useAviso();
  const confirmar = useConfirmar();
  const { executar, ocupado } = useAcao();
  const vs = useCarregar(() => api<Veiculo[]>(`${M}/meus/veiculos`));
  const ch = useCarregar(() => api<Chamado[]>(`${M}/meus/chamados`));
  useFocusEffect(useCallback(() => { void vs.recarregar(); void ch.recarregar(); }, [vs.recarregar, ch.recarregar]));
  const [abrir, setAbrir] = useState<{ v: Veiculo; tipo: keyof typeof TIPOS } | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [fim, setFim] = useState<Veiculo | null>(null);
  const [hist, setHist] = useState(false);
  const [erro, setErro] = useState('');
  const lista = [...(vs.dados ?? []).filter((v) => v.status === 'em_uso'), ...(vs.dados ?? []).filter((v) => v.status === 'reservado')];
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const recarregarTudo = () => { void vs.recarregar(); void ch.recarregar(); };

  const enviarChamado = async () => {
    if (!abrir) return; setErro('');
    const r = await executar(() => api(`${M}/meus/veiculos/${abrir.v.id}/chamados`, { metodo: 'POST', corpo: { tipo: abrir.tipo, data_saida_condutor: hoje(), ...f } }));
    if (!r.ok) { setErro(r.erro); return; }
    avisar('Solicitação enviada para aprovação da central'); setAbrir(null); setF({}); recarregarTudo();
  };
  const cancelar = async (c: Chamado) => {
    if (!await confirmar({ titulo: 'Cancelar a solicitação?', mensagem: `O chamado de ${c.tipo_label.toLowerCase()} será cancelado.`, confirmar: 'Cancelar solicitação', cancelar: 'Voltar', perigo: true })) return;
    const r = await executar(() => api(`${M}/meus/chamados/${c.id}/cancelar`, { metodo: 'POST', corpo: {} }));
    if (!r.ok) avisar(r.erro, 'erro'); else { avisar('Solicitação cancelada'); setFim(null); recarregarTudo(); }
  };
  const finalizar = async () => {
    if (!fim?.chamado) return; setErro('');
    const r = await executar(() => api<{ resultado: string; aviso?: boolean }>(`${M}/meus/chamados/${fim.chamado!.id}/finalizar`, { metodo: 'POST', corpo: f }));
    if (!r.ok) { setErro(r.erro); return; }
    avisar(r.valor.resultado, r.valor.aviso ? 'erro' : 'ok'); setFim(null); setF({}); recarregarTudo();
  };
  const c = fim?.chamado;
  const naoPermitida = !!c && c.tipo === 'encerramento' && !!c.placa_devolucao && c.placa_devolucao !== fim?.placa;
  const abrirFinalizar = (v: Veiculo) => { const x = v.chamado!; setF({ km_devolucao: String(x.km_devolucao ?? ''), data_devolucao: x.data_servico || x.data_devolucao || hoje(), data_inicio: x.data_servico || hoje() }); setErro(''); setFim(v); };

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <Chip texto={`Veículos ativos ${lista.filter((v) => v.status === 'em_uso').length}`} tom="ok" />
        <Chip texto={`Com solicitação ${lista.filter((v) => v.chamado).length}`} tom="aviso" />
        <View style={{ flex: 1 }} />
        <Botao titulo="Meus chamados" icone="time-outline" variante="suave" pequeno onPress={() => setHist(true)} />
      </View>
      {vs.dados === null ? <Carregando /> : !lista.length ? <Vazio icone="car-sport-outline" titulo="Nenhum veículo em uso" texto="Os veículos dos seus pedidos aparecem aqui quando a central os ativa." /> : lista.map((v) => (
        <Cartao key={v.id} estilo={{ marginBottom: 12, borderColor: v.status === 'em_uso' && (diasAte(v.data_limite) ?? 99) <= 2 ? t.erro : v.chamado ? t.aviso : t.linha }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.texto, fontWeight: '900', fontSize: 22, letterSpacing: 1 }}>{v.placa || 'Sem placa'}</Text>
              <Text style={{ color: t.texto, fontWeight: '700' }}>{v.modelo || v.categoria}</Text>
              <Text style={{ color: t.suave, fontSize: 12.5 }}>Reserva {v.codigo_reserva} · {v.local} · {v.categoria}</Text>
            </View>
            <Chip texto={v.status_label} tom={TOM[v.status]} />
          </View>
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: t.suave, fontSize: 13 }}>Motorista: <Text style={{ color: t.texto }}>{v.motorista || '—'}</Text></Text>
            <Text style={{ color: t.suave, fontSize: 13 }}>Contrato desde {fmtData(v.inicio_contrato)} · retirada {fmtData(v.data_retirada)} · {km(v.km_retirada)} km</Text>
            <Text style={{ color: t.suave, fontSize: 13 }}>Fotos {v.fotos_angulos}/{v.fotos_total} (opcionais){v.modalidade ? ` · ${v.modalidade}` : ''}</Text>
            <Prazo v={v} />
          </View>
          {v.status === 'reservado' && <View style={{ marginTop: 10 }}><Aviso tipo="info" texto="Reservado: aguardando a central ativar o veículo com placa e motorista." /></View>}
          {v.chamado && <View style={{ marginTop: 10 }}><Aviso tipo="info" texto={`${v.chamado.tipo_label}: ${v.situacao ?? v.chamado.status_label}`} /></View>}
          {v.status === 'em_uso' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {(Object.keys(TIPOS) as (keyof typeof TIPOS)[]).map((k) => <Botao key={k} titulo={TIPOS[k]} icone={ICONE[k]} variante="suave" pequeno desabilitado={!!v.chamado} onPress={() => { setF({}); setErro(''); setAbrir({ v, tipo: k }); }} />)}
              <Botao titulo="Fotos" icone="camera" variante="contorno" pequeno onPress={() => nav.navigate('frotas.Fotos', { veiculo: v })} />
              {v.chamado && ['agendado', 'reprovado'].includes(v.chamado.status) && <Botao titulo="Finalizar" icone="checkmark-circle" pequeno onPress={() => abrirFinalizar(v)} />}
              {v.chamado?.status === 'pendente' && <Botao titulo="Cancelar pedido" icone="close" variante="perigo" pequeno onPress={() => cancelar(v.chamado!)} />}
            </View>
          )}
        </Cartao>
      ))}

      <Folha aberto={!!abrir} titulo={abrir ? { manutencao: 'Solicitar manutenção', troca: 'Solicitar troca de veículo', substituicao: 'Substituir condutor', encerramento: 'Encerrar contrato' }[abrir.tipo] : ''} aoFechar={() => setAbrir(null)} rodape={<Botao titulo="Enviar" icone="send" onPress={enviarChamado} carregando={ocupado} />}>
        {abrir && (
          <>
            <Text style={{ color: t.suave, fontSize: 13, marginBottom: 10 }}>{veic(abrir.v)} · motorista {abrir.v.motorista || '—'}</Text>
            {!!erro && <Aviso texto={erro} />}
            {abrir.tipo === 'manutencao' && <CampoSelecao rotulo="Tipo de manutenção" valor={f.tipo_manutencao ?? ''} opcoes={cfg.tipos_manutencao.map((x) => ({ valor: x, rotulo: x }))} aoMudar={(v) => set('tipo_manutencao', v)} />}
            {abrir.tipo === 'troca' && (<><CampoData rotulo="Data desejada" valor={f.data_inicio_nova ?? ''} aoMudar={(v) => set('data_inicio_nova', v)} /><Campo rotulo="Onde fazer a troca" value={f.local_servico ?? ''} onChangeText={(v) => set('local_servico', v)} placeholder="Cidade / agência" /></>)}
            {abrir.tipo === 'substituicao' && (<>
              <CampoBusca rotulo="Novo condutor" valor={f.condutor_novo ?? ''} opcoes={cfg.colaboradores} aoMudar={(v) => set('condutor_novo', v)} />
              <CampoData rotulo="Saída do condutor atual" valor={f.data_saida_condutor ?? hoje()} aoMudar={(v) => set('data_saida_condutor', v)} />
              <CampoData rotulo="Início do novo condutor" valor={f.data_inicio_nova ?? ''} aoMudar={(v) => set('data_inicio_nova', v)} />
            </>)}
            {abrir.tipo === 'encerramento' && (<>
              <Campo rotulo="Km de devolução" value={f.km_devolucao ?? ''} onChangeText={(v) => set('km_devolucao', v.replace(/\D/g, ''))} keyboardType="number-pad" dica={`Retirada com ${km(abrir.v.km_retirada)} km`} />
              <CampoData rotulo="Data prevista de devolução" valor={f.data_devolucao ?? ''} aoMudar={(v) => set('data_devolucao', v)} />
            </>)}
            <Campo rotulo={abrir.tipo === 'manutencao' ? 'Descreva o problema' : 'Motivo'} value={f.motivo ?? ''} onChangeText={(v) => set('motivo', v)} multilinha />
          </>
        )}
      </Folha>

      <Folha aberto={!!fim} titulo={c?.status === 'reprovado' ? 'Chamado reprovado' : { manutencao: 'Finalizar manutenção', troca: 'Registrar a troca de veículo', substituicao: 'Confirmar substituição de condutor', encerramento: naoPermitida ? 'Devolução não permitida!' : 'Confirmar devolução do veículo' }[c?.tipo ?? 'manutencao']} aoFechar={() => setFim(null)}
        rodape={fim && c ? <View style={{ flexDirection: 'row', gap: 10 }}>
          {c.status === 'agendado' && c.tipo === 'substituicao' && <Botao titulo="Cancelar" variante="perigo" onPress={() => cancelar(c)} estilo={{ flex: 1 }} />}
          <Botao titulo={c.status === 'reprovado' ? 'Ciente' : naoPermitida ? 'Encerrar chamado' : c.tipo === 'encerramento' ? 'Confirmar devolução' : c.tipo === 'troca' ? 'Confirmar troca' : 'Finalizar'} onPress={finalizar} carregando={ocupado} variante={naoPermitida ? 'perigo' : 'principal'} estilo={{ flex: 1.4 }} />
        </View> : undefined}>
        {fim && c && (
          <>
            {!!erro && <Aviso texto={erro} />}
            <Text style={{ color: t.suave, fontSize: 13, marginBottom: 10 }}>{veic(fim)} · {c.codigo}</Text>
            {c.status === 'reprovado' && <Text style={{ color: t.texto, marginBottom: 8 }}>A central reprovou o pedido de {c.tipo_label.toLowerCase()}.{c.resposta ? `\nMotivo: ${c.resposta}` : ''}</Text>}
            {c.status === 'agendado' && c.tipo === 'manutencao' && <Text style={{ color: t.texto }}>Manutenção ({c.tipo_manutencao}) agendada em {c.local_servico} no dia {fmtData(c.data_servico)}{c.hora_servico ? ` às ${c.hora_servico}` : ''}. Confirme que o serviço foi feito.</Text>}
            {c.status === 'agendado' && c.tipo === 'substituicao' && <Text style={{ color: t.texto }}>Novo condutor: {c.condutor_novo}, a partir de {fmtData(c.data_inicio_nova)}. {fim.motorista} sai em {fmtData(c.data_saida_condutor)}. Faça a passagem do veículo e confirme.</Text>}
            {c.status === 'agendado' && c.tipo === 'encerramento' && (naoPermitida
              ? <Aviso texto={`Por motivos administrativos devolva o outro veículo. Placa indicada para devolução: ${c.placa_devolucao}. Este chamado será encerrado.`} />
              : (<>
                <Text style={{ color: t.texto, marginBottom: 12 }}>Local de devolução: {c.local_servico} · {fmtData(c.data_servico)}</Text>
                <Campo rotulo="Km de devolução" value={f.km_devolucao ?? ''} onChangeText={(v) => set('km_devolucao', v.replace(/\D/g, ''))} keyboardType="number-pad" dica={`Retirada com ${km(fim.km_retirada)} km`} />
                <CampoData rotulo="Data da devolução" valor={f.data_devolucao ?? ''} aoMudar={(v) => set('data_devolucao', v)} />
              </>))}
            {c.status === 'agendado' && c.tipo === 'troca' && (<>
              <Text style={{ color: t.texto, marginBottom: 10 }}>Troca agendada em {c.local_servico} · {fmtData(c.data_servico)}. Informe os dados do veículo devolvido e do novo.</Text>
              <Campo rotulo="Km de devolução" value={f.km_devolucao ?? ''} onChangeText={(v) => set('km_devolucao', v.replace(/\D/g, ''))} keyboardType="number-pad" />
              <CampoData rotulo="Data de devolução" valor={f.data_devolucao ?? ''} aoMudar={(v) => set('data_devolucao', v)} />
              <Campo rotulo="Nova placa" value={f.placa_nova ?? ''} onChangeText={(v) => set('placa_nova', placaFmt(v))} autoCapitalize="characters" placeholder="ABC-1234" />
              <Campo rotulo="Modelo novo" value={f.modelo_novo ?? ''} onChangeText={(v) => set('modelo_novo', v)} />
              <CampoData rotulo="Data de início" valor={f.data_inicio ?? ''} aoMudar={(v) => set('data_inicio', v)} />
              <Campo rotulo="Km inicial" value={f.km_inicial ?? ''} onChangeText={(v) => set('km_inicial', v.replace(/\D/g, ''))} keyboardType="number-pad" />
            </>)}
          </>
        )}
      </Folha>

      <Folha aberto={hist} titulo="Meus chamados" aoFechar={() => setHist(false)}>
        {!(ch.dados ?? []).length ? <Vazio titulo="Nenhum chamado ainda" /> : (ch.dados ?? []).map((x) => (
          <View key={x.id} style={{ paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: t.linha }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: t.texto, fontWeight: '800' }}>{x.codigo} · {x.tipo_label}</Text><Chip texto={x.status_label} tom={TOM[x.status]} /></View>
            <Text style={{ color: t.suave, fontSize: 13 }}>{[x.modelo, x.placa].filter(Boolean).join(' · ')} · {fmtDataHora(x.created_at)}</Text>
            {!!(x.resultado || x.resposta) && <Text style={{ color: t.texto, fontSize: 13.5, marginTop: 2 }}>{x.resultado || x.resposta}</Text>}
          </View>
        ))}
      </Folha>
    </View>
  );
}

export function Lista() {
  const nav = useNavigation<any>();
  const [aba, setAba] = useState<'pedidos' | 'veiculos'>('pedidos');
  const cfg = useCarregar(() => api<Config>(`${M}/config`));
  return (
    <Tela titulo="Frotas" subtitulo="Pedidos de veículo e chamados" aoVoltar={() => nav.goBack()}>
      <Segmentos valor={aba} aoMudar={setAba} opcoes={[{ valor: 'pedidos', rotulo: 'Pedidos' }, { valor: 'veiculos', rotulo: 'Meus veículos' }]} />
      {!cfg.dados ? (cfg.erro ? <Aviso texto={cfg.erro} /> : <Carregando />) : aba === 'pedidos' ? <Pedidos cfg={cfg.dados} /> : <Veiculos cfg={cfg.dados} />}
    </Tela>
  );
}