// Componentes visuais comuns do app. Alvos de toque de 48 dp, contraste alto, fonte que respeita o tamanho do sistema.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  View, type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { setStatusBarStyle } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { medida, useTema, type Tema } from '../tema';
import { fmtData, paraIso } from '../util/datas';

export type NomeIcone = keyof typeof Ionicons.glyphMap;
export const Icone = ({ nome, tamanho = 22, cor }: { nome: NomeIcone; tamanho?: number; cor?: string }) => {
  const t = useTema();
  return <Ionicons name={nome} size={tamanho} color={cor ?? t.texto} />;
};

// ------------------------------------------------------------------ estrutura de tela
/** Barra de cima da marca, com voltar, título e uma ação à direita. */
export function Cabecalho({ titulo, subtitulo, aoVoltar, direita }: { titulo: string; subtitulo?: string; aoVoltar?: () => void; direita?: ReactNode }) {
  const t = useTema();
  return (
    <View style={[e.cabecalho, { backgroundColor: t.marca, borderBottomWidth: 3, borderBottomColor: '#e4002b' }]}>
      {aoVoltar ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={aoVoltar} hitSlop={8} style={e.cabBotao}><Ionicons name="arrow-back" size={24} color="#fff" /></Pressable>
      ) : <View style={{ width: 8 }} />}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={e.cabTitulo}>{titulo}</Text>
        {!!subtitulo && <Text numberOfLines={1} style={e.cabSub}>{subtitulo}</Text>}
      </View>
      {direita}
    </View>
  );
}

/** Tela com a barra de cima, corpo rolável (puxar para atualizar) e rodapé fixo opcional. */
export function Tela({ titulo, subtitulo, aoVoltar, direita, children, rodape, aoAtualizar, atualizando = false, semRolagem = false }: {
  titulo: string; subtitulo?: string; aoVoltar?: () => void; direita?: ReactNode; children: ReactNode; rodape?: ReactNode;
  aoAtualizar?: () => void; atualizando?: boolean; semRolagem?: boolean;
}) {
  const t = useTema();
  useFocusEffect(useCallback(() => { setStatusBarStyle('light'); }, []));
  const corpo = semRolagem ? <View style={{ flex: 1 }}>{children}</View> : (
    <ScrollView contentContainerStyle={{ padding: medida.gutter, paddingBottom: 32 }} keyboardShouldPersistTaps="handled"
      refreshControl={aoAtualizar ? <RefreshControl refreshing={atualizando} onRefresh={aoAtualizar} /> : undefined}>
      {children}
    </ScrollView>
  );
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.marca }}>
      <Cabecalho titulo={titulo} subtitulo={subtitulo} aoVoltar={aoVoltar} direita={direita} />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.fundo }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {corpo}
        {rodape && <View style={[e.rodape, { backgroundColor: t.cartao, borderTopColor: t.linha }]}>{rodape}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const Secao = ({ titulo, direita }: { titulo: string; direita?: ReactNode }) => {
  const t = useTema();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 10 }}>
      <Text style={{ flex: 1, color: t.suave, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{titulo}</Text>
      {direita}
    </View>
  );
};

