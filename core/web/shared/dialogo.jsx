// Janelas de confirmação e de pergunta no visual do HUB (substituem confirm/prompt do navegador).
// Uso:
//   const confirmar = useConfirm();
//   if (await confirmar({ titulo: 'Excluir CT-0001?', mensagem: 'Não pode ser desfeito.', confirmar: 'Excluir', perigo: true })) …
//   const perguntar = usePrompt();
//   const motivo = await perguntar({ titulo: 'Recusar', label: 'Motivo', obrigatorio: true });  // null = cancelou
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

const Ctx = createContext(null);

export function DialogProvider({ children }) {
  const [d, setD] = useState(null);
  const [valor, setValor] = useState('');
  const okRef = useRef();
  const inputRef = useRef();

  const abrir = useCallback((opts) => new Promise((resolve) => {
    setValor(opts.valor || '');
    setD({ ...opts, resolve });
  }), []);

  const fechar = (resultado) => {
    d?.resolve(resultado);
    setD(null);
  };
  const confirmar = () => {
    if (d.tipo === 'prompt') {
      if (d.obrigatorio && !valor.trim()) return inputRef.current?.focus();
      fechar(valor.trim());
    } else fechar(true);
  };

  useEffect(() => {
    if (!d) return undefined;
    const t = setTimeout(() => (d.tipo === 'prompt' ? inputRef.current : okRef.current)?.focus(), 30);
    const k = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); fechar(d.tipo === 'prompt' ? null : false); }
      if (e.key === 'Enter' && d.tipo !== 'prompt') { e.preventDefault(); confirmar(); }
    };
    window.addEventListener('keydown', k, true);
    return () => { clearTimeout(t); window.removeEventListener('keydown', k, true); };
  });

  return (
    <Ctx.Provider value={abrir}>
      {children}
      {d && (
        <div className="dlg-backdrop" onMouseDown={(e) => e.target === e.currentTarget && fechar(d.tipo === 'prompt' ? null : false)}>
          <div className={`dlg ${d.perigo ? 'dlg-perigo' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="dlg-titulo">
            <div className="dlg-icone">{d.perigo ? <AlertTriangle size={22} /> : <HelpCircle size={22} />}</div>
            <div className="dlg-corpo">
              <h3 id="dlg-titulo">{d.titulo}</h3>
              {d.mensagem && <p>{d.mensagem}</p>}
              {d.tipo === 'prompt' && (
                <label className="field">
                  {d.label && <span className="field-label">{d.label}{d.obrigatorio ? '' : ' (opcional)'}</span>}
                  <textarea ref={inputRef} rows={3} value={valor} placeholder={d.placeholder || ''} onChange={(e) => setValor(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) confirmar(); }} />
                </label>
              )}
            </div>
            <div className="dlg-acoes">
              <button type="button" className="btn btn-outline" onClick={() => fechar(d.tipo === 'prompt' ? null : false)}>{d.cancelar || 'Cancelar'}</button>
              <button type="button" ref={okRef} className={`btn ${d.perigo ? 'btn-perigo' : 'btn-primary'}`} onClick={confirmar}
                disabled={d.tipo === 'prompt' && d.obrigatorio && !valor.trim()}>{d.confirmar || 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

const normal = (o) => (typeof o === 'string' ? { titulo: o } : o);
/** Retorna (opções) => Promise<boolean> */
export function useConfirm() {
  const abrir = useContext(Ctx);
  return useCallback((o) => abrir({ tipo: 'confirm', ...normal(o) }), [abrir]);
}
/** Retorna (opções) => Promise<string | null> (null = cancelou) */
export function usePrompt() {
  const abrir = useContext(Ctx);
  return useCallback((o) => abrir({ tipo: 'prompt', ...normal(o) }), [abrir]);
}
