import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../../api/cliente';
import { Aviso, Botao, Campo, CampoData, CampoSelecao, Carregando, Secao, Tela, useAviso, useConfirmar, AvisoRascunho } from '../../ui';
import { CampoCidade, UFS, cidadeOficial } from '../../ui/CampoCidade';
import { useAcao } from '../../util/carregar';
import { hoje } from '../../util/datas';
import { useRascunhoLocal } from '../../util/rascunho';
import type { Config, Pedido } from './tipos';

const M = '/api/m/contratacao';

export function Formulario() {
  const nav = useNavigation<any>();
  const id = (useRoute().params as { id?: number } | undefined)?.id;
  const avisar = useAviso();
  const confirmar = useConfirmar();
  const { executar, ocupado } = useAcao();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [erro, setErro] = useState('');
  const [erroCidade, setErroCidade] = useState('');
  const [f, setF] = useState({ projeto: '', funcao: '', cidade: '', uf: 'PR', data_desejada: hoje(), observacao: '', experiencia: false, cnh: false, movel: false, qtd: '1' });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const rasc = useRascunhoLocal('contratacao-novo', f, setF, !id);

  useEffect(() => {
    api<Config>(`${M}/config`).then((c) => { setCfg(c); setF((x) => ({ ...x, projeto: x.projeto || c.projetos[0], funcao: x.funcao || c.funcoes[0] })); }).catch((x) => setErro(x.message));
    if (id) api<Pedido[]>(`${M}/meus`).then((l) => { const p = l.find((x) => x.id === id); if (p) setF({ projeto: p.projeto, funcao: p.funcao, cidade: p.cidade ?? '', uf: p.uf, data_desejada: p.data_desejada, observacao: p.observacao ?? '', experiencia: p.experiencia, cnh: p.cnh, movel: p.movel, qtd: String(p.qtd) }); });
  }, [id]);

  const salvar = async (rascunho: boolean) => {
    setErro(''); setErroCidade('');
    if (!rascunho && !f.cidade.trim()) { setErroCidade('Informe a cidade da vaga.'); return; }
    if (f.cidade && !cidadeOficial(f.cidade, f.uf)) { setErroCidade(`Escolha uma cidade de ${f.uf} na lista.`); return; }
    if (!rascunho && !await confirmar({
      titulo: 'Enviar a solicitação?',
      mensagem: `${f.qtd} vaga(s) de ${f.funcao}${f.cidade ? ` em ${f.cidade} - ${f.uf}` : ` em ${f.uf}`} vão para o RH.`,
      confirmar: 'Enviar', cancelar: 'Voltar',
    })) return;
    const corpo = { ...f, qtd: Number(f.qtd) || 0, cidade: f.cidade ? cidadeOficial(f.cidade, f.uf) : '', rascunho };
    const r = await executar(() => (id ? api<{ codigo: string }>(`${M}/meus/${id}`, { metodo: 'PUT', corpo }) : api<{ codigo: string }>(`${M}/meus`, { metodo: 'POST', corpo })));
    if (!r.ok) { setErro(r.erro); return; }
    rasc.limpar();
    avisar(rascunho ? `Rascunho salvo · ${r.valor.codigo}` : `Solicitação enviada · ${r.valor.codigo}`); nav.goBack();
  };

  if (!cfg && !erro) return <Tela titulo="Nova vaga" aoVoltar={() => nav.goBack()}><Carregando /></Tela>;
  // Sim / Não, igual ao site
  const simNao = (r: string, k: 'experiencia' | 'cnh' | 'movel') => (
    <CampoSelecao rotulo={r} valor={f[k] ? 'sim' : 'nao'} opcoes={[{ valor: 'sim', rotulo: 'Sim' }, { valor: 'nao', rotulo: 'Não' }]} aoMudar={(v) => set(k, v === 'sim')} />
  );
  const sair = async () => {
    if (await confirmar({ titulo: 'Cancelar esta solicitação?', mensagem: 'O que foi preenchido e não salvo será perdido.', confirmar: 'Sim, cancelar', cancelar: 'Continuar editando', perigo: true })) { rasc.limpar(); nav.goBack(); }
  };
  return (
    <Tela titulo={id ? 'Continuar rascunho' : 'Nova vaga'} subtitulo="Contratação" aoVoltar={sair}
      rodape={<><Botao titulo="Cancelar" variante="suave" onPress={sair} desabilitado={ocupado} estilo={{ flex: 1 }} /><Botao titulo="Rascunho" variante="contorno" onPress={() => salvar(true)} desabilitado={ocupado} estilo={{ flex: 1 }} /><Botao titulo="Enviar" icone="send" onPress={() => salvar(false)} carregando={ocupado} estilo={{ flex: 1.2 }} /></>}>
      {!!erro && <Aviso texto={erro} />}
      <AvisoRascunho restaurado={rasc.restaurado} aoDescartar={rasc.descartar} />
      <CampoSelecao rotulo="Operação / Projeto" valor={f.projeto} opcoes={(cfg?.projetos ?? []).map((p) => ({ valor: p, rotulo: p }))} aoMudar={(v) => set('projeto', v)} />
      <CampoSelecao rotulo="Função" valor={f.funcao} opcoes={(cfg?.funcoes ?? []).map((p) => ({ valor: p, rotulo: p }))} aoMudar={(v) => set('funcao', v)} />
      <CampoSelecao rotulo="Estado" valor={f.uf} opcoes={UFS.map((u) => ({ valor: u, rotulo: u }))} aoMudar={(u) => setF((x) => ({ ...x, uf: u, cidade: cidadeOficial(x.cidade, u) ? x.cidade : '' }))} />
      <CampoCidade uf={f.uf} cidade={f.cidade} aoMudar={(c) => { set('cidade', c); setErroCidade(''); }} erro={erroCidade} />
      <CampoData rotulo="Data de início" valor={f.data_desejada} aoMudar={(v) => set('data_desejada', v)} />
      <Campo rotulo="Quantidade de vagas" value={f.qtd} onChangeText={(v) => set('qtd', v.replace(/\D/g, ''))} keyboardType="number-pad" />
      <Secao titulo="Requisitos da vaga" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>{simNao('Experiência', 'experiencia')}</View>
        <View style={{ flex: 1 }}>{simNao('CNH', 'cnh')}</View>
        <View style={{ flex: 1 }}>{simNao('Móvel', 'movel')}</View>
      </View>
      <Campo rotulo="Observação (opcional)" value={f.observacao} onChangeText={(v) => set('observacao', v)} multilinha placeholder="Observação da vaga" />
    </Tela>
  );
}