import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { api } from '../../api/cliente';
import { useTema } from '../../tema';
import { Botao, Campo, CampoData, CampoSelecao, Cartao, Chip, Icone } from '../../ui';
import { FotoAut } from '../../ui/FotoAut';
import { arquivoUrl, dec, int, type Config, type NF, type Totais } from './tipos';

const M = '/api/m/nota_nf';

export function TotaisNF({ t }: { t: Totais }) {
  const c = useTema();
  const cel = (r: string, v: string) => <View style={{ flex: 1 }}><Text style={{ color: c.suave, fontSize: 11.5 }}>{r}</Text><Text style={{ color: c.texto, fontSize: 16, fontWeight: '800' }}>{v}</Text></View>;
  return (
    <View>
    <View style={{ flexDirection: 'row', gap: 8, backgroundColor: c.suaveFundo, borderRadius: 12, padding: 10 }}>
      {cel('Itens de soja', String(t.itens_soja))}{cel('Quantidade', dec(t.quantidade))}{cel('Sementes', int(t.sementes))}{cel('Viáveis', int(t.viaveis))}
    </View>
    {t.area_potencial !== undefined && (
      <View style={{ flexDirection: 'row', gap: 8, backgroundColor: c.suaveFundo, borderRadius: 12, padding: 10, marginTop: 8 }}>
        {cel('Área potencial (ha)', dec(t.area_potencial))}{cel('Volume potencial (kg)', int(t.volume_potencial))}
      </View>
    )}
    </View>
  );
}

const paraForm = (n: NF) => ({
  numero_nf: n.numero_nf ?? '', serie: n.serie ?? '', chave_acesso: n.chave_acesso ?? '', data_emissao: n.data_emissao ?? '', emitente_nome: n.emitente_nome ?? '', emitente_doc: n.emitente_doc_fmt ?? '',
  produtor_nome: n.produtor_nome ?? '', produtor_doc: n.produtor_doc_fmt ?? '', municipio: n.municipio ?? '', uf: n.uf ?? '', distrito: n.distrito ?? '', peso_liquido: n.peso_liquido != null ? dec(n.peso_liquido) : '',
  itens: (n.itens ?? []).map((i) => ({
    descricao: i.descricao, cultivar: i.cultivar ?? '', unidade: i.unidade ?? '', quantidade: i.quantidade != null ? dec(i.quantidade) : '', sementes_por_unidade: String(i.sementes_por_unidade ?? ''),
    germinacao: i.germinacao != null ? dec(i.germinacao, 1) : '', germinacao_padrao: i.germinacao_padrao ? 1 : 0, incluido: !!i.incluido, motivo_exclusao: i.motivo_exclusao ?? '',
  })),
});
type Form = ReturnType<typeof paraForm>;

