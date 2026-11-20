// Datas no formato AAAA-MM-DD (o mesmo do servidor) e como mostrar para a pessoa (DD/MM/AAAA).
export const paraIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const hoje = () => paraIso(new Date());
export const somaDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return paraIso(d); };
export const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
export const fmtData = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
export const fmtCurta = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—');
/** Data e hora do servidor ("2026-11-17 14:03:00", em UTC) no horário do aparelho. */
export const fmtDataHora = (s?: string | null) => (s ? new Date(`${s.replace(' ', 'T')}Z`).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
export const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const dinheiro = (n: unknown) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** "39,90" | "1.234,5" | "39.9" → 39.9 (vazio vira null). */
export function parseValor(v: string): number | null {
  const s = v.trim().replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
}
export const valorTexto = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
