// Bloqueio do app por digital, rosto ou o PIN/padrão do próprio celular (opcional, ligado no Perfil).
// Pede ao abrir o app e ao voltar para ele depois de 2 minutos fora.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Botao } from '../ui';
import { SimboloQ } from '../ui/Marca';

const CHAVE = 'qima_bloqueio';
const FORA_MS = 2 * 60_000;

type Ctx = { ligado: boolean; disponivel: boolean; ligar: (v: boolean) => Promise<boolean> };
const C = createContext<Ctx>({ ligado: false, disponivel: false, ligar: async () => false });
export const useBloqueio = () => useContext(C);

const ler = async () => { try { return Platform.OS !== 'web' && (await SecureStore.getItemAsync(CHAVE)) === '1'; } catch { return false; } };

export function BloqueioProvider({ ativo, children }: { ativo: boolean; children: ReactNode }) {
  const [ligado, setLigado] = useState(false);
  const [disponivel, setDisponivel] = useState(false);
  const [travado, setTravado] = useState(false);
  const saiuEm = useRef<number | null>(null);

  const pedir = useCallback(async () => {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Desbloquear o QIMA HUB', cancelLabel: 'Cancelar', disableDeviceFallback: false });
    if (r.success) setTravado(false);
    return r.success;
  }, []);

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') return;
      const [hw, nivel] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.getEnrolledLevelAsync()]);
      setDisponivel(hw || nivel !== LocalAuthentication.SecurityLevel.NONE);
      const l = await ler();
      setLigado(l);
      if (l && ativo) setTravado(true);
    })().catch(() => {});
  }, [ativo]);

  useEffect(() => {
    if (travado) void pedir();
  }, [travado, pedir]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') saiuEm.current = Date.now();
      if (s === 'active' && ligado && ativo && saiuEm.current && Date.now() - saiuEm.current > FORA_MS) setTravado(true);
    });
    return () => sub.remove();
  }, [ligado, ativo]);

  const ligar = useCallback(async (v: boolean) => {
    if (v) {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirme para ligar o bloqueio' });
      if (!r.success) return false;
    }
    await SecureStore.setItemAsync(CHAVE, v ? '1' : '0');
    setLigado(v);
    return true;
  }, []);

  return (
    <C.Provider value={{ ligado, disponivel, ligar }}>
      {children}
      {travado && ativo && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <SimboloQ tamanho={72} />
          <Text style={{ fontSize: 22, fontWeight: '900', color: '#14232b', marginTop: 18 }}>App bloqueado</Text>
          <Text style={{ color: '#5b6b73', textAlign: 'center', marginTop: 6, marginBottom: 24 }}>Use a digital, o rosto ou o PIN do celular para continuar.</Text>
          <Botao titulo="Desbloquear" icone="finger-print" variante="destaque" onPress={() => { void pedir(); }} estilo={{ alignSelf: 'stretch' }} />
        </View>
      )}
    </C.Provider>
  );
}

/** Ao sair da conta o bloqueio é desligado (a próxima pessoa liga de novo se quiser). */
export async function desligarBloqueio() { try { await SecureStore.deleteItemAsync(CHAVE); } catch { /* nada */ } }
