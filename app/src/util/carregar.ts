// Carrega dados de uma tela: mostra "carregando", guarda o erro e permite puxar para atualizar.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiErro } from '../api/cliente';

export function useCarregar<T>(buscar: () => Promise<T>, dependencias: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState('');
  const [atualizando, setAtualizando] = useState(false);
  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;
  const recarregar = useCallback(async () => {
    setAtualizando(true); setErro('');
    try { setDados(await buscarRef.current()); } catch (x) { setErro(x instanceof ApiErro ? x.message : 'Não foi possível carregar.'); } finally { setAtualizando(false); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void recarregar(); }, dependencias);
  return { dados, erro, atualizando, recarregar, definir: setDados };
}

/** Roda uma ação (enviar, cancelar…) mostrando "ocupado" e devolvendo o erro em português. */
export function useAcao() {
  const [ocupado, setOcupado] = useState(false);
  const executar = useCallback(async <R,>(fn: () => Promise<R>): Promise<{ ok: true; valor: R } | { ok: false; erro: string }> => {
    setOcupado(true);
    try { return { ok: true, valor: await fn() }; } catch (x) { return { ok: false, erro: x instanceof ApiErro ? x.message : 'Não foi possível concluir. Tente de novo.' }; } finally { setOcupado(false); }
  }, []);
  return { ocupado, executar };
}