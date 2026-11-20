import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api, ApiErro, enviarArquivo } from '../../api/cliente';
import { useTema } from '../../tema';
import { Aviso, Botao, Campo, CampoData, CampoSelecao, Carregando, Cartao, Chip, Folha, Icone, Secao, Segmentos, Tela, useAviso, useConfirmar } from '../../ui';
import { useAcao } from '../../util/carregar';
import { fmtData } from '../../util/datas';
import { kb, linhaVazia, soDigitos, type Anexo, type Config, type Linha, type Pedido } from './tipos';

const M = '/api/m/solicitacoes';
const numero = (s: string) => Math.min(200_000_000, Number(soDigitos(s)) || 0);
const mascara = (v: string) => { const d = soDigitos(v).slice(0, 14); return d.length <= 11 ? d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2') : d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2'); };

export function Formulario() {
  const nav = useNavigation<any>();
  const t = useTema();
  const id = (useRoute().params as { id?: number } | undefined)?.id;
  const avisar = useAviso();
  const confirmar = useConfirmar();
  const { executar, ocupado } = useAcao();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [orig, setOrig] = useState<Pedido | null>(null);
  const [erro, setErro] = useState('');
  const [f, setF] = useState({ projeto: '', tipo: 'exclusao' as 'exclusao' | 'insercao' | 'acumulado', subtipo: 'insercao', cod_visita: '', id_carga: '', motivo: '', titulo: '', descricao: '', data_inicial: '', data_final: '' });
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()]);
  const [edLinha, setEdLinha] = useState<{ i: number; l: Linha } | null>(null);
  const [anexo, setAnexo] = useState<Anexo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    api<Config>(`${M}/config`).then((c) => { setCfg(c); setF((x) => ({ ...x, projeto: x.projeto || c.projetos[0] || '' })); }).catch((x) => setErro(x.message));
    if (id) {
      api<Pedido>(`${M}/pedidos/${id}`).then((p) => {
        setOrig(p);
        setF({ projeto: p.projeto, tipo: p.tipo, subtipo: p.subtipo ?? 'insercao', cod_visita: p.cod_visita ?? '', id_carga: p.id_carga ?? '', motivo: p.motivo ?? '', titulo: p.titulo ?? '', descricao: p.descricao ?? '', data_inicial: p.data_inicial ?? '', data_final: p.data_final ?? '' });
        if (p.linhas?.length) setLinhas(p.linhas.map((l) => ({ ...linhaVazia(), ...l, documento: mascara(l.documento ?? ''), data: l.data ?? '' })));
      }).catch((x) => setErro(x.message));
    }
  }, [id]);

  const correcao = f.tipo === 'acumulado' && f.subtipo === 'correcao';
  const anexoObrig = f.tipo === 'insercao' || (f.tipo === 'acumulado' && f.subtipo === 'insercao');
  const editando = !!orig;

  const escolherPlanilha = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'text/comma-separated-values', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    setEnviando(true); setErro('');
    try { setAnexo(await enviarArquivo<Anexo>(`${M}/arquivos?nome=${encodeURIComponent(a.name)}`, a.uri, a.mimeType ?? 'application/octet-stream')); }
    catch (x) { setErro(x instanceof ApiErro ? x.message : 'Não foi possível anexar.'); } finally { setEnviando(false); }
  };

  const enviar = async (confirmado = false): Promise<void> => {
    setErro('');
    const corpo = { ...f, subtipo: f.tipo === 'acumulado' ? f.subtipo : null, arquivo_id: anexo?.id, confirmar: confirmado,
      linhas: correcao ? linhas.map(({ k, ...l }) => ({ ...l, documento: soDigitos(l.documento) })) : undefined };
    const r = await executar(() => (editando ? api<{ id: number }>(`${M}/meus/${id}`, { metodo: 'PUT', corpo }) : api<{ id: number }>(`${M}/meus`, { metodo: 'POST', corpo })));
    if (r.ok) { avisar(editando ? (orig?.status === 'correcao' ? 'Corrigida e reenviada' : 'Alterações salvas') : 'Solicitação criada'); if (editando) nav.goBack(); else nav.replace('solicitacoes.Pedido', { id: r.valor.id }); return; }
    if (r.erro.startsWith('Aviso:') && await confirmar({ titulo: 'Confira antes de enviar', mensagem: `${r.erro.replace(/^Aviso:\s*/, '')}\n\nEstá certo assim?`, confirmar: 'Enviar mesmo assim', cancelar: 'Revisar' })) return enviar(true);
    setErro(r.erro);
  };

  if (!cfg && !erro) return <Tela titulo="Nova solicitação" aoVoltar={() => nav.goBack()}><Carregando /></Tela>;
  const temAnexo = !!(anexo || orig?.anexo);
  return (
    <Tela titulo={editando ? `${orig?.status === 'correcao' ? 'Corrigir' : 'Editar'} ${orig?.codigo}` : 'Nova solicitação'} subtitulo="Solicitações" aoVoltar={() => nav.goBack()}
      rodape={<Botao titulo={editando ? (orig?.status === 'correcao' ? 'Reenviar corrigida' : 'Salvar alterações') : 'Criar solicitação'} icone="send" onPress={() => enviar(false)} carregando={ocupado} estilo={{ flex: 1 }} />}>
      {orig?.status === 'correcao' && !!orig.obs_central && <Aviso tipo="info" texto={`A central pediu correção: ${orig.obs_central}`} />}
      {!!erro && <Aviso texto={erro} />}
      <CampoSelecao rotulo="Projeto" valor={f.projeto} opcoes={(cfg?.projetos ?? []).map((p) => ({ valor: p, rotulo: p }))} aoMudar={(v) => set('projeto', v)} />
      {!editando && <Segmentos valor={f.tipo} aoMudar={(v) => { set('tipo', v); setErro(''); }} opcoes={[{ valor: 'exclusao', rotulo: 'Exclusão' }, { valor: 'insercao', rotulo: 'Inserção' }, { valor: 'acumulado', rotulo: 'Acumulado' }]} />}
      {editando && <View style={{ marginBottom: 14 }}><Chip texto={orig?.tipo_label ?? ''} tom="info" /></View>}
      {f.tipo === 'acumulado' && !editando && <CampoSelecao rotulo="Tipo de acumulado" valor={f.subtipo} opcoes={[{ valor: 'insercao', rotulo: 'Inserção' }, { valor: 'correcao', rotulo: 'Correção' }]} aoMudar={(v) => set('subtipo', v)} />}
      {f.tipo === 'acumulado' && f.subtipo === 'insercao' && (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <CampoData rotulo="Data inicial" valor={f.data_inicial} aoMudar={(v) => set('data_inicial', v)} />
          <CampoData rotulo="Data final" valor={f.data_final} minimo={f.data_inicial || undefined} aoMudar={(v) => set('data_final', v)} />
        </View>
      )}
      {f.tipo !== 'acumulado' && <Campo rotulo="Código da visita" value={f.cod_visita} onChangeText={(v) => set('cod_visita', v)} />}
      {f.tipo === 'exclusao' && <><Campo rotulo="ID da carga" value={f.id_carga} onChangeText={(v) => set('id_carga', v)} /><Campo rotulo="Motivo" value={f.motivo} onChangeText={(v) => set('motivo', v)} multilinha placeholder="Por que a carga deve ser excluída" /></>}
      {f.tipo === 'acumulado' && f.subtipo === 'insercao' && <Campo rotulo="Título" value={f.titulo} onChangeText={(v) => set('titulo', v)} />}

      {correcao && (
        <>
          <Secao titulo={`Correção · ${linhas.length} linha(s)`} />
          {linhas.map((l, i) => (
            <Cartao key={l.k} onPress={() => setEdLinha({ i, l })} estilo={{ marginBottom: 8, padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.texto, fontWeight: '800' }}>{l.cod_visita || 'Linha sem código'}</Text>
                  <Text style={{ color: t.suave, fontSize: 13 }}>{l.documento || 'sem CPF/CNPJ'} · {l.data ? fmtData(l.data) : 'sem data'}</Text>
                  <Text style={{ color: t.suave, fontSize: 13 }}>Neg {l.negativa} · Decl {l.declarada} · Pos {l.positiva} · Part {l.participante}</Text>
                </View>
                <Icone nome="create-outline" tamanho={20} cor={t.suave} />
              </View>
            </Cartao>
          ))}
          <Botao titulo="Adicionar linha" icone="add" variante="suave" onPress={() => setEdLinha({ i: -1, l: linhaVazia() })} />
        </>
      )}

      <View style={{ height: 14 }} />
      <Campo rotulo={correcao ? 'Observação (opcional)' : 'Descrição'} value={f.descricao} onChangeText={(v) => set('descricao', v)} multilinha />
      {anexoObrig && (
        <>
          <Secao titulo="Anexo (Excel)" />
          <Cartao estilo={{ padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icone nome="document-attach-outline" tamanho={24} cor={temAnexo ? t.ok : t.suave} />
              <Text style={{ flex: 1, color: t.texto }} numberOfLines={2}>{anexo ? `${anexo.nome} · ${kb(anexo.tamanho)}` : orig?.anexo ? `${orig.anexo.nome} (atual)` : 'Nenhum arquivo'}</Text>
            </View>
            <Botao titulo={temAnexo ? 'Trocar planilha' : 'Escolher planilha'} icone="folder-open-outline" variante="contorno" carregando={enviando} onPress={escolherPlanilha} estilo={{ marginTop: 10 }} />
          </Cartao>
        </>
      )}

      <Folha aberto={!!edLinha} titulo={edLinha && edLinha.i >= 0 ? `Linha ${edLinha.i + 1}` : 'Nova linha'} aoFechar={() => setEdLinha(null)}
        rodape={(
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {edLinha && edLinha.i >= 0 && linhas.length > 1 && <Botao titulo="Remover" variante="perigo" onPress={() => { setLinhas(linhas.filter((_, j) => j !== edLinha.i)); setEdLinha(null); }} estilo={{ flex: 1 }} />}
            <Botao titulo="Salvar linha" onPress={() => { if (!edLinha) return; setLinhas(edLinha.i >= 0 ? linhas.map((x, j) => (j === edLinha.i ? edLinha.l : x)) : [...linhas, edLinha.l]); setEdLinha(null); }} estilo={{ flex: 1.5 }} />
          </View>
        )}>
        {edLinha && (
          <>
            <Campo rotulo="Código da visita" value={edLinha.l.cod_visita} onChangeText={(v) => setEdLinha({ ...edLinha, l: { ...edLinha.l, cod_visita: v } })} />
            <Campo rotulo="CPF ou CNPJ" value={edLinha.l.documento} onChangeText={(v) => setEdLinha({ ...edLinha, l: { ...edLinha.l, documento: mascara(v) } })} keyboardType="number-pad" />
            <CampoData rotulo="Data" valor={edLinha.l.data} aoMudar={(v) => setEdLinha({ ...edLinha, l: { ...edLinha.l, data: v } })} />
            {(['negativa', 'declarada', 'positiva', 'participante'] as const).map((k) => (
              <Campo key={k} rotulo={k[0].toUpperCase() + k.slice(1)} value={edLinha.l[k] ? String(edLinha.l[k]) : ''} placeholder="0" keyboardType="number-pad"
                onChangeText={(v) => setEdLinha({ ...edLinha, l: { ...edLinha.l, [k]: numero(v) } })} />
            ))}
          </>
        )}
      </Folha>
      <Pressable accessibilityElementsHidden style={{ height: 0 }} />
    </Tela>
  );
}