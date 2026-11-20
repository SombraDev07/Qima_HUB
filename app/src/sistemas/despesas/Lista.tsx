import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api, enviarArquivo } from '../../api/cliente';
import { useTema } from '../../tema';
import { Aviso, Botao, Campo, CampoSelecao, Carregando, Cartao, Chip, ItemLista, Secao, Segmentos, Tela, Vazio, useAviso, useConfirmar } from '../../ui';
import { BotoesFoto } from '../../ui/BotoesFoto';
import { FotoAut } from '../../ui/FotoAut';
import { useAcao } from '../../util/carregar';
import { dinheiro, fmtData, fmtDataHora } from '../../util/datas';
import type { FotoPronta } from '../../util/foto';
import { NotaEditor } from './NotaEditor';
import { ROTULO_PEDIDO, TOM_PEDIDO, arquivoUrl, type Config, type Nota, type Pedido } from './tipos';

const M = '/api/m/despesas';

function NovoPedido() {
  const nav = useNavigation<any>();
  const t = useTema();
  const avisar = useAviso();
  const confirmar = useConfirmar();
  const { executar, ocupado } = useAcao();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [enviando, setEnviando] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [reemb, setReemb] = useState({ centro_custo: '', pix_tipo: 'CPF', pix_chave: '', obs: '' });

  useEffect(() => {
    api<Config>(`${M}/config`).then((c) => { setCfg(c); setReemb((r) => ({ ...r, centro_custo: c.perfil.centro_custo || c.centros[0], pix_tipo: c.perfil.pix_tipo || 'CPF', pix_chave: c.perfil.pix_chave || '' })); }).catch((x) => setErro(x.message));
    api<Nota[]>(`${M}/rascunhos`).then(setNotas).catch(() => {});
  }, []);

  const adicionar = async (fotos: FotoPronta[]) => {
    setErro('');
    for (const f of fotos) {
      setEnviando((e) => [...e, f.nome]);
      try { const n = await enviarArquivo<Nota>(`${M}/notas?nome=${encodeURIComponent(f.nome)}`, f.uri, f.mime); setNotas((ns) => [...ns, n]); }
      catch (x) { avisar(x instanceof Error ? x.message : 'Não foi possível enviar a foto.', 'erro'); } finally { setEnviando((e) => e.filter((n) => n !== f.nome)); }
    }
  };
  const remover = async (n: Nota) => {
    if (!await confirmar({ titulo: `Remover ${n.codigo}?`, mensagem: 'A foto e os dados desta nota saem do pedido.', confirmar: 'Remover', perigo: true })) return;
    const r = await executar(() => api(`${M}/notas/${n.id}`, { metodo: 'DELETE' }));
    if (!r.ok) { avisar(r.erro, 'erro'); return; }
    setNotas((ns) => ns.filter((x) => x.id !== n.id));
  };
  const centroTodas = async (c: string) => {
    setReemb((r) => ({ ...r, centro_custo: c }));
    const r = await executar(() => Promise.all(notas.map((n) => api<Nota>(`${M}/notas/${n.id}`, { metodo: 'PATCH', corpo: { centro_custo: c } }))));
    if (r.ok) setNotas(r.valor);
  };
  const enviar = async () => {
    setErro('');
    const r = await executar(() => api<{ id: number; codigo: string }>(`${M}/pedidos`, { metodo: 'POST', corpo: { notas: notas.map((n) => n.id), ...reemb } }));
    if (!r.ok) { setErro(r.erro); return; }
    avisar(`Pedido ${r.valor.codigo} enviado à central`); setNotas([]); nav.navigate('despesas.Pedido', { id: r.valor.id });
  };

  if (!cfg) return erro ? <Aviso texto={erro} /> : <Carregando />;
  const total = notas.reduce((s, n) => s + (n.valor || 0), 0);
  const comAlerta = notas.filter((n) => n.alertas?.length).length;
  return (
    <View>
      {!!erro && <Aviso texto={erro} />}
      <Cartao estilo={{ marginBottom: 14 }}>
        <BotoesFoto aoEscolher={adicionar} comPdf desabilitado={enviando.length > 0} />
        <Text style={{ color: t.suave, fontSize: 13, marginTop: 10 }}>Tire uma foto por nota ou escolha várias. {cfg.ia.ativo ? 'Os campos são preenchidos pela IA: confira antes de enviar.' : 'Preencha valor, data e tipo de cada nota.'}</Text>
      </Cartao>
      {enviando.map((n) => <Cartao key={n} estilo={{ marginBottom: 12 }}><Text style={{ color: t.suave }}>Enviando {n}{cfg.ia.ativo ? ' e lendo a nota…' : '…'}</Text></Cartao>)}
      {notas.map((n, i) => <NotaEditor key={n.id} cfg={cfg} nota={n} indice={i + 1} aoMudar={(x) => setNotas((ns) => ns.map((y) => (y.id === x.id ? x : y)))} aoRemover={() => remover(n)} />)}
      {!notas.length && !enviando.length && <Vazio icone="receipt-outline" titulo="Nenhuma nota ainda" texto="Tire uma foto ou escolha os arquivos acima." />}

      {notas.length > 0 && (
        <>
          <Secao titulo="Dados do reembolso" />
          <Campo rotulo="Colaborador" value={cfg.colaborador} editable={false} />
          <CampoSelecao rotulo="Centro de custo (vale para todas)" valor={reemb.centro_custo} opcoes={cfg.centros.map((c) => ({ valor: c, rotulo: c }))} aoMudar={centroTodas} />
          <CampoSelecao rotulo="PIX · tipo da chave" valor={reemb.pix_tipo} opcoes={cfg.pix_tipos.map((c) => ({ valor: c, rotulo: c }))} aoMudar={(v) => setReemb({ ...reemb, pix_tipo: v })} />
          <Campo rotulo="Chave PIX" value={reemb.pix_chave} onChangeText={(v) => setReemb({ ...reemb, pix_chave: v })} autoCapitalize="none"
            placeholder={({ CPF: '000.000.000-00', CNPJ: '00.000.000/0000-00', 'E-mail': 'nome@exemplo.com', Telefone: '(00) 00000-0000' } as Record<string, string>)[reemb.pix_tipo] ?? ''} />
          <Campo rotulo="Observação para a central (opcional)" value={reemb.obs} onChangeText={(v) => setReemb({ ...reemb, obs: v })} multilinha />
          <Cartao estilo={{ marginTop: 6 }}>
            <Text style={{ color: t.suave }}>{notas.length} nota(s)</Text>
            <Text style={{ color: t.texto, fontSize: 24, fontWeight: '800' }}>{dinheiro(total)}</Text>
            {comAlerta > 0 && <Text style={{ color: t.aviso, marginTop: 2 }}>{comAlerta} com alerta para a central</Text>}
            <Botao titulo="Enviar pedido" icone="send" onPress={enviar} carregando={ocupado} desabilitado={enviando.length > 0} estilo={{ marginTop: 12 }} />
          </Cartao>
        </>
      )}
    </View>
  );
}

