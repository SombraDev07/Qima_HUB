import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api, enviarArquivo } from '../../api/cliente';
import { useTema } from '../../tema';
import { Aviso, Botao, Cartao, Carregando, Chip, Icone, Segmentos, Tela, Vazio, useAviso, useConfirmar } from '../../ui';
import { BotoesFoto } from '../../ui/BotoesFoto';
import { FotoAut } from '../../ui/FotoAut';
import { useAcao } from '../../util/carregar';
import { fmtData, fmtDataHora } from '../../util/datas';
import type { FotoPronta } from '../../util/foto';
import { NFEditor, TotaisNF } from './NFEditor';
import { ROTULO, TOM, arquivoUrl, dec, int, type Config, type NF, type Totais } from './tipos';
import { Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

const M = '/api/m/nota_nf';
const somar = (ns: NF[]): Totais => ns.reduce((t, n) => ({
  itens_soja: t.itens_soja + n.totais.itens_soja, itens_ignorados: t.itens_ignorados + n.totais.itens_ignorados, quantidade: t.quantidade + n.totais.quantidade,
  sementes: t.sementes + n.totais.sementes, viaveis: t.viaveis + n.totais.viaveis,
  area_potencial: (t.area_potencial ?? 0) + (n.totais.area_potencial ?? 0), volume_potencial: (t.volume_potencial ?? 0) + (n.totais.volume_potencial ?? 0),
}), { itens_soja: 0, itens_ignorados: 0, quantidade: 0, sementes: 0, viaveis: 0, area_potencial: 0, volume_potencial: 0 });

function Enviar({ aoEnviado }: { aoEnviado: () => void }) {
  const t = useTema();
  const avisar = useAviso();
  const confirmar = useConfirmar();
  const { executar, ocupado } = useAcao();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [notas, setNotas] = useState<NF[]>([]);
  const [subindo, setSubindo] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  useEffect(() => { api<Config>(`${M}/config`).then(setCfg).catch((x) => setErro(x.message)); api<NF[]>(`${M}/rascunhos`).then(setNotas).catch(() => {}); }, []);

  const adicionar = async (fotos: FotoPronta[]) => {
    for (const f of fotos) {
      setSubindo((s) => [...s, f.nome]);
      try { const n = await enviarArquivo<NF>(`${M}/notas?nome=${encodeURIComponent(f.nome)}`, f.uri, f.mime); setNotas((ns) => [...ns, n]); }
      catch (x) { avisar(x instanceof Error ? x.message : 'Não foi possível enviar a foto.', 'erro'); } finally { setSubindo((s) => s.filter((n) => n !== f.nome)); }
    }
  };
  const remover = async (n: NF) => {
    if (!await confirmar({ titulo: `Remover ${n.codigo}?`, mensagem: 'A foto e os dados desta NF saem do envio.', confirmar: 'Remover', perigo: true })) return;
    const r = await executar(() => api(`${M}/notas/${n.id}`, { metodo: 'DELETE' }));
    if (!r.ok) avisar(r.erro, 'erro'); else setNotas((ns) => ns.filter((x) => x.id !== n.id));
  };
  const enviar = async () => {
    const r = await executar(() => api<{ enviadas: number }>(`${M}/enviar`, { metodo: 'POST', corpo: { notas: notas.map((n) => n.id) } }));
    if (!r.ok) { setErro(r.erro); return; }
    avisar(`${r.valor.enviadas} NF(s) enviada(s) à central`); setNotas([]); aoEnviado();
  };
  if (!cfg) return erro ? <Aviso texto={erro} /> : <Carregando />;
  const comAlerta = notas.filter((n) => n.alertas?.length).length;
  return (
    <View>
      {!!erro && <Aviso texto={erro} />}
      <Cartao estilo={{ marginBottom: 14 }}>
        <BotoesFoto aoEscolher={adicionar} comPdf desabilitado={subindo.length > 0} />
        <Text style={{ color: t.suave, fontSize: 13, marginTop: 10 }}>Uma foto (ou PDF) por nota fiscal. {cfg.ia.ativo ? 'Os dados são lidos automaticamente: confira antes de enviar.' : 'Preencha os dados de cada NF.'} Só os itens de semente de soja entram nos totais.</Text>
      </Cartao>
      {subindo.map((n) => <Cartao key={n} estilo={{ marginBottom: 12 }}><Text style={{ color: t.suave }}>Enviando {n}{cfg.ia.ativo ? ' e lendo a NF…' : '…'}</Text></Cartao>)}
      {notas.map((n, i) => <NFEditor key={n.id} cfg={cfg} nota={n} indice={i + 1} aoMudar={(x) => setNotas((ns) => ns.map((y) => (y.id === x.id ? x : y)))} aoRemover={() => remover(n)} />)}
      {!notas.length && !subindo.length && <Vazio icone="leaf-outline" titulo="Nenhuma NF ainda" texto="Tire uma foto ou escolha os arquivos acima." />}
      {notas.length > 0 && (
        <Cartao>
          <Text style={{ color: t.suave }}>{notas.length} nota(s) fiscal(is)</Text>
          <View style={{ marginTop: 8 }}><TotaisNF t={somar(notas)} /></View>
          {comAlerta > 0 && <Text style={{ color: t.aviso, marginTop: 8 }}>{comAlerta} NF(s) com alerta para a central</Text>}
          <Botao titulo="Enviar para a central" icone="send" onPress={enviar} carregando={ocupado} desabilitado={subindo.length > 0} estilo={{ marginTop: 12 }} />
          <Text style={{ color: t.suave, fontSize: 12.5, marginTop: 8 }}>Germinação não informada na NF usa {cfg.germinacao_padrao}%.</Text>
        </Cartao>
      )}
    </View>
  );
}

function Resumo({ n }: { n: NF }) {
  const t = useTema();
  const linha = (k: string, v?: string | null) => <View style={{ marginBottom: 6 }}><Text style={{ color: t.suave, fontSize: 12 }}>{k}</Text><Text style={{ color: t.texto }}>{v || '—'}</Text></View>;
  return (
    <View style={{ marginTop: 10 }}>
      {linha('Nº NF / série', `${n.numero_nf ?? '—'}${n.serie ? ` · série ${n.serie}` : ''}`)}{linha('Emissão', fmtData(n.data_emissao))}
      {linha('Emitente', [n.emitente_nome, n.emitente_doc_fmt].filter(Boolean).join(' · '))}{linha('Produtor', [n.produtor_nome, n.produtor_doc_fmt].filter(Boolean).join(' · '))}
      {linha('Município', `${n.municipio ?? ''}${n.uf ? ` - ${n.uf}` : ''}`)}{linha('Distrito', n.distrito)}{linha('Peso líquido', n.peso_liquido != null ? `${dec(n.peso_liquido)} kg` : '')}
      {linha('Chave de acesso', n.chave_acesso ? `${n.chave_acesso} ${n.chave_ok ? '✓ válida' : '✗ inválida'}` : '')}
      {n.itens.filter((i) => i.incluido).map((i, k) => (
        <View key={k} style={{ borderTopWidth: 0.5, borderTopColor: t.linha, paddingVertical: 8 }}>
          <Text style={{ color: t.texto, fontSize: 14 }}>{i.descricao}</Text>
          <Text style={{ color: t.suave, fontSize: 13 }}>{dec(i.quantidade)} {i.unidade} · {i.sementes_por_unidade ? `${int(i.sementes_por_unidade)} sem./un.` : 'sem sementes/unid.'} · germ. {dec(i.germinacao, 1)}%</Text>
          <Text style={{ color: t.texto, fontSize: 13 }}>Total {int(i.total_sementes)} · viáveis <Text style={{ fontWeight: '800' }}>{int(i.viaveis)}</Text></Text>
          {i.area_potencial != null && <Text style={{ color: t.texto, fontSize: 13 }}>Área <Text style={{ fontWeight: '800' }}>{dec(i.area_potencial)} ha</Text> · volume <Text style={{ fontWeight: '800' }}>{int(i.volume_potencial)} kg</Text></Text>}
        </View>
      ))}
      <View style={{ marginTop: 8 }}><TotaisNF t={n.totais} /></View>
    </View>
  );
}

function Minhas() {
  const t = useTema();
  const avisar = useAviso();
  const confirmar = useConfirmar();
  const { executar, ocupado } = useAcao();
  const [lista, setLista] = useState<NF[] | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const [sub, setSub] = useState<Record<number, NF>>({});
  const [subindo, setSubindo] = useState<number | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      const l = await api<NF[]>(`${M}/minhas`);
      setLista(l);
      const subs: Record<number, NF> = {};
      for (const n of l.filter((x) => x.substituta)) subs[n.id] = await api<NF>(`${M}/notas/${n.substituta}`);
      setSub(subs);
    } catch (x) { setErro(x instanceof Error ? x.message : 'Não foi possível carregar.'); }
  }, []);
  useFocusEffect(useCallback(() => { void carregar(); }, [carregar]));
  useEffect(() => { api<Config>(`${M}/config`).then(setCfg).catch(() => {}); }, []);

  const novaFoto = async (n: NF, fotos: FotoPronta[]) => {
    const f = fotos[0]; setSubindo(n.id);
    try { const s = await enviarArquivo<NF>(`${M}/notas?nome=${encodeURIComponent(f.nome)}&substitui=${n.id}`, f.uri, f.mime); setSub((x) => ({ ...x, [n.id]: s })); setAberta(n.id); avisar('Foto nova recebida. Confira os dados e reenvie.'); }
    catch (x) { avisar(x instanceof Error ? x.message : 'Não foi possível enviar.', 'erro'); } finally { setSubindo(null); }
  };
  const reenviar = async (s: NF) => { const r = await executar(() => api(`${M}/enviar`, { metodo: 'POST', corpo: { notas: [s.id] } })); if (!r.ok) avisar(r.erro, 'erro'); else { avisar('NF reenviada à central'); void carregar(); } };
  const descartar = async (n: NF, s: NF) => { const r = await executar(() => api(`${M}/notas/${s.id}`, { metodo: 'DELETE' })); if (!r.ok) avisar(r.erro, 'erro'); else setSub((x) => { const y = { ...x }; delete y[n.id]; return y; }); };
  const cancelar = async (n: NF) => {
    if (!await confirmar({ titulo: `Cancelar o envio da ${n.codigo}?`, mensagem: 'A central deixa de analisar esta NF.', confirmar: 'Cancelar envio', perigo: true })) return;
    const r = await executar(() => api(`${M}/notas/${n.id}/cancelar`, { metodo: 'POST', corpo: {} }));
    if (!r.ok) avisar(r.erro, 'erro'); else { avisar('NF cancelada'); void carregar(); }
  };

  if (!lista || !cfg) return erro ? <Aviso texto={erro} /> : <Carregando />;
  const visiveis = lista.filter((n) => n.status !== 'substituida');
  if (!visiveis.length) return <Vazio icone="document-text-outline" titulo="Nenhuma NF enviada" texto="Use a aba “Enviar” para mandar suas notas fiscais." />;
  return (
    <View>
      {visiveis.map((n) => {
        const s = sub[n.id];
        const open = aberta === n.id;
        return (
          <Cartao key={n.id} estilo={{ marginBottom: 12, borderColor: n.status === 'recusada' ? t.destaque : t.linha }}>
            <Pressable accessibilityRole="button" onPress={() => setAberta(open ? null : n.id)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <FotoAut caminho={arquivoUrl(n)} estilo={{ width: 52, height: 68, borderRadius: 8, backgroundColor: t.suaveFundo }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.texto, fontWeight: '800' }}>NF {n.numero_nf || '—'} · {n.produtor_nome || 'produtor?'}</Text>
                <Text style={{ color: t.suave, fontSize: 12.5 }}>{n.codigo} · emissão {fmtData(n.data_emissao)}</Text>
                <Text style={{ color: t.suave, fontSize: 12.5 }}>Sacos {dec(n.totais.quantidade)} · viáveis {int(n.totais.viaveis)}</Text>
                <View style={{ marginTop: 6 }}><Chip texto={ROTULO[n.status] ?? n.status} tom={TOM[n.status]} /></View>
              </View>
              <Icone nome={open ? 'chevron-down' : 'chevron-forward'} tamanho={20} cor={t.suave} />
            </Pressable>
            {n.status === 'recusada' && (
              <View style={{ marginTop: 12 }}>
                <Aviso texto={`Recusada: ${n.motivo_recusa ?? ''}`} />
                {!s && <><Text style={{ color: t.suave, fontSize: 13, marginBottom: 8 }}>Envie outra foto desta NF:</Text><BotoesFoto multiplas={false} aoEscolher={(f) => novaFoto(n, f)} desabilitado={subindo === n.id} /></>}
              </View>
            )}
            {!!n.obs_central && <Text style={{ color: t.texto, marginTop: 10 }}><Text style={{ fontWeight: '800' }}>Central: </Text>{n.obs_central}</Text>}
            {open && (
              <>
                <Resumo n={n} />
                <Text style={{ color: t.suave, fontSize: 12, marginTop: 8 }}>Enviada em {fmtDataHora(n.enviado_at)}</Text>
                {n.status === 'aguardando' && <Botao titulo="Cancelar envio" variante="perigo" icone="close-circle-outline" pequeno onPress={() => cancelar(n)} desabilitado={ocupado} estilo={{ marginTop: 10 }} />}
              </>
            )}
            {s && (
              <View style={{ marginTop: 14 }}>
                <Text style={{ color: t.suave, fontSize: 12.5, fontWeight: '700', marginBottom: 6 }}>NOVA FOTO PARA {n.codigo}</Text>
                <NFEditor cfg={cfg} nota={s} indice="nova" aoMudar={(x) => setSub((y) => ({ ...y, [n.id]: x }))} aoRemover={() => descartar(n, s)}
                  acao={<Botao titulo="Reenviar NF" icone="send" onPress={() => reenviar(s)} carregando={ocupado} estilo={{ marginTop: 12 }} />} />
              </View>
            )}
          </Cartao>
        );
      })}
    </View>
  );
}

export function Lista() {
  const nav = useNavigation<any>();
  const [aba, setAba] = useState<'enviar' | 'minhas'>('enviar');
  return (
    <Tela titulo="Nota NF" subtitulo="NFs de semente de soja" aoVoltar={() => nav.goBack()}>
      <Segmentos valor={aba} aoMudar={setAba} opcoes={[{ valor: 'enviar', rotulo: 'Enviar' }, { valor: 'minhas', rotulo: 'Minhas NFs' }]} />
      {aba === 'enviar' ? <Enviar aoEnviado={() => setAba('minhas')} /> : <Minhas />}
    </Tela>
  );
}