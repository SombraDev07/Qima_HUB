import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../../api/cliente';
import { useTema } from '../../tema';
import { Aviso, Botao, Campo, CampoData, CampoSelecao, Carregando, Icone, Secao, Tela, useAviso, AvisoRascunho } from '../../ui';
import { useAcao } from '../../util/carregar';
import { diasEntre } from '../../util/datas';
import { useRascunhoLocal } from '../../util/rascunho';
import { opcoesProjeto, type Config, type Item, type Solicitacao } from './tipos';

const M = '/api/m/equipamentos';

export function Formulario() {
  const nav = useNavigation<any>();
  const t = useTema();
  const id = (useRoute().params as { id?: number } | undefined)?.id;
  const avisar = useAviso();
  const { executar, ocupado } = useAcao();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [erro, setErro] = useState('');
  const [f, setF] = useState({ projeto: '', base: '', retirada: '', devolucao: '', colaborador: '', cpf: '', obs: '', itens: [{ tipo: '', qtd: 1, motivo: 'Novo' }] as Item[] });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const rasc = useRascunhoLocal('equipamentos-novo', f, setF, !id);
  const setItem = (i: number, p: Partial<Item>) => set('itens', f.itens.map((it, j) => (j === i ? { ...it, ...p } : it)));

  useEffect(() => {
    api<Config>(`${M}/config`).then((c) => { setCfg(c); setF((x) => ({ ...x, base: x.base || c.bases[0], itens: x.itens.map((i) => ({ ...i, tipo: i.tipo || c.tipos[0] })) })); }).catch((x) => setErro(x.message));
    if (id) {
      api<Solicitacao[]>(`${M}/minhas`).then((l) => {
        const s = l.find((x) => x.id === id);
        if (s) setF({ projeto: s.projeto, base: s.base, retirada: s.retirada ?? '', devolucao: s.devolucao ?? '', colaborador: s.colaborador ?? '', cpf: s.cpf ?? '', obs: s.obs ?? '', itens: s.itens.map((i) => ({ ...i })) });
      }).catch((x) => setErro(x.message));
    }
  }, [id]);

  const salvar = async () => {
    setErro('');
    if (!f.projeto.trim()) { setErro('Escolha o projeto.'); return; }
    if (f.retirada && f.devolucao && diasEntre(f.retirada, f.devolucao) < 0) { setErro('A devolução não pode ser antes da retirada.'); return; }
    const corpo = { ...f, itens: f.itens.map((i) => ({ ...i, qtd: Number(i.qtd) || 1 })) };
    const r = await executar(() => (id ? api(`${M}/solicitacoes/${id}`, { metodo: 'PUT', corpo }) : api(`${M}/solicitacoes`, { metodo: 'POST', corpo })));
    if (!r.ok) { setErro(r.erro); return; }
    rasc.limpar();
    avisar(id ? 'Rascunho atualizado' : 'Solicitação adicionada como rascunho'); nav.goBack();
  };

  if (!cfg && !erro) return <Tela titulo="Nova solicitação" aoVoltar={() => nav.goBack()}><Carregando /></Tela>;
  return (
    <Tela titulo={id ? 'Editar rascunho' : 'Nova solicitação'} subtitulo="Equipamentos" aoVoltar={() => nav.goBack()} rodape={<Botao titulo={id ? 'Salvar' : 'Adicionar à lista'} onPress={salvar} carregando={ocupado} estilo={{ flex: 1 }} />}>
      {!!erro && <Aviso texto={erro} />}
      <AvisoRascunho restaurado={rasc.restaurado} aoDescartar={rasc.descartar} />
      <Secao titulo="Entrega" />
      <CampoSelecao rotulo="Projeto" valor={f.projeto} opcoes={opcoesProjeto(cfg, f.projeto)} aoMudar={(v) => set('projeto', v)} />
      <CampoSelecao rotulo="Base de entrega" valor={f.base} opcoes={(cfg?.bases ?? []).map((b) => ({ valor: b, rotulo: b }))} aoMudar={(v) => set('base', v)} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <CampoData rotulo="Retirada" valor={f.retirada} aoMudar={(v) => set('retirada', v)} />
        <CampoData rotulo="Devolução prevista" valor={f.devolucao} minimo={f.retirada || undefined} aoMudar={(v) => set('devolucao', v)} />
      </View>
      <Secao titulo="Itens solicitados" />
      {f.itens.map((it, i) => (
        <View key={i} style={{ backgroundColor: t.cartao, borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 0.5, borderColor: t.linha }}>
          <CampoSelecao rotulo="Tipo" valor={it.tipo} opcoes={(cfg?.tipos ?? []).map((x) => ({ valor: x, rotulo: x }))} aoMudar={(v) => setItem(i, { tipo: v })} />
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
            <View style={{ width: 96 }}><Campo rotulo="Quantidade" value={String(it.qtd)} onChangeText={(v) => setItem(i, { qtd: Number(v.replace(/\D/g, '')) || 0 })} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><CampoSelecao rotulo="Motivo" valor={it.motivo ?? 'Novo'} opcoes={['Novo', 'Troca', 'Reposição'].map((m) => ({ valor: m, rotulo: m }))} aoMudar={(v) => setItem(i, { motivo: v })} /></View>
          </View>
          {f.itens.length > 1 && (
            <Pressable accessibilityRole="button" onPress={() => set('itens', f.itens.filter((_, j) => j !== i))} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end' }}>
              <Icone nome="trash-outline" tamanho={18} cor={t.erro} /><Text style={{ color: t.erro, fontWeight: '700', marginLeft: 4 }}>Remover</Text>
            </Pressable>
          )}
        </View>
      ))}
      <Botao titulo="Adicionar item" icone="add" variante="suave" onPress={() => set('itens', [...f.itens, { tipo: cfg?.tipos[0] ?? '', qtd: 1, motivo: 'Novo' }])} />
      <Secao titulo="Colaborador (opcional)" />
      <Campo rotulo="Nome completo" value={f.colaborador} onChangeText={(v) => set('colaborador', v)} dica="Pode ser informado depois." />
      <Campo rotulo="CPF" value={f.cpf} onChangeText={(v) => set('cpf', v)} keyboardType="number-pad" placeholder="000.000.000-00" />
      <Campo rotulo="Observação" value={f.obs} onChangeText={(v) => set('obs', v)} multilinha placeholder="Ex.: troca por tela quebrada" />
    </Tela>
  );
}