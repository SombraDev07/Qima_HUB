// Notificações no celular (push). O servidor manda o mesmo aviso do e-mail para o aparelho.
// Funciona no app instalado (APK do EAS, com o projeto ligado ao EAS e ao Firebase). No Expo Go e no navegador fica desligado.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { api } from '../api/cliente';

const noExpoGo = Constants.executionEnvironment === 'storeClient';
const projetoEas: string | undefined = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
export const pushDisponivel = Platform.OS !== 'web' && !noExpoGo && !!projetoEas && Device.isDevice;

// carregado só quando dá para usar (no Expo Go o módulo de push do Android não existe mais)
const N = () => require('expo-notifications') as typeof import('expo-notifications');

/** Pede permissão e registra o aparelho no servidor. Silencioso se não der (sem permissão, Expo Go, sem projeto EAS). */
export async function registrarPush(): Promise<void> {
  if (!pushDisponivel) return;
  try {
    const n = N();
    if (Platform.OS === 'android') {
      await n.setNotificationChannelAsync('padrao', { name: 'Avisos do QIMA HUB', importance: n.AndroidImportance.HIGH, lightColor: '#e4002b' });
    }
    let { status } = await n.getPermissionsAsync();
    if (status !== 'granted') status = (await n.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const { data } = await n.getExpoPushTokenAsync({ projectId: projetoEas });
    await api('/api/app/push', { metodo: 'POST', corpo: { token: data } });
  } catch { /* sem push: o app segue normal */ }
}

/** Ao sair da conta. */
export async function removerPush(): Promise<void> {
  if (!pushDisponivel) return;
  try { await api('/api/app/push', { metodo: 'DELETE' }); } catch { /* o servidor apaga junto com o login */ }
}

/** Mostra o aviso mesmo com o app aberto e, ao tocar, abre o sistema do aviso. */
export function ouvirToques(abrirSistema: (modulo: string) => void): () => void {
  if (!pushDisponivel) return () => {};
  const n = N();
  n.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
  const sub = n.addNotificationResponseReceivedListener((r) => {
    const modulo = (r.notification.request.content.data as { modulo?: string } | undefined)?.modulo;
    if (modulo) abrirSistema(modulo);
  });
  return () => sub.remove();
}
