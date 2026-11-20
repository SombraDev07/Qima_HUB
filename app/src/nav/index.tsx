// Navegação: sem login mostra a tela de entrar; com login, 3 abas (Início, Pendências, Perfil).
// Cada sistema registra as próprias telas como "<sistema>.<Tela>" na pilha do Início.
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { useColorScheme } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { sistemasApp } from '../sistemas/registro';
import { useTema } from '../tema';
import { Carregando, Icone, Vazio } from '../ui';
import { Inicio, Login, PedidosTela, PerfilTela, SistemaVazio } from '../telas';

const Pilha = createNativeStackNavigator();
const Abas = createBottomTabNavigator();

function InicioPilha() {
  return (
    <Pilha.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Pilha.Screen name="Inicio" component={Inicio} />
      <Pilha.Screen name="SistemaVazio" component={SistemaVazio} />
      {Object.entries(sistemasApp).flatMap(([chave, s]) => Object.entries(s.telas).map(([nome, Componente]) => (
        <Pilha.Screen key={`${chave}.${nome}`} name={`${chave}.${nome}`} component={Componente} />
      )))}
    </Pilha.Navigator>
  );
}

function Principal() {
  const t = useTema();
  const { totalPendencias } = useAuth();
  return (
    <Abas.Navigator screenOptions={{
      headerShown: false, tabBarActiveTintColor: t.marca === '#0c303e' && t.fundo !== '#f3f6f7' ? '#8ab8f5' : '#0c303e', tabBarInactiveTintColor: t.suave,
      tabBarStyle: { backgroundColor: t.cartao, borderTopColor: t.linha, height: 62, paddingTop: 6, paddingBottom: 8 }, tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
    }}>
      <Abas.Screen name="InicioAba" component={InicioPilha} options={{ title: 'Início', tabBarIcon: ({ color, focused }) => <Icone nome={focused ? 'home' : 'home-outline'} tamanho={24} cor={color} /> }} />
      <Abas.Screen name="Pedidos" component={PedidosTela} options={{ title: 'Pendências', tabBarBadge: totalPendencias > 0 ? totalPendencias : undefined, tabBarBadgeStyle: { backgroundColor: t.destaque }, tabBarIcon: ({ color, focused }) => <Icone nome={focused ? 'notifications' : 'notifications-outline'} tamanho={24} cor={color} /> }} />
      <Abas.Screen name="Perfil" component={PerfilTela} options={{ title: 'Perfil', tabBarIcon: ({ color, focused }) => <Icone nome={focused ? 'person' : 'person-outline'} tamanho={24} cor={color} /> }} />
    </Abas.Navigator>
  );
}

export function Navegacao() {
  const { carregando, usuario, bloqueio } = useAuth();
  const esquema = useColorScheme();
  if (carregando) return <Carregando />;
  if (bloqueio) return <Vazio icone="construct-outline" titulo="App indisponível" texto={bloqueio} />;
  return (
    <NavigationContainer theme={esquema === 'dark' ? DarkTheme : DefaultTheme}>
      {usuario ? <Principal /> : <Login />}
    </NavigationContainer>
  );
}