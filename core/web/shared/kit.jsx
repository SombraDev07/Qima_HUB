// Utilitários de tela usados por todos os sistemas (toast, modal, formatação, filtros, CSV).
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

// ------------------------------------------------------------------ formatação
export const fmtDate = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
export const fmtShort = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—');
export const money = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const num = (n) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export const fmtDateTime = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
/** "39,90" | "1.234,5" | 39.9 → 39.9 */
export const parseMoney = (v) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  const n = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return Number(n) || 0;
};

// ------------------------------------------------------------------ CPF
/** Máscara progressiva enquanto digita: só números, no máximo 11 → 000.000.000-00 */
export function maskCpf(v) {
  const d = String(v ?? '').replace(/\D/g, '').slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}
export const fmtCpf = (v) => (String(v ?? '').replace(/\D/g, '').length === 11 ? maskCpf(v) : String(v ?? ''));
export function cpfValido(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

// ------------------------------------------------------------------ toast
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const timer = useRef();
  const show = useCallback((text, kind = 'ok') => {
    clearTimeout(timer.current);
    setMsg({ text, kind });
    timer.current = setTimeout(() => setMsg(null), kind === 'erro' ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className={`kit-toast kit-toast-${msg.kind}`} role="status" onClick={() => setMsg(null)}>{msg.text}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Executa uma ação da API mostrando toast de erro/sucesso. Retorna [run, busy]. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, okMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      window.dispatchEvent(new Event('qh:atualizar')); // ex.: sininho recarrega as pendências
      return r ?? true;
    } catch (e) {
      toast(e.message, 'erro');
      return null;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return [run, busy];
}

// ------------------------------------------------------------------ modal
/** wide = 900px; wide={1200} (número) = largura máxima em px. */
export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { maxWidth: typeof wide === 'number' ? wide : 900 } : undefined}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ filtro select com "Todos"
export function FiltroSelect({ label, value, onChange, options }) {
  return (
    <label className="kit-filtro">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </label>
  );
}

/** Exporta linhas para CSV (abre no Excel com acentuação correta). */
export function exportCsv(nome, colunas, linhas) {
  const esc = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    // CSV injection: texto começando com = + - @ vira fórmula no Excel. O apóstrofo força texto (números negativos ficam como estão).
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [colunas.map((c) => esc(c.label)).join(';'), ...linhas.map((l) => colunas.map((c) => esc(c.get(l))).join(';'))].join('\r\n');
  baixarBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), nome);
}

export function baixarBlob(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
