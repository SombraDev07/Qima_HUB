// Fila de fotos do Frotas: foto tirada sem sinal fica guardada no aparelho e sobe sozinha quando a internet volta.
// Cada foto leva a data, a hora e o GPS do momento do clique (não do envio). Guarda no máximo 3 dias (o servidor recusa mais velhas).
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { ApiErro, enviarArquivo } from '../api/cliente';
import { apagarArquivo, gravarJson, guardarArquivo, lerJson } from './armazem';

export type ItemFila = {
  id: string; veiculoId: number; angulo: string; rotulo: string; arquivo: string; qs: string; criado: number; erro?: string;
};
const NOME = 'fila-fotos';
const MAX_MS = 3 * 86400_000;

let itens: ItemFila[] = lerJson<ItemFila[]>(NOME, []);
const ouvintes = new Set<(l: ItemFila[]) => void>();
const avisar = () => { void gravarJson(NOME, itens); ouvintes.forEach((f) => f(itens)); };

export async function enfileirar(dados: Omit<ItemFila, 'id' | 'arquivo' | 'criado'>, uriTemporario: string) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const arquivo = await guardarArquivo(uriTemporario, `fila-${id}.jpg`);
  itens = [...itens, { ...dados, id, arquivo, criado: Date.now() }];
  avisar();
  agendar();
}

export function descartar(id: string) {
  const x = itens.find((i) => i.id === id);
  if (x) apagarArquivo(x.arquivo);
  itens = itens.filter((i) => i.id !== id);
  avisar();
}

let rodando = false;
/** Tenta enviar tudo. Para no primeiro erro de rede (sem sinal); erro do servidor fica marcado no item. */
export async function processarFila(): Promise<{ enviadas: number; restantes: number }> {
  if (rodando) return { enviadas: 0, restantes: itens.length };
  rodando = true;
  let enviadas = 0;
  try {
    for (const x of [...itens]) {
      if (Date.now() - x.criado > MAX_MS) { descartar(x.id); continue; }
      if (x.erro) continue;
      try {
        await enviarArquivo(`/api/m/frotas/veiculos/${x.veiculoId}/fotos?${x.qs}`, x.arquivo, 'image/jpeg');
        apagarArquivo(x.arquivo);
        itens = itens.filter((i) => i.id !== x.id); enviadas++; avisar();
      } catch (e) {
        if (e instanceof ApiErro && e.status === 0) break; // sem rede: tenta depois
        if (e instanceof ApiErro && e.status === 401) break; // saiu da conta / token vencido
        itens = itens.map((i) => (i.id === x.id ? { ...i, erro: e instanceof Error ? e.message : 'Não foi aceita pelo servidor.' } : i));
        avisar();
      }
    }
  } finally { rodando = false; }
  return { enviadas, restantes: itens.length };
}

/** Tentar de novo um item que o servidor recusou (ex.: depois de acertar o relógio). */
export function tentarDeNovo(id: string) { itens = itens.map((i) => (i.id === id ? { ...i, erro: undefined } : i)); avisar(); void processarFila(); }

let relogio: ReturnType<typeof setInterval> | null = null;
function agendar() {
  if (relogio || !itens.length) return;
  relogio = setInterval(() => {
    if (!itens.some((i) => !i.erro)) { clearInterval(relogio!); relogio = null; return; }
    void processarFila();
  }, 60_000);
}

/** Liga a fila: tenta ao abrir o app, ao voltar para ele e a cada minuto enquanto houver fotos pendentes. */
export function iniciarFila() {
  void processarFila(); agendar();
  const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { void processarFila(); agendar(); } });
  return () => { sub.remove(); if (relogio) { clearInterval(relogio); relogio = null; } };
}

/** Ao sair da conta. */
export function esvaziarFila() { itens.forEach((i) => apagarArquivo(i.arquivo)); itens = []; avisar(); }
export const pendentesNaFila = () => itens.length;

export function useFila() {
  const [l, setL] = useState(itens);
  useEffect(() => { ouvintes.add(setL); setL(itens); return () => { ouvintes.delete(setL); }; }, []);
  return l;
}
