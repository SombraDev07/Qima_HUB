// Cidades do IBGE (lista local) e campo de busca de cidade com UF automática.
import { useMemo, useState } from 'react';
import municipios from './municipios.json';
import { norm } from './kit.jsx';

export const UFS = Object.keys(municipios);
const INDEX = Object.entries(municipios).flatMap(([uf, nomes]) => nomes.map((nome) => ({ nome, uf, k: norm(nome) })));

export const cidadeValida = (cidade, uf) => !!municipios[uf]?.some((n) => norm(n) === norm(cidade));
export const cidadeOficial = (cidade, uf) => municipios[uf]?.find((n) => norm(n) === norm(cidade)) || null;

/** Campo UF + cidade com sugestões. Ao escolher uma sugestão, a UF entra sozinha. */
export function CidadeInput({ cidade, uf, onChange, required, placeholder = 'Digite a cidade' }) {
  const [open, setOpen] = useState(false);
  const sugest = useMemo(() => {
    const k = norm(cidade);
    if (k.length < 2) return [];
    const starts = INDEX.filter((m) => m.k.startsWith(k));
    const inc = INDEX.filter((m) => !m.k.startsWith(k) && m.k.includes(k));
    return [...starts.sort((a, b) => (a.uf === uf ? -1 : 0) - (b.uf === uf ? -1 : 0)), ...inc].slice(0, 12);
  }, [cidade, uf]);
  const valida = !cidade || cidadeValida(cidade, uf);

  return (
    <div className="cid-input">
      <select value={uf} onChange={(e) => onChange({ cidade, uf: e.target.value })} aria-label="Estado">
        {UFS.map((u) => <option key={u}>{u}</option>)}
      </select>
      <div className="cid-combo">
        <input
          value={cidade} placeholder={placeholder} required={required} autoComplete="off"
          onChange={(e) => { onChange({ cidade: e.target.value, uf }); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className={valida ? '' : 'cid-invalid'}
        />
        {open && sugest.length > 0 && !cidadeValida(cidade, uf) && (
          <ul className="cid-sugest">
            {sugest.map((m) => (
              <li key={m.uf + m.nome} onMouseDown={() => { onChange({ cidade: m.nome, uf: m.uf }); setOpen(false); }}>
                {m.nome} <span className="muted">- {m.uf}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!valida && <span className="field-hint cid-err">Cidade não encontrada em {uf}</span>}
    </div>
  );
}
