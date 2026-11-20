import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { BloqueioProvider } from './src/auth/Bloqueio';
import { Navegacao } from './src/nav';
import { DialogosProvider } from './src/ui';

function ComBloqueio() {
  const { usuario } = useAuth();
  return (
    <BloqueioProvider ativo={!!usuario}>
      <Navegacao />
      <StatusBar style="light" />
    </BloqueioProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <DialogosProvider>
        <AuthProvider>
          <ComBloqueio />
        </AuthProvider>
      </DialogosProvider>
    </SafeAreaProvider>
  );
}
