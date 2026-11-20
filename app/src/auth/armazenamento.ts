// O token fica no armazenamento seguro do aparelho (Keystore do Android). No navegador (só para desenvolvimento) cai para localStorage.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CHAVE = 'qima_hub_token';

export async function lerToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(CHAVE) ?? null;
    return await SecureStore.getItemAsync(CHAVE);
  } catch { return null; }
}

export async function guardarToken(t: string): Promise<void> {
  if (Platform.OS === 'web') { globalThis.localStorage?.setItem(CHAVE, t); return; }
  await SecureStore.setItemAsync(CHAVE, t);
}

export async function apagarToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') { globalThis.localStorage?.removeItem(CHAVE); return; }
    await SecureStore.deleteItemAsync(CHAVE);
  } catch { /* nada a apagar */ }
}
