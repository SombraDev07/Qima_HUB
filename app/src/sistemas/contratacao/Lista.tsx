import { useCallback, useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../../api/cliente';
import { useTema } from '../../tema';
import { Aviso, Botao, BotaoFlutuante, Campo, CampoData, CampoSelecao, Carregando, Cartao, Chip, Folha, ItemLista, ListaPlana, Segmentos, Tela, Vazio, useAviso, useConfirmar } from '../../ui';
import { CampoCidade, UFS, cidadeOficial } from '../../ui/CampoCidade';
import { useAcao, useCarregar } from '../../util/carregar';
import { fmtData, hoje, norm } from '../../util/datas';
import { AVISOS, JUSTIFICATIVAS, TOM, local, situacaoPessoa, type Config, type Pedido, type Pessoa } from './tipos';

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])].sort();
const TODOS = { valor: '', rotulo: 'Todos' };

const M = '/api/m/contratacao';

export function Lista() {
  const nav = useNavigation<any>();
  const t = useTema();
  const avisar = useAviso();
  const confirmar = useConfirmar();
  const { executar, ocupado } = useAcao();
  const { dados, erro, atualizando, recarregar } = useCarregar(() => api<Pedido[]>(`${M}/meus`));
  useFocusEffect(useCallback(() => { void recarregar(); }, [recarregar]));
  const [aba, setAba] = useState<'pedidos' | 'colaboradores'>('pedidos');
  const [fc, setFc] = useState({ vaga: '', mob: '', cnh: '', status: '' });
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<Pedido | null>(null);
  const [dem, setDem] = useState<{ p: Pedido; a: Pessoa } | null>(null);
  const [fd, setFd] = useState({ tipo: 'empresa', gestor: '', data_prevista: '', ultimo_dia: '', aviso: '', justificativa: '', obs: '', confirmado: false });
  const [erroDem, setErroDem] = useState('');
  const todos = dados ?? [];
  const lista = useMemo(() => todos.filter((p) => !busca || norm(`${p.codigo} ${p.funcao} ${p.cidade ?? ''} ${p.distrito ?? ''} ${p.projeto}`).includes(norm(busca))), [todos, busca]);
  // Meus Colaboradores: todas as pessoas que o RH colocou nas minhas vagas, uma por linha
  const pessoas = useMemo(() => todos.flatMap((p) => (p.anexos ?? []).map((a) => ({ a, p }))), [todos]);
  const colaboradores = useMemo(() => pessoas.filter(({ a, p }) => (!busca || norm(`${a.nome} ${a.email ?? ''} ${p.codigo} ${a.funcao ?? ''}`).includes(norm(busca)))
    && (!fc.vaga || p.codigo === fc.vaga) && (!fc.mob || (fc.mob === 'MÓVEL') === !!a.movel) && (!fc.cnh || (fc.cnh === 'Sim') === !!a.cnh)
    && (!fc.status || situacaoPessoa(a) === fc.status)), [pessoas, busca, fc]);
  const abrirDemissao = (p: Pedido, a: Pessoa) => { setFd({ tipo: 'empresa', gestor: '', data_prevista: '', ultimo_dia: '', aviso: '', justificativa: '', obs: '', confirmado: false }); setErroDem(''); setDem({ p, a }); setAberto(null); };

  const rodar = async (fn: () => Promise<unknown>, ok: string) => { const r = await executar(fn); if (!r.ok) { avisar(r.erro, 'erro'); return false; } avisar(ok); void recarregar(); return true; };
  const cancelar = async (p: Pedido) => {
    if (!await confirmar({ titulo: `Cancelar o pedido ${p.codigo}?`, mensagem: 'O RH deixa de trabalhar nesta vaga.', confirmar: 'Cancelar pedido', cancelar: 'Voltar', perigo: true })) return;
    setAberto(null); await rodar(() => api(`${M}/meus/${p.id}/cancelar`, { metodo: 'POST', corpo: {} }), 'Pedido cancelado');
  };
  const excluir = async (p: Pedido) => {
    if (!await confirmar({ titulo: `Excluir ${p.codigo}?`, mensagem: 'Não pode ser desfeito.', confirmar: 'Excluir', perigo: true })) return;
    setAberto(null); await rodar(() => api(`${M}/meus/${p.id}`, { metodo: 'DELETE' }), `${p.codigo} excluído`);
  };
  const pedirDemissao = async () => {
    if (!dem) return; setErroDem('');
    const r = await executar(() => api(`${M}/anexos/${dem.a.anexo_id}/demissao`, { metodo: 'POST', corpo: fd }));
    if (!r.ok) { setErroDem(r.erro); return; }
    avisar('Pedido de demissão enviado ao RH'); setDem(null); void recarregar();
  };

  const cabecalho = (
    <>
      {!!erro && <Aviso texto={erro} />}
      <Segmentos valor={aba} aoMudar={setAba} opcoes={[{ valor: 'pedidos', rotulo: 'Pedidos', qtd: lista.length }, { valor: 'colaboradores', rotulo: 'Meus Colaboradores', qtd: pessoas.length }]} />
      <Campo rotulo="Buscar" value={busca} onChangeText={setBusca} placeholder={aba === 'pedidos' ? 'Código, função, cidade ou projeto' : 'Nome, e-mail, ID da vaga ou função'} />
      {aba === 'colaboradores' && (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><CampoSelecao rotulo="ID vaga" valor={fc.vaga} opcoes={[TODOS, ...uniq(pessoas.map(({ p }) => p.codigo)).map((x) => ({ valor: x, rotulo: x }))]} aoMudar={(v) => setFc({ ...fc, vaga: v })} /></View>
            <View style={{ flex: 1 }}><CampoSelecao rotulo="Status" valor={fc.status} opcoes={[TODOS, ...uniq(pessoas.map(({ a }) => situacaoPessoa(a))).map((x) => ({ valor: x, rotulo: x }))]} aoMudar={(v) => setFc({ ...fc, status: v })} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><CampoSelecao rotulo="Mobilidade" valor={fc.mob} opcoes={[TODOS, { valor: 'LOCAL', rotulo: 'LOCAL' }, { valor: 'MÓVEL', rotulo: 'MÓVEL' }]} aoMudar={(v) => setFc({ ...fc, mob: v })} /></View>
            <View style={{ flex: 1 }}><CampoSelecao rotulo="CNH" valor={fc.cnh} opcoes={[TODOS, { valor: 'Sim', rotulo: 'Sim' }, { valor: 'Não', rotulo: 'Não' }]} aoMudar={(v) => setFc({ ...fc, cnh: v })} /></View>
          </View>
        </>
      )}
    </>
  );
  return (
    <Tela titulo="Contratação" subtitulo="Vagas e colaboradores" aoVoltar={() => nav.goBack()} semRolagem>
      {dados === null && !erro ? <Carregando /> : aba === 'colaboradores' ? (
        <ListaPlana dados={colaboradores} chave={({ a }) => String(a.anexo_id)} cabecalho={cabecalho} aoAtualizar={recarregar} atualizando={atualizando}
          vazio={<Vazio icone="people-outline" titulo={pessoas.length ? 'Ninguém com esses filtros' : 'Ninguém anexado ainda'} texto="Aqui aparecem as pessoas que o RH colocou nas suas vagas." />}
          renderizar={({ a, p }) => (
            <Cartao estilo={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: t.texto, fontWeight: '800', fontSize: 16, flex: 1 }}>{a.nome}</Text>
                <Chip texto={situacaoPessoa(a)} tom={a.demissao_pendente ? 'erro' : 'ok'} />
              </View>
              {!!a.email && <Text style={{ color: t.suave, fontSize: 13 }}>{a.email}</Text>}
              <Text style={{ color: t.texto, marginTop: 6 }}>Vaga {p.codigo} · {a.funcao || p.funcao}</Text>
              <Text style={{ color: t.suave, fontSize: 13.5 }}>{a.movel ? 'MÓVEL' : 'LOCAL'} · CNH {a.cnh ? 'Sim' : 'Não'} · contratado em {fmtData(a.data_vinc)}</Text>
              {!a.demissao_pendente && <Botao titulo="Pedir demissão" variante="perigo" pequeno onPress={() => abrirDemissao(p, a)} estilo={{ marginTop: 10, alignSelf: 'flex-start' }} />}
            </Cartao>
          )} />
      ) : (
        <ListaPlana dados={lista} chave={(p) => String(p.id)} cabecalho={cabecalho} aoAtualizar={recarregar} atualizando={atualizando}
          vazio={<Vazio icone="people-outline" titulo="Nenhum pedido" texto="Toque em “Nova vaga” para solicitar." />}
          renderizar={(p) => (
            <ItemLista titulo={p.codigo} destaque={p.funcao} onPress={() => (p.status === 'rascunho' ? nav.navigate('contratacao.Formulario', { id: p.id }) : setAberto(p))}
              linhas={[local(p), `Início ${fmtData(p.data_desejada)} (S${p.semana}) · ${p.projeto}`, p.observacao ?? '']}
              chips={<><Chip texto={p.status_label} tom={TOM[p.status]} /><Chip texto={`${p.qtd_atendida}/${p.qtd} vagas`} tom={p.qtd_atendida < p.qtd ? 'aviso' : 'ok'} />{p.movel && <Chip texto="MÓVEL" tom="info" />}</>} />
          )} />
      )}
      <BotaoFlutuante titulo="Nova vaga" onPress={() => nav.navigate('contratacao.Formulario', {})} />

      <Folha aberto={!!aberto} titulo={aberto ? `${aberto.codigo} · ${aberto.funcao}` : ''} aoFechar={() => setAberto(null)}>
        {aberto && (
          <>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><Chip texto={aberto.status_label} tom={TOM[aberto.status]} /><Chip texto={`${aberto.qtd_atendida} de ${aberto.qtd}`} tom="neutro" />{aberto.experiencia && <Chip texto="Experiência" />}{aberto.cnh && <Chip texto="CNH" />}</View>
            <Text style={{ color: t.texto, marginTop: 10 }}>{local(aberto)}</Text>
            <Text style={{ color: t.suave }}>Início {fmtData(aberto.data_desejada)} (S{aberto.semana}) · {aberto.projeto}</Text>
            {!!aberto.observacao && <Text style={{ color: t.texto, marginTop: 8 }}>{aberto.observacao}</Text>}
            <Text style={{ color: t.suave, fontWeight: '800', fontSize: 12.5, marginTop: 16, marginBottom: 6 }}>PESSOAS ANEXADAS</Text>
            {!aberto.anexos.length ? <Text style={{ color: t.suave }}>O RH ainda não anexou pessoas a esta vaga.</Text> : aberto.anexos.map((a) => (
              <Cartao key={a.anexo_id} estilo={{ marginBottom: 8, padding: 12 }}>
                <Text style={{ color: t.texto, fontWeight: '800' }}>{a.nome}</Text>
                <Text style={{ color: t.suave, fontSize: 13 }}>{[a.email, a.funcao, a.movel ? 'MÓVEL' : 'LOCAL', `CNH ${a.cnh ? 'Sim' : 'Não'}`, a.data_vinc ? `contratado em ${fmtData(a.data_vinc)}` : ''].filter(Boolean).join(' · ')}</Text>
                <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {a.demissao_pendente ? <Chip texto="Demissão em análise" tom="erro" /> : <Chip texto="Anexado" tom="ok" />}
                  {!a.demissao_pendente && <Botao titulo="Pedir demissão" variante="perigo" pequeno onPress={() => abrirDemissao(aberto, a)} />}
                </View>
              </Cartao>
            ))}
            <View style={{ gap: 10, marginTop: 14 }}>
              {aberto.status === 'pendente' && <Botao titulo="Cancelar pedido" icone="close-circle-outline" variante="perigo" onPress={() => cancelar(aberto)} desabilitado={ocupado} />}
              {['rascunho', 'cancelado'].includes(aberto.status) && <Botao titulo="Excluir" icone="trash-outline" variante="perigo" onPress={() => excluir(aberto)} desabilitado={ocupado} />}
            </View>
          </>
        )}
      </Folha>

      <Folha aberto={!!dem} titulo={dem ? `Pedir demissão · ${dem.a.nome}` : ''} aoFechar={() => setDem(null)} rodape={<Botao titulo="Enviar ao RH" variante="perigo" onPress={pedirDemissao} carregando={ocupado} />}>
        {dem && (
          <>
            {!!erroDem && <Aviso texto={erroDem} />}
            <Segmentos valor={fd.tipo as 'empresa' | 'colaborador'} aoMudar={(v) => setFd({ ...fd, tipo: v })} opcoes={[{ valor: 'empresa', rotulo: 'Da empresa' }, { valor: 'colaborador', rotulo: 'Do colaborador' }]} />
            <Campo rotulo="Gestor responsável" value={fd.gestor} onChangeText={(v) => setFd({ ...fd, gestor: v })} />
            <CampoData rotulo="Data prevista do desligamento" valor={fd.data_prevista} aoMudar={(v) => setFd({ ...fd, data_prevista: v })} />
            <CampoData rotulo="Último dia trabalhado" valor={fd.ultimo_dia} aoMudar={(v) => setFd({ ...fd, ultimo_dia: v })} />
            <CampoSelecao rotulo="Aviso prévio" valor={fd.aviso} opcoes={AVISOS.map((a) => ({ valor: a, rotulo: a }))} aoMudar={(v) => setFd({ ...fd, aviso: v })} />
            <CampoSelecao rotulo="Justificativa" valor={fd.justificativa} opcoes={JUSTIFICATIVAS.map((a) => ({ valor: a, rotulo: a }))} aoMudar={(v) => setFd({ ...fd, justificativa: v })} />
            <Campo rotulo="Observação" value={fd.obs} onChangeText={(v) => setFd({ ...fd, obs: v })} multilinha />
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: fd.confirmado }} onPress={() => setFd({ ...fd, confirmado: !fd.confirmado })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}>
              <Switch value={fd.confirmado} onValueChange={(v) => setFd({ ...fd, confirmado: v })} /><Text style={{ color: t.texto, flex: 1 }}>Confirmo que este é o colaborador do desligamento</Text>
            </Pressable>
          </>
        )}
      </Folha>
    </Tela>
  );
}

export { hoje, UFS, cidadeOficial };