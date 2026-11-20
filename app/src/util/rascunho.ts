// Rascunho automático: o que a pessoa digita num formulário novo fica guardado no aparelho.
// Se o app fechar no meio, o formulário volta preenchido. Apagado ao enviar, ao descartar ou ao sair da conta.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apagarJson, gravarJson, lerJson } from './armazem';

/**
 * chave: um nome por formulário (ex.: 'hospedagens-novo'). ativo: false quando está editando algo que já existe.
 * aplicar recebe o rascunho guardado ao abrir. Devolve se restaurou e funções para descartar/limpar.
 */
export function useRascunhoLocal<T>(chave: string, valor: T, aplicar: (v: T) => void, ativo: boolean) {
  const [restaurado, setRestaurado] = useState(false);
  const pronto = useRef(false);
  const inicial = useRef(valor);
  const nome = `rascunho-${chave}`;

  useEffect(() => {
    if (!ativo) return;
    const salvo = lerJson<{ v: T; em: number } | null>(nome, null);
    if (salvo && Date.now() - salvo.em < 14 * 86400_000) { aplicar(salvo.v); setRestaurado(true); }
    pronto.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, nome]);

  // "base" = o formulário como abriu (inclusive os valores padrão que chegam do servidor no primeiro segundo).
  // Só guarda quando a pessoa mudou algo em relação a ela.
  const montado = useRef(Date.now());
  const base = useRef<string | null>(null);
  useEffect(() => {
    if (!ativo || !pronto.current) return undefined;
    const atual = JSON.stringify(valor);
    if (!restaurado && Date.now() - montado.current < 1500) { base.current = atual; return undefined; }
    const h = setTimeout(() => {
      if (atual === base.current) apagarJson(nome);
      else void gravarJson(nome, { v: valor, em: Date.now() });
    }, 700);
    return () => clearTimeout(h);
  }, [valor, ativo, nome, restaurado]);

  const limpar = useCallback(() => { pronto.current = false; apagarJson(nome); setRestaurado(false); }, [nome]);
  /** "Começar do zero": volta o formulário ao início e continua guardando dali em diante. */
  const descartar = useCallback(() => { apagarJson(nome); aplicar(inicial.current); setRestaurado(false); }, [nome, aplicar]);
  return { restaurado, limpar, descartar };
}
