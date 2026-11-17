import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './shared/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, modules: [] });

  const refresh = useCallback(async () => {
    try {
      const me = await api('/api/me');
      setState({ loading: false, user: me.user, modules: me.modules });
    } catch {
      setState({ loading: false, user: null, modules: [] });
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUnauthorized = () => setState({ loading: false, user: null, modules: [] });
    window.addEventListener('qh:unauthorized', onUnauthorized);
    return () => window.removeEventListener('qh:unauthorized', onUnauthorized);
  }, [refresh]);

  const login = async (email, password) => {
    await api('/api/auth/login', { method: 'POST', body: { email, password } });
    await refresh();
  };

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setState({ loading: false, user: null, modules: [] });
  };

  return <AuthContext.Provider value={{ ...state, refresh, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
