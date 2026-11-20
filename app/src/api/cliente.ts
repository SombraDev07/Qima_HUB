// Cliente da API do HUB. O app só fala com esta API (nunca direto com o banco).
// O token do aparelho vai no cabeçalho Authorization; erros viram mensagens em português.
export const URL_API = (process.env.EXPO_PUBLIC_API_URL ?? 'https://qima-hub.vercel.app').replace(/\/+$/, '');

export class ApiErro extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

let token: string | null = null;
let aoExpirar: (() => void) | null = null;
export const definirToken = (t: string | null) => { token = t; };
/** Cabeçalho para imagens e arquivos que o servidor só entrega a quem está logado. */
export const autorizacao = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});
export const registrarAoExpirar = (fn: (() => void) | null) => { aoExpirar = fn; };

type Opcoes = { metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; corpo?: unknown; tempoMs?: number; semToken?: boolean };

export async function api<T = unknown>(caminho: string, { metodo = 'GET', corpo, tempoMs = 20000, semToken = false }: Opcoes = {}): Promise<T> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), tempoMs);
  try {
    const r = await fetch(`${URL_API}${caminho}`, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token && !semToken ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: controle.signal,
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 && token && !semToken) aoExpirar?.();
      throw new ApiErro(dados?.error || `Erro ${r.status}`, r.status);
    }
    return dados as T;
  } catch (e) {
    if (e instanceof ApiErro) throw e;
    const abortou = (e as { name?: string })?.name === 'AbortError';
    throw new ApiErro(abortou ? 'A conexão demorou demais. Tente de novo.' : 'Sem conexão com o servidor. Confira a internet e tente de novo.', 0);
  } finally {
    clearTimeout(relogio);
  }
}

/** Envia um arquivo do aparelho (foto, planilha) como corpo cru, do jeito que as rotas de upload do HUB esperam. */
export async function enviarArquivo<T = unknown>(caminho: string, uri: string, mime: string, tempoMs = 90000): Promise<T> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), tempoMs);
  try {
    const blob = await (await fetch(uri)).blob();
    const r = await fetch(`${URL_API}${caminho}`, {
      method: 'POST', body: blob, signal: controle.signal,
      headers: { 'Content-Type': mime || 'application/octet-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 && token) aoExpirar?.();
      throw new ApiErro(dados?.error || (r.status === 413 ? 'O arquivo é grande demais.' : `Erro ${r.status}`), r.status);
    }
    return dados as T;
  } catch (e) {
    if (e instanceof ApiErro) throw e;
    const abortou = (e as { name?: string })?.name === 'AbortError';
    throw new ApiErro(abortou ? 'O envio demorou demais. Tente de novo com sinal melhor.' : 'Sem conexão com o servidor. Confira a internet e tente de novo.', 0);
  } finally { clearTimeout(relogio); }
}

// ---- tipos das respostas usadas pelo app
export type Sistema = {
  key: string;
  title: string;
  description: string;
  icon: string;
  labels: { solicitante: string; central: string };
  status: 'ativo' | 'em_breve';
  role: 'solicitante' | 'central' | 'ambos' | 'rtv';
  summary: string | null;
};
export type Eu = { user: { id: number; name: string; email: string; is_admin: boolean }; modules: Sistema[] };
export type Pendencia = { modulo: string; modulo_titulo: string; qtd: number; texto: string; central?: boolean };
export type Pendencias = { total: number; itens: Pendencia[] };
export type LoginApp = { token: string; expira_em: string };
export type Versao = { minima: string; manutencao: string | null };