// ------------------------------------------------------------------ botões
export function Botao({ titulo, onPress, variante = 'principal', carregando = false, desabilitado = false, icone, estilo, pequeno = false }: {
  titulo: string; onPress: () => void; variante?: 'principal' | 'destaque' | 'contorno' | 'perigo' | 'suave'; carregando?: boolean; desabilitado?: boolean;
  icone?: NomeIcone; estilo?: StyleProp<ViewStyle>; pequeno?: boolean;
}) {
  const t = useTema();
  const off = desabilitado || carregando;
  const cor = variante === 'perigo' ? t.erro : variante === 'destaque' ? '#e4002b' : t.marca;
  const cheio = variante === 'principal' || variante === 'destaque';
  const fundo = cheio ? cor : variante === 'suave' ? t.suaveFundo : 'transparent';
  const frente = cheio ? t.sobreMarca : cor;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={titulo} accessibilityState={{ disabled: off, busy: carregando }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [e.botao, pequeno && e.botaoPeq, { backgroundColor: fundo, borderColor: variante === 'suave' ? 'transparent' : cor, opacity: off ? 0.5 : pressed ? 0.85 : 1 }, estilo]}
    >
      {carregando ? <ActivityIndicator color={frente} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          {icone && <Ionicons name={icone} size={pequeno ? 16 : 19} color={frente} style={{ marginRight: 7 }} />}
          <Text style={[e.botaoTexto, pequeno && { fontSize: 14 }, { color: frente }]}>{titulo}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function BotaoFlutuante({ titulo, icone = 'add', onPress }: { titulo: string; icone?: NomeIcone; onPress: () => void }) {
  const t = useTema();
  const ins = useSafeAreaInsets();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={titulo} onPress={onPress}
      style={({ pressed }) => [e.fab, { backgroundColor: t.destaque, bottom: 18 + (Platform.OS === 'web' ? 0 : ins.bottom * 0), opacity: pressed ? 0.9 : 1 }]}>
      <Ionicons name={icone} size={22} color="#fff" /><Text style={e.fabTexto}>{titulo}</Text>
    </Pressable>
  );
}

// ------------------------------------------------------------------ campos
export function Campo({ rotulo, erro, dica, multilinha, ...resto }: TextInputProps & { rotulo: string; erro?: string; dica?: string; multilinha?: boolean }) {
  const t = useTema();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[e.rotulo, { color: t.texto }]}>{rotulo}</Text>
      <TextInput
        accessibilityLabel={rotulo} placeholderTextColor={t.suave} multiline={multilinha} textAlignVertical={multilinha ? 'top' : 'center'}
        style={[e.campo, multilinha && { minHeight: 96, paddingTop: 12 }, { backgroundColor: t.campo, color: t.texto, borderColor: erro ? t.erro : t.linha }]}
        {...resto}
      />
      {!!dica && !erro && <Text style={{ color: t.suave, marginTop: 4, fontSize: 12.5 }}>{dica}</Text>}
      {!!erro && <Text style={{ color: t.erro, marginTop: 4, fontSize: 13 }}>{erro}</Text>}
    </View>
  );
}

