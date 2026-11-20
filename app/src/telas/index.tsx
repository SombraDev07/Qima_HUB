// Telas do núcleo do app: entrar, início (sistemas), sistema sem telas ainda, pendências e perfil.
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { api, ApiErro, URL_API, type Sistema } from '../api/cliente';
import { useAuth, VERSAO_APP } from '../auth/AuthContext';
import { identidadeDe, sistemasApp } from '../sistemas/registro';
import { medida, useTema } from '../tema';
import { Aviso, Botao, Campo, Cartao, Chip, Icone, Secao, Tela, Vazio, useAviso, useConfirmar } from '../ui';
import { useAcao } from '../util/carregar';
import { AZUL_QIMA, MarcaHub, SimboloQ, VERMELHO_QIMA } from '../ui/Marca';

// ------------------------------------------------------------------ Login
export function Login() {
  const t = useTema();
  const { entrar } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState('');
  const { executar, ocupado } = useAcao();

  const enviar = async () => {
    setErro('');
    if (!email.trim() || !senha) { setErro('Informe o e-mail e a senha.'); return; }
    const r = await executar(() => entrar(email, senha));
    if (!r.ok) setErro(r.erro);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.cartao }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            {/* topo: o "Q" grande ao fundo e a marca QIMA | HUB como no site */}
            <View style={e.loginTopo}>
              <View pointerEvents="none" style={e.qFundo}><SimboloQ tamanho={300} cor={VERMELHO_QIMA} /></View>
              <View style={[e.selo, { backgroundColor: t.cartao }]}><SimboloQ tamanho={46} /></View>
              <MarcaHub largura={170} corHub={t.texto} />
              <Text style={{ color: t.suave, fontSize: 15, marginTop: 14, textAlign: 'center' }}>Todos os seus pedidos em um só lugar</Text>
            </View>
            <View style={e.faixa}><View style={{ flex: 3, backgroundColor: VERMELHO_QIMA }} /><View style={{ flex: 1, backgroundColor: AZUL_QIMA }} /></View>
            <View style={[e.loginForm, { backgroundColor: t.fundo }]}>
              <Text style={[e.titulo, { color: t.texto }]}>Entrar</Text>
              <Text style={{ color: t.suave, marginBottom: 18 }}>Use o mesmo e-mail e senha do site.</Text>
              {!!erro && <Aviso texto={erro} />}
              <Campo rotulo="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" returnKeyType="next" />
              <View>
                <Campo rotulo="Senha" value={senha} onChangeText={setSenha} secureTextEntry={!ver} autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={enviar} />
                <Pressable accessibilityRole="button" accessibilityLabel={ver ? 'Ocultar senha' : 'Mostrar senha'} onPress={() => setVer(!ver)} style={{ position: 'absolute', right: 6, top: 28, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Icone nome={ver ? 'eye-off-outline' : 'eye-outline'} tamanho={22} cor={t.suave} />
                </Pressable>
              </View>
              <Botao titulo="Entrar" variante="destaque" icone="log-in-outline" onPress={enviar} carregando={ocupado} />
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${URL_API}/esqueci-senha`)} style={{ alignItems: 'center', padding: 14, marginTop: 6 }}>
                <Text style={{ color: t.texto, fontWeight: '700', textDecorationLine: 'underline' }}>Esqueci minha senha</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Text style={{ color: t.suave, fontSize: 12, textAlign: 'center', marginTop: 24 }}>QIMA · app do Solicitante</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ------------------------------------------------------------------ Início
/** Resumo do sistema ("1 pendente(s) · 0 em uso") em linhas curtas, destacando as que têm número maior que zero. */
function Resumo({ texto, cor }: { texto: string; cor: string }) {
  const t = useTema();
  const partes = texto.split('·').map((x) => x.trim()).filter(Boolean).slice(0, 3);
  return (
    <View style={{ marginTop: 10, gap: 2 }}>
      {partes.map((p) => {
        const m = p.match(/^(\d+)\s*(.*)$/);
        const ativo = !!m && Number(m[1]) > 0;
        return (
          <Text key={p} numberOfLines={1} style={{ fontSize: 12.5, color: ativo ? t.texto : t.suave }}>
            {m ? <><Text style={{ fontWeight: '900', color: ativo ? cor : t.suave }}>{m[1]}</Text> {m[2]}</> : p}
          </Text>
        );
      })}
    </View>
  );
}

function Ladrilho({ s, aoAbrir }: { s: Sistema; aoAbrir: () => void }) {
  const t = useTema();
  const { cor, icone } = identidadeDe(s.key);
  const pronto = !!sistemasApp[s.key];
  return (
    <Cartao onPress={aoAbrir} estilo={[e.ladrilho, { borderColor: t.linha }]}>
      <View style={{ position: 'absolute', left: 0, top: 18, bottom: 18, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: cor }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: cor, alignItems: 'center', justifyContent: 'center' }}><Icone nome={icone} tamanho={22} cor="#fff" /></View>
        <Icone nome="arrow-forward-circle" tamanho={24} cor={t.linha} />
      </View>
      <Text style={{ color: t.texto, fontSize: 16, fontWeight: '800', marginTop: 12 }} numberOfLines={1}>{s.title}</Text>
      <Text style={{ color: t.suave, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{s.labels.solicitante}</Text>
      {pronto ? (!!s.summary && <Resumo texto={s.summary} cor={cor} />) : <View style={{ marginTop: 10 }}><Chip texto="Em breve no app" /></View>}
    </Cartao>
  );
}

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const hojeExtenso = () => { const d = new Date(); return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

export function Inicio() {
  const t = useTema();
  const nav = useNavigation<any>();
  const { usuario, sistemas, recarregar, totalPendencias } = useAuth();
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');

  const atualizar = useCallback(async () => {
    setAtualizando(true); setErro('');
    try { await recarregar(); } catch (x) { setErro(x instanceof ApiErro ? x.message : 'Não foi possível atualizar.'); } finally { setAtualizando(false); }
  }, [recarregar]);
  useFocusEffect(useCallback(() => { void atualizar(); }, [atualizar]));

  const abrir = (s: Sistema) => { const d = sistemasApp[s.key]; nav.navigate(d ? `${s.key}.${d.inicial}` : 'SistemaVazio', { chave: s.key }); };
  return (
    <View style={{ flex: 1, backgroundColor: t.cartao }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* barra da marca, como o topo do site: QIMA | HUB à esquerda, avatar à direita */}
        <View style={[e.barraMarca, { backgroundColor: t.cartao }]}>
          <MarcaHub largura={92} corHub={t.texto} />
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Perfil" onPress={() => nav.navigate('Perfil')} style={e.avatarQ}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{usuario?.name.trim()[0]?.toUpperCase()}</Text>
          </Pressable>
        </View>
        <View style={e.faixa}><View style={{ flex: 3, backgroundColor: VERMELHO_QIMA }} /><View style={{ flex: 1, backgroundColor: AZUL_QIMA }} /></View>
        <ScrollView style={{ backgroundColor: t.fundo }} contentContainerStyle={{ padding: medida.gutter, paddingTop: 18, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} colors={[VERMELHO_QIMA]} />}>
          {/* saudação com o "Q" da marca ao fundo */}
          <View style={[e.saudacao, { backgroundColor: AZUL_QIMA }]}>
            <View pointerEvents="none" style={{ position: 'absolute', right: -34, top: -30, opacity: 0.22 }}><SimboloQ tamanho={170} cor={VERMELHO_QIMA} /></View>
            <Text style={{ color: '#b9cbd3', fontSize: 13.5, textTransform: 'capitalize' }}>{hojeExtenso()}</Text>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 4 }} numberOfLines={1}>{saudacao()}, {usuario?.name.split(' ')[0]}</Text>
            <Text style={{ color: '#d6e3e8', fontSize: 14, marginTop: 4 }}>{sistemas.length} {sistemas.length === 1 ? 'sistema liberado' : 'sistemas liberados'} para você</Text>
          </View>
          {!!erro && <Aviso texto={erro} />}
          {totalPendencias > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => nav.navigate('Pedidos')} style={({ pressed }) => [e.pendencias, { opacity: pressed ? 0.9 : 1 }]}>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}><Icone nome="notifications" tamanho={21} cor="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{totalPendencias} {totalPendencias === 1 ? 'pendência' : 'pendências'}</Text>
                <Text style={{ color: '#ffe3e8', fontSize: 13 }}>Toque para ver o que precisa de você</Text>
              </View>
              <Icone nome="chevron-forward" tamanho={22} cor="#fff" />
            </Pressable>
          ) : (
            <View style={[e.emDia, { backgroundColor: t.okFundo }]}>
              <Icone nome="checkmark-circle" tamanho={20} cor={t.ok} />
              <Text style={{ color: t.ok, fontWeight: '700', marginLeft: 8 }}>Tudo em dia: nada precisa de você agora</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: VERMELHO_QIMA, marginRight: 8 }} />
            <Text style={{ color: t.texto, fontSize: 18, fontWeight: '900' }}>Seus sistemas</Text>
          </View>
          {!sistemas.length ? <Vazio icone="lock-closed-outline" titulo="Nenhum sistema liberado" texto="Peça à administração do HUB para liberar o seu acesso." /> : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {sistemas.map((s) => <Ladrilho key={s.key} s={s} aoAbrir={() => abrir(s)} />)}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ------------------------------------------------------------------ sistema que ainda não tem telas no app
export function SistemaVazio() {
  const t = useTema();
  const nav = useNavigation<any>();
  const { sistemas } = useAuth();
  const s = sistemas.find((x) => x.key === (useRoute().params as { chave: string }).chave);
  if (!s) return <Tela titulo="Sistema" aoVoltar={() => nav.goBack()}><Vazio titulo="Sistema não encontrado" /></Tela>;
  const { cor, icone } = identidadeDe(s.key);
  return (
    <Tela titulo={s.title} subtitulo={s.labels.solicitante} aoVoltar={() => nav.goBack()}>
      <View style={{ alignItems: 'center', paddingVertical: 20 }}>
        <View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: cor, alignItems: 'center', justifyContent: 'center' }}><Icone nome={icone} tamanho={42} cor="#fff" /></View>
        <Text style={{ color: t.suave, textAlign: 'center', marginTop: 16 }}>{s.description}</Text>
      </View>
      {!!s.summary && <Cartao estilo={{ marginBottom: 16 }}><Text style={{ color: cor, fontWeight: '800' }}>{s.summary}</Text></Cartao>}
      <Aviso tipo="info" texto="As telas deste sistema chegam nas próximas versões do app. Por enquanto, abra pelo site." />
      <Botao titulo="Abrir no site" icone="open-outline" onPress={() => Linking.openURL(`${URL_API}/m/${s.key}/solicitante`)} />
    </Tela>
  );
}

// ------------------------------------------------------------------ Pendências
export function PedidosTela() {
  const t = useTema();
  const nav = useNavigation<any>();
  const { pendencias, recarregar } = useAuth();
  const [atualizando, setAtualizando] = useState(false);
  const atualizar = useCallback(async () => { setAtualizando(true); try { await recarregar(); } catch { /* mantém o que já tem */ } finally { setAtualizando(false); } }, [recarregar]);
  useFocusEffect(useCallback(() => { void atualizar(); }, [atualizar]));
  const itens = pendencias.filter((i) => i.qtd > 0 && !i.central);
  return (
    <View style={{ flex: 1, backgroundColor: t.marca }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={e.topoInicio}><Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>Pendências</Text></View>
        <ScrollView style={{ backgroundColor: t.fundo, borderTopLeftRadius: 26, borderTopRightRadius: 26 }} contentContainerStyle={{ padding: medida.gutter, paddingTop: 20, flexGrow: 1 }} refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} />}>
          {!itens.length && <Vazio icone="checkmark-done-circle-outline" titulo="Tudo em dia" texto="Nenhum pedido seu precisa de ação agora." />}
          {itens.map((i, k) => {
            const { cor, icone } = identidadeDe(i.modulo);
            const d = sistemasApp[i.modulo];
            return (
              <Cartao key={`${i.modulo}-${k}`} onPress={() => nav.navigate('InicioAba', { screen: d ? `${i.modulo}.${d.inicial}` : 'SistemaVazio', params: { chave: i.modulo } })} estilo={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: cor, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}><Icone nome={icone} tamanho={21} cor="#fff" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.suave, fontSize: 12.5 }}>{i.modulo_titulo}</Text>
                  <Text style={{ color: t.texto, fontSize: 15.5, marginTop: 1 }}><Text style={{ fontWeight: '800', color: t.destaque }}>{i.qtd}</Text> {i.texto}</Text>
                </View>
                <Icone nome="chevron-forward" tamanho={20} cor={t.suave} />
              </Cartao>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ------------------------------------------------------------------ Perfil
export function PerfilTela() {
  const t = useTema();
  const { usuario, sair, sairDeTodos } = useAuth();
  const confirmar = useConfirmar();
  const avisar = useAviso();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [erro, setErro] = useState('');
  const { executar, ocupado } = useAcao();

  const trocar = async () => {
    setErro('');
    if (!atual || !nova) { setErro('Preencha a senha atual e a nova.'); return; }
    const r = await executar(() => api('/api/me/password', { metodo: 'POST', corpo: { current: atual, next: nova } }));
    if (!r.ok) { setErro(r.erro); return; }
    setAtual(''); setNova(''); avisar('Senha alterada. Os outros aparelhos foram desconectados.');
  };
  const sairTodos = async () => {
    if (!await confirmar({ titulo: 'Sair de todos os aparelhos?', mensagem: 'Você precisará entrar de novo neste e nos outros celulares e no site.', confirmar: 'Sair de todos', perigo: true })) return;
    const r = await executar(() => sairDeTodos());
    if (!r.ok) avisar(r.erro, 'erro');
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.marca }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={e.topoInicio}>
          <View style={[e.avatar, { width: 56, height: 56, borderRadius: 28, marginRight: 14 }]}><Text style={{ color: t.marca, fontWeight: '800', fontSize: 24 }}>{usuario?.name.trim()[0]?.toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}><Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }} numberOfLines={1}>{usuario?.name}</Text><Text style={{ color: '#b9cbd3', fontSize: 14 }} numberOfLines={1}>{usuario?.email}</Text></View>
        </View>
        <ScrollView style={{ backgroundColor: t.fundo, borderTopLeftRadius: 26, borderTopRightRadius: 26 }} contentContainerStyle={{ padding: medida.gutter, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Secao titulo="Trocar senha" />
          {!!erro && <Aviso texto={erro} />}
          <Campo rotulo="Senha atual" value={atual} onChangeText={setAtual} secureTextEntry autoComplete="current-password" />
          <Campo rotulo="Nova senha" dica="Mínimo de 8 caracteres" value={nova} onChangeText={setNova} secureTextEntry autoComplete="new-password" />
          <Botao titulo="Trocar senha" variante="contorno" onPress={trocar} carregando={ocupado} />
          <Secao titulo="Sessão" />
          <Botao titulo="Sair" icone="log-out-outline" onPress={sair} />
          <Botao titulo="Sair de todos os aparelhos" variante="perigo" onPress={sairTodos} estilo={{ marginTop: 12 }} />
          <Text style={{ color: t.suave, fontSize: 12, textAlign: 'center', marginTop: 26 }}>QIMA HUB · versão {VERSAO_APP}{'\n'}{URL_API}</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const sombra = { shadowColor: '#0c303e', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 };
const e = StyleSheet.create({
  loginTopo: { alignItems: 'center', paddingTop: 60, paddingBottom: 40, paddingHorizontal: 24, overflow: 'hidden' },
  qFundo: { position: 'absolute', right: -120, top: -90, opacity: 0.06 },
  selo: { width: 78, height: 78, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20, ...sombra, shadowOpacity: 0.14 },
  faixa: { flexDirection: 'row', height: 4 },
  loginForm: { flex: 1, padding: 24, paddingTop: 28 },
  barraMarca: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12 },
  avatarQ: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e4002b', alignItems: 'center', justifyContent: 'center' },
  saudacao: { borderRadius: 20, padding: 18, paddingVertical: 20, marginBottom: 14, overflow: 'hidden' },
  pendencias: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e4002b', borderRadius: 18, padding: 14, marginBottom: 20, ...sombra, shadowColor: '#e4002b', shadowOpacity: 0.25 },
  emDia: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 12, marginBottom: 20 },
  ladrilho: { width: '48.5%', marginBottom: 12, padding: 14, paddingLeft: 16, minHeight: 160, borderRadius: 18, overflow: 'hidden', ...sombra },
  titulo: { fontSize: 26, fontWeight: '800', marginBottom: 4 },
  topoInicio: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 22 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});