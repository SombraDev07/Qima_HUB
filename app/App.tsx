import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { Navegacao } from './src/nav';
import { DialogosProvider } from './src/ui';

export default function App() {
  return (
    <SafeAreaProvider>
      <DialogosProvider>
        <AuthProvider>
          <Navegacao />
          <StatusBar style="light" />
        </AuthProvider>
      </DialogosProvider>
    </SafeAreaProvider>
  );
}