/** Caixa que parece um campo e abre uma folha com as opções (melhor que o seletor do sistema em telas pequenas). */
export function CampoSelecao<V extends string>({ rotulo, valor, opcoes, aoMudar, dica }: {
  rotulo: string; valor: V | ''; opcoes: { valor: V; rotulo: string; detalhe?: string }[]; aoMudar: (v: V) => void; dica?: string;
}) {
  const t = useTema();
  const [aberto, setAberto] = useState(false);
  const atual = opcoes.find((o) => o.valor === valor);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[e.rotulo, { color: t.texto }]}>{rotulo}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${rotulo}: ${atual?.rotulo ?? 'escolher'}`} onPress={() => setAberto(true)}
        style={[e.campo, { backgroundColor: t.campo, borderColor: t.linha, flexDirection: 'row', alignItems: 'center' }]}>
        <Text style={{ flex: 1, color: atual ? t.texto : t.suave, fontSize: 16 }} numberOfLines={1}>{atual?.rotulo ?? 'Escolher'}</Text>
        <Ionicons name="chevron-down" size={20} color={t.suave} />
      </Pressable>
      {!!dica && <Text style={{ color: t.suave, marginTop: 4, fontSize: 12.5 }}>{dica}</Text>}
      <Folha aberto={aberto} titulo={rotulo} aoFechar={() => setAberto(false)}>
        {opcoes.map((o) => (
          <Pressable key={o.valor} accessibilityRole="button" onPress={() => { aoMudar(o.valor); setAberto(false); }} style={[e.opcao, { borderBottomColor: t.linha }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.texto, fontSize: 16, fontWeight: o.valor === valor ? '700' : '400' }}>{o.rotulo}</Text>
              {!!o.detalhe && <Text style={{ color: t.suave, fontSize: 13 }}>{o.detalhe}</Text>}
            </View>
            {o.valor === valor && <Ionicons name="checkmark" size={22} color={t.marca} />}
          </Pressable>
        ))}
      </Folha>
    </View>
  );
}

/** Escolha de um nome numa lista grande (ex.: motorista do banco de pessoas): abre a folha com busca. */
export function CampoBusca({ rotulo, valor, opcoes, aoMudar, dica, placeholder = 'Buscar pelo nome' }: {
  rotulo: string; valor: string; opcoes: string[]; aoMudar: (v: string) => void; dica?: string; placeholder?: string;
}) {
  const t = useTema();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const fora = !!valor && !opcoes.some((o) => o.toLowerCase() === valor.toLowerCase());
  const achados = useMemo(() => {
    const q = busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    return opcoes.filter((o) => !q || o.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q)).slice(0, 60);
  }, [opcoes, busca]);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[e.rotulo, { color: t.texto }]}>{rotulo}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${rotulo}: ${valor || 'escolher'}`} onPress={() => { setBusca(''); setAberto(true); }}
        style={[e.campo, { backgroundColor: t.campo, borderColor: fora ? t.erro : t.linha, flexDirection: 'row', alignItems: 'center' }]}>
        <Text style={{ flex: 1, color: valor ? t.texto : t.suave, fontSize: 16 }} numberOfLines={1}>{valor || 'Escolher'}</Text>
        <Ionicons name="search" size={20} color={t.suave} />
      </Pressable>
      {fora ? <Text style={{ color: t.erro, marginTop: 4, fontSize: 13 }}>Não está na lista: escolha um nome da lista.</Text>
        : !!dica && <Text style={{ color: t.suave, marginTop: 4, fontSize: 12.5 }}>{dica}</Text>}
      <Folha aberto={aberto} titulo={rotulo} aoFechar={() => setAberto(false)}>
        <TextInput accessibilityLabel={`Buscar ${rotulo}`} autoFocus value={busca} onChangeText={setBusca} placeholder={placeholder} placeholderTextColor={t.suave}
          style={[e.campo, { backgroundColor: t.campo, color: t.texto, borderColor: t.linha, marginBottom: 6 }]} />
        {!!valor && (
          <Pressable accessibilityRole="button" onPress={() => { aoMudar(''); setAberto(false); }} style={[e.opcao, { borderBottomColor: t.linha }]}>
            <Text style={{ flex: 1, color: t.suave, fontSize: 15 }}>Deixar em branco</Text>
          </Pressable>
        )}
        {achados.map((o) => (
          <Pressable key={o} accessibilityRole="button" onPress={() => { aoMudar(o); setAberto(false); }} style={[e.opcao, { borderBottomColor: t.linha }]}>
            <Text style={{ flex: 1, color: t.texto, fontSize: 16, fontWeight: o === valor ? '700' : '400' }}>{o}</Text>
            {o === valor && <Ionicons name="checkmark" size={22} color={t.marca} />}
          </Pressable>
        ))}
        {!achados.length && <Text style={{ color: t.suave, paddingVertical: 14 }}>Ninguém encontrado com esse nome.</Text>}
      </Folha>
    </View>
  );
}

/** Data AAAA-MM-DD. No Android abre o calendário do sistema; no navegador (só desenvolvimento) usa o campo de data. */
export function CampoData({ rotulo, valor, aoMudar, minimo, maximo, dica }: { rotulo: string; valor: string; aoMudar: (v: string) => void; minimo?: string; maximo?: string; dica?: string }) {
  const t = useTema();
  const [aberto, setAberto] = useState(false);
  const data = valor ? new Date(`${valor}T12:00:00`) : new Date();
  return (
    <View style={{ marginBottom: 14, flex: 1 }}>
      <Text style={[e.rotulo, { color: t.texto }]}>{rotulo}</Text>
      {Platform.OS === 'web' ? (
        // eslint-disable-next-line react-native/no-raw-text
        <input type="date" value={valor} min={minimo} max={maximo} onChange={(ev) => aoMudar(ev.target.value)}
          style={{ minHeight: medida.toque, borderRadius: 12, border: `1px solid ${t.linha}`, padding: '0 14px', fontSize: 16, background: t.campo, color: t.texto }} />
      ) : (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={`${rotulo}: ${valor ? fmtData(valor) : 'escolher'}`} onPress={() => setAberto(true)}
            style={[e.campo, { backgroundColor: t.campo, borderColor: t.linha, flexDirection: 'row', alignItems: 'center' }]}>
            <Text style={{ flex: 1, color: valor ? t.texto : t.suave, fontSize: 16 }}>{valor ? fmtData(valor) : 'Escolher data'}</Text>
            <Ionicons name="calendar-outline" size={20} color={t.suave} />
          </Pressable>
          {aberto && (
            <DateTimePicker value={data} mode="date" minimumDate={minimo ? new Date(`${minimo}T12:00:00`) : undefined} maximumDate={maximo ? new Date(`${maximo}T12:00:00`) : undefined}
              onChange={(ev, d) => { setAberto(false); if (ev.type === 'set' && d) aoMudar(paraIso(d)); }} />
          )}
        </>
      )}
      {!!dica && <Text style={{ color: t.suave, marginTop: 4, fontSize: 12.5 }}>{dica}</Text>}
    </View>
  );
}