/** NF em rascunho: foto + dados + produtos. Salva sozinho depois de a pessoa parar de digitar. */
export function NFEditor({ cfg, nota, indice, aoMudar, aoRemover, acao }: { cfg: Config; nota: NF; indice: number | string; aoMudar: (n: NF) => void; aoRemover?: () => void; acao?: ReactNode }) {
  const t = useTema();
  const [f, setF] = useState<Form>(() => paraForm(nota));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;
  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = (novo: Form) => {
    setF(novo);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSalvando(true); setErro('');
      try { aoMudarRef.current(await api<NF>(`${M}/notas/${nota.id}`, { metodo: 'PATCH', corpo: novo })); } catch (x) { setErro(x instanceof Error ? x.message : 'Não foi possível salvar.'); } finally { setSalvando(false); }
    }, 600);
  };
  const set = (k: keyof Omit<Form, 'itens'>, v: string) => commit({ ...f, [k]: v });
  const setItem = (i: number, p: Partial<Form['itens'][number]>) => commit({ ...f, itens: f.itens.map((it, j) => (j === i ? { ...it, ...p, ...('germinacao' in p ? { germinacao_padrao: 0 } : {}) } : it)) });
  const ia = nota.ia_status === 'ok';

  return (
    <Cartao estilo={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <FotoAut caminho={arquivoUrl(nota)} estilo={{ width: 84, height: 112, borderRadius: 10, backgroundColor: t.suaveFundo }} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: t.texto, fontWeight: '800', fontSize: 16, flex: 1 }}>NF {indice}{f.produtor_nome ? ` · ${f.produtor_nome}` : ''}</Text>
            {aoRemover && <Pressable accessibilityRole="button" accessibilityLabel="Remover NF" onPress={aoRemover} hitSlop={10}><Icone nome="trash-outline" tamanho={22} cor={t.erro} /></Pressable>}
          </View>
          <Text style={{ color: t.suave, fontSize: 12.5 }}>{nota.codigo}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{ia && <Chip texto="Lido pela IA · confira" tom="info" />}{salvando && <Chip texto="Salvando…" />}</View>
        </View>
      </View>
      <View style={{ marginTop: 10, gap: 6 }}>{(nota.alertas ?? []).map((a) => <Chip key={a.tipo} texto={a.texto} tom={a.nivel === 'erro' || a.tipo === 'duplicada' ? 'erro' : 'aviso'} />)}</View>

      <Pressable accessibilityRole="button" onPress={() => setAberto(!aberto)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 46, marginTop: 4 }}>
        <Icone nome={aberto ? 'chevron-down' : 'chevron-forward'} tamanho={18} cor={t.suave} /><Text style={{ color: t.texto, fontWeight: '800', marginLeft: 6 }}>Dados da nota</Text>
      </Pressable>
      {aberto && (
        <>
          <Campo rotulo="Nº NF" value={f.numero_nf} onChangeText={(v) => set('numero_nf', v)} keyboardType="number-pad" />
          <Campo rotulo="Série" value={f.serie} onChangeText={(v) => set('serie', v)} />
          <CampoData rotulo="Data de emissão" valor={f.data_emissao} aoMudar={(v) => set('data_emissao', v)} />
          <Campo rotulo="Peso líquido (kg)" value={f.peso_liquido} onChangeText={(v) => set('peso_liquido', v)} keyboardType="decimal-pad" />
          <Campo rotulo="Chave de acesso" value={f.chave_acesso} onChangeText={(v) => set('chave_acesso', v)} keyboardType="number-pad" placeholder="44 dígitos" dica={f.chave_acesso && f.chave_acesso.replace(/\D/g, '').length !== 44 ? `${f.chave_acesso.replace(/\D/g, '').length}/44 dígitos` : undefined} />
          <Text style={{ color: t.suave, fontWeight: '800', fontSize: 12.5, marginBottom: 8 }}>EMITENTE</Text>
          <Campo rotulo="Nome / razão social" value={f.emitente_nome} onChangeText={(v) => set('emitente_nome', v)} />
          <Campo rotulo="CNPJ" value={f.emitente_doc} onChangeText={(v) => set('emitente_doc', v)} keyboardType="number-pad" />
          <Text style={{ color: t.suave, fontWeight: '800', fontSize: 12.5, marginBottom: 8 }}>PRODUTOR (DESTINATÁRIO)</Text>
          <Campo rotulo="Nome / razão social" value={f.produtor_nome} onChangeText={(v) => set('produtor_nome', v)} />
          <Campo rotulo="CPF / CNPJ" value={f.produtor_doc} onChangeText={(v) => set('produtor_doc', v)} keyboardType="number-pad" />
          <Campo rotulo="Município" value={f.municipio} onChangeText={(v) => set('municipio', v)} />
          <CampoSelecao rotulo="Distrito" valor={f.distrito} opcoes={cfg.distritos.map((d) => ({ valor: d, rotulo: d }))} aoMudar={(v) => set('distrito', v)} dica="Obrigatório para enviar" />
          <CampoSelecao rotulo="UF" valor={f.uf} opcoes={cfg.ufs.map((u) => ({ valor: u, rotulo: u }))} aoMudar={(v) => set('uf', v)} />
        </>
      )}

      <Text style={{ color: t.texto, fontWeight: '800', marginVertical: 8 }}>Produtos</Text>
      {f.itens.map((it, i) => (
        <View key={i} style={{ borderWidth: 0.5, borderColor: t.linha, borderRadius: 12, padding: 10, marginBottom: 10, opacity: it.incluido ? 1 : 0.65 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Switch value={it.incluido} onValueChange={(v) => setItem(i, { incluido: v })} /><Text style={{ color: t.texto, fontWeight: '700' }}>{it.incluido ? 'Semente de soja' : 'Ignorado'}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Remover item" onPress={() => commit({ ...f, itens: f.itens.filter((_, j) => j !== i) })} hitSlop={10}><Icone nome="close-circle-outline" tamanho={22} cor={t.erro} /></Pressable>
          </View>
          {!it.incluido && !!it.motivo_exclusao && <Text style={{ color: t.suave, fontSize: 12.5, marginBottom: 6 }}>Ignorado: {it.motivo_exclusao}</Text>}
          <Campo rotulo="Descrição do produto" value={it.descricao} onChangeText={(v) => setItem(i, { descricao: v })} multilinha />
          <Campo rotulo="Cultivar" value={it.cultivar} onChangeText={(v) => setItem(i, { cultivar: v })} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Campo rotulo="Unidade" value={it.unidade} onChangeText={(v) => setItem(i, { unidade: v })} /></View>
            <View style={{ flex: 1 }}><Campo rotulo="Quantidade" value={it.quantidade} onChangeText={(v) => setItem(i, { quantidade: v })} keyboardType="decimal-pad" /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1.4 }}><Campo rotulo="Sementes/unid." value={it.sementes_por_unidade} onChangeText={(v) => setItem(i, { sementes_por_unidade: v.replace(/\D/g, '') })} keyboardType="number-pad" placeholder="160000" /></View>
            <View style={{ flex: 1 }}><Campo rotulo="Germ. %" value={it.germinacao} onChangeText={(v) => setItem(i, { germinacao: v })} keyboardType="decimal-pad" dica={it.germinacao_padrao ? 'padrão' : undefined} /></View>
          </View>
        </View>
      ))}
      <Botao titulo="Adicionar item" icone="add" variante="suave" pequeno onPress={() => commit({ ...f, itens: [...f.itens, { descricao: 'SEMENTE DE SOJA ', cultivar: '', unidade: 'SACO', quantidade: '', sementes_por_unidade: '', germinacao: '', germinacao_padrao: 0, incluido: true, motivo_exclusao: '' }] })} />
      <View style={{ marginTop: 12 }}><TotaisNF t={nota.totais} /></View>
      {!!erro && <Text style={{ color: t.erro, fontSize: 13, marginTop: 6 }}>{erro}</Text>}
      {acao}
    </Cartao>
  );
}