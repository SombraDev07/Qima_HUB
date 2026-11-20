import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../../api/cliente';
import { useTema } from '../../tema';
import { Aviso, Botao, BotaoFlutuante, Campo, CampoData, CampoSelecao, Carregando, Chip, Folha, ItemLista, ListaPlana, Segmentos, Tela, Vazio, useAviso, useConfirmar } from '../../ui';
import { useAcao, useCarregar } from '../../util/carregar';
import { fmtData, norm } from '../../util/datas';
import { TOM, opcoesProjeto, resumoItens, type Config, type Equip, type Solicitacao } from './tipos';

const M = '/api/m/equipamentos';
type Grupo = { k: string; nome: string; projeto?: string | null; superior?: string | null; base: string; eqs: Equip[] };

export function Lista() {
  const nav = useNavigation<any>();
  const t = useTema();
  const avisar = useAviso();
  const confirmar = useConfirmar();
  const { executar, ocupado } = useAcao();
  const sol = useCarregar(() => api<Solicitacao[]>(`${M}/minhas`));
  const resp = useCarregar(() => api<Equip[]>(`${M}/responsaveis`));
  const cfg = useCarregar(() => api<Config>(`${M}/config`));
  const [aba, setAba] = useState<'sol' | 'resp'>('sol');
  const [busca, setBusca] = useState('');
  const [item, setItem] = useState<Solicitacao | null>(null);
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [subst, setSubst] = useState<{ ids: number[]; nome: string; projeto: string; superior: string; fim: string } | null>(null);
  const [colab, setColab] = useState<{ id: number; nome: string } | null>(null);
  const [erro, setErro] = useState('');
  useFocusEffect(useCallback(() => { void sol.recarregar(); void resp.recarregar(); }, [sol.recarregar, resp.recarregar]));

  const rascunhos = (sol.dados ?? []).filter((s) => s.status === 'rascunho');
  const lista = useMemo(() => (sol.dados ?? []).filter((s) => !busca || norm(`${s.codigo} ${s.projeto} ${s.base} ${s.colaborador ?? ''}`).includes(norm(busca))), [sol.dados, busca]);
  const grupos = useMemo(() => {
    const m = new Map<string, Grupo>();
    for (const e of resp.dados ?? []) {
      const k = e.colaborador ? `p:${e.colaborador}` : `e:${e.id}`;
      if (!m.has(k)) m.set(k, { k, nome: e.colaborador ?? '', projeto: e.projeto, superior: e.superior, base: e.base, eqs: [] });
      m.get(k)!.eqs.push(e);
    }
    return [...m.values()].filter((g) => !busca || norm(`${g.nome} ${g.eqs.map((e) => e.patrimonio).join(' ')}`).includes(norm(busca)));
  }, [resp.dados, busca]);

  const rodar = async (fn: () => Promise<unknown>, ok: string) => {
    setErro('');
    const r = await executar(fn);
    if (!r.ok) { avisar(r.erro, 'erro'); return false; }
    avisar(ok); void sol.recarregar(); void resp.recarregar(); return true;
  };
  const enviar = async () => {
    if (!await confirmar({ titulo: `Enviar ${rascunhos.length} solicitação(ões)?`, mensagem: 'Elas seguem para o Administrativo, que reserva os equipamentos.', confirmar: 'Enviar' })) return;
    await rodar(() => api(`${M}/solicitacoes/enviar`, { metodo: 'POST', corpo: {} }), 'Enviado ao Administrativo');
  };
  const excluir = async (s: Solicitacao) => {
    if (!await confirmar({ titulo: `Excluir ${s.codigo}?`, mensagem: 'O rascunho será apagado.', confirmar: 'Excluir', perigo: true })) return;
    setItem(null); await rodar(() => api(`${M}/solicitacoes/${s.id}/excluir`, { metodo: 'POST', corpo: {} }), 'Rascunho excluído');
  };
  const devolverSol = async (s: Solicitacao) => {
    if (!await confirmar({ titulo: `Pedir devolução de ${s.codigo}?`, mensagem: 'O Administrativo é avisado e confirma quando os equipamentos voltarem.', confirmar: 'Pedir devolução' })) return;
    setItem(null); await rodar(() => api(`${M}/solicitacoes/devolver`, { metodo: 'POST', corpo: { ids: [s.id] } }), 'Devolução solicitada');
  };
  const devolverGrupo = async (g: Grupo) => {
    if (!await confirmar({ titulo: 'Solicitar devolução?', mensagem: 'O Administrativo é avisado e confirma quando os equipamentos voltarem.', confirmar: 'Pedir devolução' })) return;
    setGrupo(null); await rodar(() => api(`${M}/responsaveis/devolver`, { metodo: 'POST', corpo: { ids: g.eqs.map((e) => e.id) } }), 'Devolução solicitada');
  };

  const cabecalho = (
    <>
      {!!erro && <Aviso texto={erro} />}
      <Segmentos valor={aba} aoMudar={setAba} opcoes={[{ valor: 'sol', rotulo: 'Solicitações', qtd: sol.dados?.length }, { valor: 'resp', rotulo: 'Responsáveis', qtd: grupos.length }]} />
      {aba === 'sol' && rascunhos.length > 0 && <Botao titulo={`Enviar ${rascunhos.length} rascunho(s)`} icone="send" onPress={enviar} carregando={ocupado} estilo={{ marginBottom: 14 }} />}
      <Campo rotulo="Buscar" value={busca} onChangeText={setBusca} placeholder={aba === 'sol' ? 'Código, projeto, base ou colaborador' : 'Responsável ou patrimônio'} />
    </>
  );

  return (
    <Tela titulo="Equipamentos" subtitulo="Operação" aoVoltar={() => nav.goBack()} semRolagem>
      {(aba === 'sol' ? sol.dados === null : resp.dados === null) && !sol.erro ? <Carregando /> : aba === 'sol' ? (
        <ListaPlana dados={lista} chave={(s) => String(s.id)} cabecalho={cabecalho} aoAtualizar={sol.recarregar} atualizando={sol.atualizando}
          vazio={<Vazio icone="laptop-outline" titulo="Nenhuma solicitação" texto="Toque em “Nova” para pedir equipamentos." />}
          renderizar={(s) => (
            <ItemLista titulo={s.codigo} destaque={s.projeto} onPress={() => setItem(s)}
              linhas={[resumoItens(s), `${s.base} · retirada ${fmtData(s.retirada)}`, s.colaborador ? `Colaborador: ${s.colaborador}` : '']}
              chips={<Chip texto={s.status_label} tom={TOM[s.status]} />} />
          )} />
      ) : (
        <ListaPlana dados={grupos} chave={(g) => g.k} cabecalho={cabecalho} aoAtualizar={resp.recarregar} atualizando={resp.atualizando}
          vazio={<Vazio icone="people-outline" titulo="Nenhum responsável" texto="Aqui aparecem os equipamentos que saíram dos seus pedidos." />}
          renderizar={(g) => {
            const pend = g.eqs.some((e) => e.status === 'devolucao_pendente');
            return (
              <ItemLista titulo={g.nome || 'Sem usuário'} destaque={g.base} onPress={() => setGrupo(g)}
                linhas={g.eqs.map((e) => `${e.modelo} (${e.patrimonio})`).concat([g.projeto ? `Projeto ${g.projeto}` : ''])}
                chips={<Chip texto={pend ? 'Devolução pendente' : 'Em uso'} tom={pend ? 'aviso' : 'ok'} />} />
            );
          }} />
      )}
      {aba === 'sol' && <BotaoFlutuante titulo="Nova" onPress={() => nav.navigate('equipamentos.Formulario', {})} />}

      <Folha aberto={!!item} titulo={item?.codigo ?? ''} aoFechar={() => setItem(null)}>
        {item && (
          <>
            <Chip texto={item.status_label} tom={TOM[item.status]} />
            <Text style={{ color: t.texto, fontSize: 16, marginTop: 10 }}>{resumoItens(item)}</Text>
            <Text style={{ color: t.suave, marginTop: 4 }}>{item.projeto} · {item.base}</Text>
            <Text style={{ color: t.suave }}>Retirada {fmtData(item.retirada)} · devolução {fmtData(item.devolucao)}</Text>
            {!!item.colaborador && <Text style={{ color: t.suave }}>Colaborador: {item.colaborador}</Text>}
            {!!item.obs && <Text style={{ color: t.texto, marginTop: 8 }}>{item.obs}</Text>}
            {item.status !== 'rascunho' && item.status !== 'devolvido' && <Text style={{ color: t.suave, marginTop: 8 }}>Equipamentos anexados: {item.anexados}/{item.precisa}</Text>}
            <View style={{ gap: 10, marginTop: 16, marginBottom: 6 }}>
              {item.status === 'rascunho' && <Botao titulo="Editar" icone="create-outline" variante="contorno" onPress={() => { const id = item.id; setItem(null); nav.navigate('equipamentos.Formulario', { id }); }} />}
              {item.status === 'rascunho' && <Botao titulo="Excluir" icone="trash-outline" variante="perigo" onPress={() => excluir(item)} />}
              {item.status !== 'devolvido' && <Botao titulo="Trocar colaborador" icone="person-outline" variante="suave" onPress={() => { setColab({ id: item.id, nome: item.colaborador ?? '' }); setItem(null); }} />}
              <Botao titulo="Pedir troca de equipamentos" icone="repeat" variante="suave" onPress={() => { setItem(null); void rodar(() => api(`${M}/solicitacoes/troca`, { metodo: 'POST', corpo: { ids: [item.id] } }), 'Troca criada como rascunho'); }} />
              {item.status === 'em_uso' && <Botao titulo="Pedir devolução" icone="arrow-undo" onPress={() => devolverSol(item)} />}
            </View>
          </>
        )}
      </Folha>

      <Folha aberto={!!colab} titulo="Colaborador" aoFechar={() => setColab(null)} rodape={<Botao titulo="Salvar" carregando={ocupado} desabilitado={!colab?.nome.trim()} onPress={async () => { if (colab && await rodar(() => api(`${M}/solicitacoes/substituir`, { metodo: 'POST', corpo: { ids: [colab.id], nome: colab.nome } }), 'Colaborador atualizado')) setColab(null); }} />}>
        {colab && <Campo rotulo="Nome completo" value={colab.nome} onChangeText={(v) => setColab({ ...colab, nome: v })} autoFocus />}
      </Folha>

      <Folha aberto={!!grupo} titulo={grupo?.nome || 'Equipamento sem usuário'} aoFechar={() => setGrupo(null)}>
        {grupo && (
          <>
            {grupo.eqs.map((e) => (
              <View key={e.id} style={{ paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: t.linha }}>
                <Text style={{ color: t.texto, fontWeight: '700' }}>{e.modelo} ({e.patrimonio})</Text>
                <Text style={{ color: t.suave, fontSize: 13 }}>{e.tipo} · {e.base} · {fmtData(e.inicio)} → {fmtData(e.fim)}</Text>
              </View>
            ))}
            <View style={{ gap: 10, marginTop: 16, marginBottom: 6 }}>
              <Botao titulo={grupo.nome ? 'Substituir usuário' : 'Adicionar usuário'} icone="swap-horizontal" variante="suave" onPress={() => { setSubst({ ids: grupo.eqs.map((e) => e.id), nome: '', projeto: grupo.projeto ?? '', superior: grupo.superior ?? '', fim: '' }); setGrupo(null); }} />
              <Botao titulo="Pedir troca de equipamentos" icone="repeat" variante="suave" onPress={() => { const g = grupo; setGrupo(null); void rodar(() => api(`${M}/responsaveis/troca`, { metodo: 'POST', corpo: { ids: g.eqs.map((e) => e.id) } }), 'Troca criada como rascunho'); }} />
              <Botao titulo="Pedir devolução" icone="arrow-undo" desabilitado={grupo.eqs.every((e) => e.status === 'devolucao_pendente')} onPress={() => devolverGrupo(grupo)} />
            </View>
          </>
        )}
      </Folha>

      <Folha aberto={!!subst} titulo="Novo responsável" aoFechar={() => setSubst(null)} rodape={<Botao titulo="Salvar" carregando={ocupado} desabilitado={!subst?.nome.trim()} onPress={async () => { if (subst && await rodar(() => api(`${M}/responsaveis/usuario`, { metodo: 'POST', corpo: subst }), 'Responsável atualizado')) setSubst(null); }} />}>
        {subst && (
          <>
            <Campo rotulo="Nome completo" value={subst.nome} onChangeText={(v) => setSubst({ ...subst, nome: v })} autoFocus />
            <CampoSelecao rotulo="Projeto" valor={subst.projeto} opcoes={opcoesProjeto(cfg.dados, subst.projeto)} aoMudar={(v) => setSubst({ ...subst, projeto: v })} />
            <Campo rotulo="Superior" value={subst.superior} onChangeText={(v) => setSubst({ ...subst, superior: v })} />
            <CampoData rotulo="Data de fim (opcional)" valor={subst.fim} aoMudar={(v) => setSubst({ ...subst, fim: v })} />
          </>
        )}
      </Folha>
    </Tela>
  );
}

export type { Config };