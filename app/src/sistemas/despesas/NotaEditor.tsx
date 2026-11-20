import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '../../api/cliente';
import { useTema } from '../../tema';
import { Campo, CampoData, CampoSelecao, Cartao, Chip, Icone } from '../../ui';
import { FotoAut } from '../../ui/FotoAut';
import { diasEntre, dinheiro, fmtData, hoje, parseValor, valorTexto } from '../../util/datas';
import { arquivoUrl, type Config, type Nota } from './tipos';

const M = '/api/m/despesas';

/** Uma nota em rascunho: foto + campos. Salva sozinho meio segundo depois de a pessoa parar de digitar. */
export function NotaEditor({ cfg, nota, indice, aoMudar, aoRemover, acao }: { cfg: Config; nota: Nota; indice: number | string; aoMudar: (n: Nota) => void; aoRemover?: () => void; acao?: ReactNode }) {
  const t = useTema();
  const [f, setF] = useState({
    valor: valorTexto(nota.valor), data: nota.data ?? '', tipo: nota.tipo ?? '', centro_custo: nota.centro_custo ?? '', motivo: nota.motivo ?? '',
    emitente: nota.emitente ?? '', cnpj: nota.cnpj_fmt ?? '', numero_nf: nota.numero_nf ?? '',
  });
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;

  // mudança vinda de fora ("centro de custo vale para todas")
  useEffect(() => { if (nota.centro_custo && nota.centro_custo !== f.centro_custo) setF((x) => ({ ...x, centro_custo: nota.centro_custo! })); }, [nota.centro_custo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);

  const set = (k: keyof typeof f, v: string) => {
    const novo = { ...f, [k]: v };
    if (k === 'tipo' && (!f.motivo || f.motivo.startsWith(f.tipo))) novo.motivo = `${v}${novo.emitente ? ` - ${novo.emitente}` : ''}`;
    setF(novo);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSalvando(true); setErro('');
      try { aoMudarRef.current(await api<Nota>(`${M}/notas/${nota.id}`, { metodo: 'PATCH', corpo: { ...novo, valor: parseValor(novo.valor) } })); }
      catch (x) { setErro(x instanceof Error ? x.message : 'Não foi possível salvar.'); } finally { setSalvando(false); }
    }, 500);
  };

  const ia = nota.ia_status === 'ok';
  const dias = f.data ? diasEntre(f.data, hoje()) : 0;
  const antiga = !!f.data && dias > cfg.dias_limite;
  const alertas = (nota.alertas ?? []).filter((a) => !['data_antiga', 'data_futura', 'sem_data', 'sem_valor'].includes(a.tipo));
  return (
    <Cartao estilo={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <FotoAut caminho={arquivoUrl(nota)} estilo={{ width: 84, height: 112, borderRadius: 10, backgroundColor: t.suaveFundo }} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: t.texto, fontWeight: '800', fontSize: 16 }}>Nota {indice}</Text>
            {aoRemover && <Pressable accessibilityRole="button" accessibilityLabel="Remover nota" onPress={aoRemover} hitSlop={10}><Icone nome="trash-outline" tamanho={22} cor={t.erro} /></Pressable>}
          </View>
          <Text style={{ color: t.suave, fontSize: 12.5 }}>{nota.codigo}{f.emitente ? ` · ${f.emitente}` : ''}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {ia && <Chip texto="Preenchido pela IA" tom="info" />}
            {salvando && <Chip texto="Salvando…" />}
          </View>
        </View>
      </View>
      <View style={{ height: 14 }} />
      <Campo rotulo="Valor (R$)" value={f.valor} onChangeText={(v) => set('valor', v)} keyboardType="decimal-pad" placeholder="0,00" dica={ia && nota.ia_valor != null ? `Lido pela IA: ${dinheiro(nota.ia_valor)}` : undefined} />
      <CampoData rotulo="Data da despesa" valor={f.data} maximo={hoje()} aoMudar={(v) => set('data', v)} dica={ia && nota.ia_data ? `Lido pela IA: ${fmtData(nota.ia_data)}` : undefined} />
      {antiga && <Text style={{ color: t.aviso, marginTop: -8, marginBottom: 12, fontSize: 13 }}>Data antiga (há {dias} dias). A central vai validar.</Text>}
      <CampoSelecao rotulo="Tipo de despesa" valor={f.tipo} opcoes={cfg.tipos.map((x) => ({ valor: x, rotulo: x }))} aoMudar={(v) => set('tipo', v)} />
      <CampoSelecao rotulo="Centro de custo" valor={f.centro_custo} opcoes={cfg.centros.map((x) => ({ valor: x, rotulo: x }))} aoMudar={(v) => set('centro_custo', v)} />
      <Campo rotulo="Motivo" value={f.motivo} onChangeText={(v) => set('motivo', v)} placeholder="Ex.: Almoço da equipe em Cuiabá" />
      {alertas.map((a) => <View key={a.tipo} style={{ marginBottom: 8 }}><Chip texto={a.texto} tom={a.tipo === 'duplicada' ? 'erro' : 'aviso'} /></View>)}
      <Pressable accessibilityRole="button" onPress={() => setAberto(!aberto)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
        <Icone nome={aberto ? 'chevron-down' : 'chevron-forward'} tamanho={18} cor={t.suave} />
        <Text style={{ color: t.texto, fontWeight: '700', marginLeft: 6 }}>Dados da nota fiscal</Text>
      </Pressable>
      {aberto && (
        <>
          <Campo rotulo="Emitente" value={f.emitente} onChangeText={(v) => set('emitente', v)} />
          <Campo rotulo="CNPJ" value={f.cnpj} onChangeText={(v) => set('cnpj', v)} keyboardType="number-pad" />
          <Campo rotulo="Número da NF" value={f.numero_nf} onChangeText={(v) => set('numero_nf', v)} keyboardType="number-pad" />
        </>
      )}
      {!!erro && <Text style={{ color: t.erro, fontSize: 13 }}>{erro}</Text>}
      {acao}
    </Cartao>
  );
}