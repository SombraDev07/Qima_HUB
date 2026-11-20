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
    <View style={{ flex: 1, backgroundColor: t.marca }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            <View style={e.loginTopo}>
              <View style={e.logo}><Icone nome="apps" tamanho={30} cor="#fff" /></View>
              <Text style={e.logoTexto}>QIMA HUB</Text>
              <Text style={{ color: '#b9cbd3', fontSize: 15, marginTop: 6, textAlign: 'center' }}>Todos os seus pedidos em um só lugar</Text>
            </View>
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
              <Botao titulo="Entrar" onPress={enviar} carregando={ocupado} />
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${URL_API}/esqueci-senha`)} style={{ alignItems: 'center', padding: 14, marginTop: 6 }}>
                <Text style={{ color: t.marca === '#0c303e' ? '#1d6a85' : t.marca, fontWeight: '700' }}>Esqueci minha senha</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ------------------------------------------------------------------ Início
function Ladrilho({ s, aoAbrir }: { s: Sistema; aoAbrir: () => void }) {
  const t = useTema();
  const { cor, icone } = identidadeDe(s.key);
  const pronto = !!sistemasApp[s.key];
  return (
    <Cartao onPress={aoAbrir} estilo={{ width: '48.5%', marginBottom: 12, padding: 14, minHeight: 156 }}>
      <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: cor, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Icone nome={icone} tamanho={24} cor="#fff" /></View>
      <Text style={{ color: t.texto, fontSize: 16.5, fontWeight: '800' }} numberOfLines={1}>{s.title}</Text>
      <Text style={{ color: t.suave, fontSize: 12.5, marginTop: 3 }} numberOfLines={1}>{s.labels.solicitante}</Text>
      <View style={{ flex: 1 }} />
      {pronto ? (!!s.summary && <Text style={{ color: cor, fontWeight: '700', fontSize: 12.5, marginTop: 8 }} numberOfLines={2}>{s.summary}</Text>) : <View style={{ marginTop: 8 }}><Chip texto="Em breve no app" /></View>}
    </Cartao>
  );
}

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
    <View style={{ flex: 1, backgroundColor: t.marca }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={e.topoInicio}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#b9cbd3', fontSize: 14 }}>Olá,</Text>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }} numberOfLines={1}>{usuario?.name.split(' ')[0]}</Text>
          </View>
          <View style={e.avatar}><Text style={{ color: t.marca, fontWeight: '800', fontSize: 18 }}>{usuario?.name.trim()[0]?.toUpperCase()}</Text></View>
        </View>
        <ScrollView style={{ backgroundColor: t.fundo, borderTopLeftRadius: 26, borderTopRightRadius: 26 }} contentContainerStyle={{ padding: medida.gutter, paddingTop: 20, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} />}>
          {!!erro && <Aviso texto={erro} />}
          {totalPendencias > 0 && (
            <Cartao onPress={() => nav.navigate('Pedidos')} estilo={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, borderColor: t.destaque }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.destaqueFundo, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}><Icone nome="notifications" tamanho={20} cor={t.destaque} /></View>
              <View style={{ flex: 1 }}><Text style={{ color: t.texto, fontWeight: '800', fontSize: 15 }}>{totalPendencias} {totalPendencias === 1 ? 'pendência' : 'pendências'}</Text><Text style={{ color: t.suave, fontSize: 13 }}>Toque para ver o que precisa de você</Text></View>
              <Icone nome="chevron-forward" tamanho={20} cor={t.suave} />
            </Cartao>
          )}
          <Text style={{ color: t.texto, fontSize: 18, fontWeight: '800', marginBottom: 12 }}>Seus sistemas</Text>
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

const e = StyleSheet.create({
  loginTopo: { alignItems: 'center', paddingTop: 56, paddingBottom: 40, paddingHorizontal: 24 },
  logo: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  logoTexto: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: 3 },
  loginForm: { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 28 },
  titulo: { fontSize: 26, fontWeight: '800', marginBottom: 4 },
  topoInicio: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 22 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});