// ------------------------------------------------------------------ cartões, listas, status
export function Cartao({ children, onPress, estilo }: { children: ReactNode; onPress?: () => void; estilo?: StyleProp<ViewStyle> }) {
  const t = useTema();
  const base: ViewStyle = { backgroundColor: t.cartao, borderColor: t.linha, borderWidth: StyleSheet.hairlineWidth, borderRadius: medida.raio, padding: 16 };
  if (!onPress) return <View style={[base, estilo]}>{children}</View>;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.92 : 1 }, estilo]}>{children}</Pressable>;
}

export type Tom = 'neutro' | 'info' | 'aviso' | 'ok' | 'marca' | 'erro';
const cores = (t: Tema, tom: Tom): [string, string] => ({
  neutro: [t.suaveFundo, t.suave], info: [t.infoFundo, t.info], aviso: [t.avisoFundo, t.aviso], ok: [t.okFundo, t.ok], marca: [t.destaqueFundo, t.destaque], erro: [t.erroFundo, t.erro],
} as Record<Tom, [string, string]>)[tom];
export function Chip({ texto, tom = 'neutro' }: { texto: string; tom?: Tom }) {
  const t = useTema();
  const [fundo, frente] = cores(t, tom);
  return <View style={{ backgroundColor: fundo, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}><Text style={{ color: frente, fontSize: 12, fontWeight: '700' }}>{texto}</Text></View>;
}

/** Linha de lista: título, linhas de detalhe, status à direita e seta. */
export function ItemLista({ titulo, linhas = [], chips, onPress, destaque }: { titulo: string; linhas?: string[]; chips?: ReactNode; onPress?: () => void; destaque?: string }) {
  const t = useTema();
  return (
    <Cartao onPress={onPress} estilo={{ marginBottom: 10, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <Text style={{ color: t.texto, fontSize: 16.5, fontWeight: '800' }}>{titulo}</Text>
            {!!destaque && <Text style={{ color: t.suave, fontSize: 13, marginLeft: 8 }}>{destaque}</Text>}
          </View>
          {linhas.filter(Boolean).map((l, i) => <Text key={i} style={{ color: t.suave, fontSize: 14, marginTop: 3 }}>{l}</Text>)}
          {chips && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>{chips}</View>}
        </View>
        {onPress && <Ionicons name="chevron-forward" size={20} color={t.suave} style={{ marginTop: 2 }} />}
      </View>
    </Cartao>
  );
}

export function Aviso({ texto, tipo = 'erro' }: { texto: string; tipo?: 'erro' | 'info' | 'ok' }) {
  const t = useTema();
  const [fundo, frente] = cores(t, tipo === 'erro' ? 'erro' : tipo === 'ok' ? 'ok' : 'info');
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: fundo, borderRadius: 12, padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'flex-start' }}>
      <Ionicons name={tipo === 'erro' ? 'alert-circle' : tipo === 'ok' ? 'checkmark-circle' : 'information-circle'} size={20} color={frente} style={{ marginRight: 8, marginTop: 1 }} />
      <Text style={{ color: frente, fontSize: 14, flex: 1 }}>{texto}</Text>
    </View>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  const t = useTema();
  return <View style={e.centro}><ActivityIndicator size="large" color={t.marca} /><Text style={{ color: t.suave, marginTop: 12 }}>{texto}</Text></View>;
}

export function Vazio({ titulo, texto, icone = 'file-tray-outline' }: { titulo: string; texto?: string; icone?: NomeIcone }) {
  const t = useTema();
  return (
    <View style={[e.centro, { paddingVertical: 48 }]}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.suaveFundo, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Ionicons name={icone} size={30} color={t.suave} /></View>
      <Text style={{ color: t.texto, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>{titulo}</Text>
      {!!texto && <Text style={{ color: t.suave, marginTop: 6, textAlign: 'center' }}>{texto}</Text>}
    </View>
  );
}

/** Abas dentro da tela (ex.: Pedidos | Hóspedes). */
export function Segmentos<V extends string>({ valor, opcoes, aoMudar }: { valor: V; opcoes: { valor: V; rotulo: string; qtd?: number }[]; aoMudar: (v: V) => void }) {
  const t = useTema();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.suaveFundo, borderRadius: 12, padding: 4, marginBottom: 14 }}>
      {opcoes.map((o) => (
        <Pressable key={o.valor} accessibilityRole="tab" accessibilityState={{ selected: valor === o.valor }} onPress={() => aoMudar(o.valor)}
          style={{ flex: 1, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: valor === o.valor ? t.cartao : 'transparent' }}>
          <Text style={{ color: valor === o.valor ? t.texto : t.suave, fontWeight: '700', fontSize: 14 }}>{o.rotulo}{o.qtd !== undefined ? ` (${o.qtd})` : ''}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ folha de baixo (opções, ajustes)
export function Folha({ aberto, titulo, aoFechar, children, rodape }: { aberto: boolean; titulo: string; aoFechar: () => void; children: ReactNode; rodape?: ReactNode }) {
  const t = useTema();
  return (
    <Modal visible={aberto} transparent animationType="slide" onRequestClose={aoFechar} statusBarTranslucent>
      <Pressable style={e.fundoModal} onPress={aoFechar} accessibilityLabel="Fechar" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={e.folhaPos} pointerEvents="box-none">
        <View style={[e.folha, { backgroundColor: t.cartao }]}>
          <View style={{ alignItems: 'center', paddingTop: 8 }}><View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.linha }} /></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8 }}>
            <Text style={{ flex: 1, color: t.texto, fontSize: 18, fontWeight: '800' }}>{titulo}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={aoFechar} hitSlop={10}><Ionicons name="close" size={24} color={t.suave} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 12 }}>{children}</ScrollView>
          {rodape && <View style={{ padding: 16, paddingTop: 8 }}>{rodape}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ------------------------------------------------------------------ confirmação e mensagem rápida (Alert do sistema não funciona no navegador)
type OpcoesConfirmar = { titulo: string; mensagem?: string; confirmar?: string; cancelar?: string; perigo?: boolean };
const CtxDialogos = createContext<{ confirmar: (o: OpcoesConfirmar) => Promise<boolean>; avisar: (texto: string, tom?: 'ok' | 'erro') => void } | null>(null);
export const useConfirmar = () => useContext(CtxDialogos)!.confirmar;
export const useAviso = () => useContext(CtxDialogos)!.avisar;

export function DialogosProvider({ children }: { children: ReactNode }) {
  const t = useTema();
  const [dlg, setDlg] = useState<(OpcoesConfirmar & { resolver: (v: boolean) => void }) | null>(null);
  const [msg, setMsg] = useState<{ texto: string; tom: 'ok' | 'erro'; id: number } | null>(null);
  const opac = useRef(new Animated.Value(0)).current;
  const confirmar = useCallback((o: OpcoesConfirmar) => new Promise<boolean>((resolver) => setDlg({ ...o, resolver })), []);
  const avisar = useCallback((texto: string, tom: 'ok' | 'erro' = 'ok') => setMsg({ texto, tom, id: Date.now() }), []);
  useEffect(() => {
    if (!msg) return undefined;
    Animated.timing(opac, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const h = setTimeout(() => Animated.timing(opac, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null)), msg.tom === 'erro' ? 4500 : 2600);
    return () => clearTimeout(h);
  }, [msg, opac]);
  const valor = useMemo(() => ({ confirmar, avisar }), [confirmar, avisar]);
  const fechar = (v: boolean) => { dlg?.resolver(v); setDlg(null); };
  return (
    <CtxDialogos.Provider value={valor}>
      {children}
      <Modal visible={!!dlg} transparent animationType="fade" onRequestClose={() => fechar(false)} statusBarTranslucent>
        <View style={[e.fundoModal, { justifyContent: 'center', padding: 24 }]}>
          <View style={{ backgroundColor: t.cartao, borderRadius: 18, padding: 20 }}>
            <Text style={{ color: t.texto, fontSize: 18, fontWeight: '800' }}>{dlg?.titulo}</Text>
            {!!dlg?.mensagem && <Text style={{ color: t.suave, fontSize: 15, marginTop: 8, lineHeight: 21 }}>{dlg.mensagem}</Text>}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Botao titulo={dlg?.cancelar ?? 'Voltar'} variante="contorno" onPress={() => fechar(false)} estilo={{ flex: 1 }} />
              <Botao titulo={dlg?.confirmar ?? 'Confirmar'} variante={dlg?.perigo ? 'perigo' : 'principal'} onPress={() => fechar(true)} estilo={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
      {msg && (
        <Animated.View pointerEvents="none" style={[e.toast, { opacity: opac, backgroundColor: msg.tom === 'erro' ? t.erro : '#0c303e' }]}>
          <Text style={{ color: '#fff', fontSize: 14.5, fontWeight: '600' }}>{msg.texto}</Text>
        </Animated.View>
      )}
    </CtxDialogos.Provider>
  );
}

// ------------------------------------------------------------------ lista com busca simples
export function ListaPlana<T>({ dados, renderizar, vazio, aoAtualizar, atualizando, cabecalho, chave }: {
  dados: T[]; renderizar: (item: T) => ReactNode; vazio: ReactNode; aoAtualizar?: () => void; atualizando?: boolean; cabecalho?: ReactNode; chave: (item: T) => string;
}) {
  return (
    <FlatList data={dados} keyExtractor={chave} renderItem={({ item }) => <>{renderizar(item)}</>} ListHeaderComponent={<>{cabecalho}</>} ListEmptyComponent={<>{vazio}</>}
      contentContainerStyle={{ padding: medida.gutter, paddingBottom: 110, flexGrow: 1 }} keyboardShouldPersistTaps="handled" initialNumToRender={12}
      refreshControl={aoAtualizar ? <RefreshControl refreshing={!!atualizando} onRefresh={aoAtualizar} /> : undefined} />
  );
}

const e = StyleSheet.create({
  cabecalho: { flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingRight: 12, paddingVertical: 8 },
  cabBotao: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cabTitulo: { color: '#fff', fontSize: 19, fontWeight: '800' },
  cabSub: { color: '#b9cbd3', fontSize: 13, marginTop: 1 },
  rodape: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10 },
  botao: { minHeight: medida.toque, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 10 },
  botaoPeq: { minHeight: 40, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12 },
  botaoTexto: { fontSize: 16, fontWeight: '800' },
  fab: { position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 28, paddingHorizontal: 20, height: 54, elevation: 5, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  fabTexto: { color: '#fff', fontSize: 16, fontWeight: '800' },
  rotulo: { fontSize: 13.5, fontWeight: '700', marginBottom: 6 },
  campo: { minHeight: medida.toque, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  opcao: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  fundoModal: { ...StyleSheet.absoluteFill as object, backgroundColor: 'rgba(0,0,0,0.45)' },
  folhaPos: { flex: 1, justifyContent: 'flex-end' },
  folha: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 8 },
  toast: { position: 'absolute', left: 20, right: 20, bottom: 96, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, elevation: 8 },
});

/** Aviso de rascunho recuperado (o formulário voltou com o que foi digitado antes). */
export function AvisoRascunho({ restaurado, aoDescartar }: { restaurado: boolean; aoDescartar: () => void }) {
  const t = useTema();
  if (!restaurado) return null;
  return (
    <View style={{ backgroundColor: t.infoFundo, borderRadius: 12, padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name="document-text-outline" size={20} color={t.info} />
      <Text style={{ color: t.info, flex: 1, fontSize: 14 }}>Recuperamos o que você tinha preenchido.</Text>
      <Pressable accessibilityRole="button" onPress={aoDescartar} hitSlop={8}><Text style={{ color: t.info, fontWeight: '800' }}>Começar do zero</Text></Pressable>
    </View>
  );
}
