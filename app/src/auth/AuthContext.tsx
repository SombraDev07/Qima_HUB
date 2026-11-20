// Sessão do app: entrar, sair, restaurar o login guardado e carregar os sistemas do Solicitante.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { api, definirToken, registrarAoExpirar, type Eu, type LoginApp, type Pendencia, type Pendencias, type Sistema, type Versao } from '../api/cliente';
import { apagarToken, guardarToken, lerToken } from './armazenamento';

export const VERSAO_APP = Constants.expoConfig?.version ?? '1.0.0';

/** true se a versão "a" é menor que a "b" (formato 1.2.3). */
export function menorQue(a: string, b: string): boolean {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); }
  return false;
}

type Estado = {
  carregando: boolean;
  usuario: Eu['user'] | null;
  sistemas: Sistema[]; // só os que a pessoa pode usar no celular (Solicitante)
  pendencias: Pendencia[];
  totalPendencias: number;
  bloqueio: string | null; // "atualize o app" ou "em manutenção"
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  sairDeTodos: () => Promise<void>;
  recarregar: () => Promise<void>;
};

const Ctx = createContext<Estado | null>(null);
export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
};

/** No celular só existe o lado Solicitante: some o que está "em breve" e o perfil RTV (sem telas). */
const doCelular = (m: Sistema) => m.status === 'ativo' && m.role !== 'rtv';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [usuario, setUsuario] = useState<Eu['user'] | null>(null);
  const [sistemas, setSistemas] = useState<Sistema[]>([]);
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [bloqueio, setBloqueio] = useState<string | null>(null);

  const limpar = useCallback(async () => {
    definirToken(null);
    await apagarToken();
    setUsuario(null);
    setSistemas([]);
    setPendencias([]);
  }, []);

  const recarregar = useCallback(async () => {
    const eu = await api<Eu>('/api/me?lado=solicitante');
    setUsuario(eu.user);
    setSistemas(eu.modules.filter(doCelular));
    api<Pendencias>('/api/notificacoes?lado=solicitante').then((p) => setPendencias(p.itens.filter((i) => i.qtd > 0 && !i.central))).catch(() => {});
  }, []);

  useEffect(() => {
    registrarAoExpirar(() => { void limpar(); }); // token vencido ou revogado: volta para o login
    return () => registrarAoExpirar(null);
  }, [limpar]);

  useEffect(() => {
    (async () => {
      try {
        const v = await api<Versao>('/api/app/versao', { semToken: true, tempoMs: 8000 }).catch(() => null);
        if (v?.manutencao) setBloqueio(v.manutencao);
        else if (v && menorQue(VERSAO_APP, v.minima)) setBloqueio('Esta versão do app não é mais aceita. Instale a versão mais nova para continuar.');
        const t = await lerToken();
        if (t) { definirToken(t); await recarregar(); }
      } catch { /* sem rede ou token inválido: cai no login */ } finally { setCarregando(false); }
    })();
  }, [recarregar]);

  const entrar = useCallback(async (email: string, senha: string) => {
    const aparelho = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || 'Celular';
    const r = await api<LoginApp>('/api/auth/app/login', { metodo: 'POST', corpo: { email: email.trim(), password: senha, dispositivo: aparelho }, semToken: true });
    await guardarToken(r.token);
    definirToken(r.token);
    await recarregar();
  }, [recarregar]);

  const sair = useCallback(async () => {
    try { await api('/api/auth/app/logout', { metodo: 'POST', corpo: {} }); } catch { /* sem rede: sai assim mesmo */ }
    await limpar();
  }, [limpar]);

  const sairDeTodos = useCallback(async () => {
    await api('/api/auth/app/logout-all', { metodo: 'POST', corpo: {} });
    await limpar();
  }, [limpar]);

  const totalPendencias = useMemo(() => pendencias.reduce((s, p) => s + p.qtd, 0), [pendencias]);
  const valor = useMemo(() => ({ carregando, usuario, sistemas, pendencias, totalPendencias, bloqueio, entrar, sair, sairDeTodos, recarregar }), [carregando, usuario, sistemas, pendencias, totalPendencias, bloqueio, entrar, sair, sairDeTodos, recarregar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