function MeusPedidos() {
  const nav = useNavigation<any>();
  const [lista, setLista] = useState<Pedido[] | null>(null);
  const [erro, setErro] = useState('');
  useFocusEffect(useCallback(() => { api<Pedido[]>(`${M}/meus`).then(setLista).catch((x) => setErro(x.message)); }, []));
  if (lista === null) return erro ? <Aviso texto={erro} /> : <Carregando />;
  if (!lista.length) return <Vazio icone="cash-outline" titulo="Nenhum pedido enviado" texto="Use a aba “Novo pedido” para pedir um reembolso." />;
  return (
    <View>
      {lista.map((p) => {
        const ativas = p.notas.filter((n) => ['aguardando', 'ok', 'recusada'].includes(n.status));
        const recusadas = ativas.filter((n) => n.status === 'recusada').length;
        return (
          <ItemLista key={p.id} titulo={p.codigo} destaque={fmtDataHora(p.created_at)} onPress={() => nav.navigate('despesas.Pedido', { id: p.id })}
            linhas={[`${ativas.length} nota(s)${recusadas ? ` · ${recusadas} recusada(s)` : ''} · declarado ${dinheiro(p.total_declarado)}`, p.status === 'aguardando' ? '' : `Aprovado ${dinheiro(p.total_aprovado)}`, p.obs_central ? `Central: ${p.obs_central}` : '']}
            chips={<><Chip texto={ROTULO_PEDIDO[p.status] ?? p.status} tom={TOM_PEDIDO[p.status]} />{!!p.pago_em && <Chip texto={`Pago em ${fmtData(p.pago_em)}`} tom="ok" />}</>} />
        );
      })}
    </View>
  );
}

export function Lista() {
  const nav = useNavigation<any>();
  const [aba, setAba] = useState<'novo' | 'meus'>('novo');
  return (
    <Tela titulo="Despesas" subtitulo="Reembolso com foto da nota" aoVoltar={() => nav.goBack()}>
      <Segmentos valor={aba} aoMudar={setAba} opcoes={[{ valor: 'novo', rotulo: 'Novo pedido' }, { valor: 'meus', rotulo: 'Meus pedidos' }]} />
      {aba === 'novo' ? <NovoPedido /> : <MeusPedidos />}
    </Tela>
  );
}