// Peças usadas pelas duas áreas do sistema Horas de Auditoria.
import { useEffect, useRef, useState } from 'react';
import { money, num } from '@hub';

export const MODS = ['2/4H', '2/4HE', '8H', '8HE'];
const GRUPO_A = ['2/4H', '2/4HE'];
const GRUPO_B = ['8H', '8HE'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const clone = (o) => JSON.parse(JSON.stringify(o));
export const n0 = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const r2 = (v) => Math.round(n0(v) * 100) / 100;

/** "28/dez", "04/jan"… das semanas do planejamento. */
export function semanasDe(plano) {
  const [y, m, d] = plano.inicio.split('-').map(Number);
  return Array.from({ length: plano.semanas }, (_, i) => { const x = new Date(y, m - 1, d + 7 * i); return `${String(x.getDate()).padStart(2, '0')}/${MESES[x.getMonth()]}`; });
}

/** Mesma conta da planilha e do servidor. */
export function calcular(plano, horas, prog) {
  const W = plano.semanas, k = n0(plano.horas_por_auditor) || 44;
  const h = (m, w) => n0(horas?.[m]?.[w]);
  const r = { tot: Array(W).fill(0), mod: {}, horas: 0, budget: 0, audA: [], audB: [], audTot: [], vecTot: [] };
  for (const m of MODS) {
    let s = 0;
    for (let w = 0; w < W; w++) { s += h(m, w); r.tot[w] += h(m, w); }
    r.mod[m] = { horas: r2(s), budget: r2(s * n0(plano.taxas[m])) };
    r.horas += s; r.budget += s * n0(plano.taxas[m]);
  }
  for (let w = 0; w < W; w++) {
    const a = GRUPO_A.reduce((s, m) => s + h(m, w), 0), b = GRUPO_B.reduce((s, m) => s + h(m, w), 0);
    r.audA[w] = Math.ceil(a / k - 1e-9); r.audB[w] = Math.ceil(b / k - 1e-9);
    r.audTot[w] = r.audA[w] + r.audB[w];
    r.vecTot[w] = Math.ceil(r.audA[w] / (n0(plano.aud_veic_a) || 1) - 1e-9) + Math.ceil(r.audB[w] / (n0(plano.aud_veic_b) || 1) - 1e-9);
  }
  r.horas = r2(r.horas); r.budget = r2(r.budget); r.prog = r2(prog);
  r.dif = r2(r.prog - r.budget);
  r.picoAud = Math.max(0, ...r.audTot); r.picoVec = Math.max(0, ...r.vecTot);
  return r;
}

export const celulasMudadas = (plano, a, b) => {
  let n = 0;
  for (const m of MODS) for (let w = 0; w < plano.semanas; w++) if (r2(a?.[m]?.[w]) !== r2(b?.[m]?.[w])) n++;
  return n;
};

/** "Falta R$ x" / "Passou R$ x" / "Ok" — a coluna DIFERENÇA da planilha. */
export function Diferenca({ dif, prog }) {
  if (!n0(prog) && !n0(dif)) return <span className="ha-pill ha-p-cinza">sem budget programado</span>;
  const c = r2(dif);
  if (c > 0) return <span className="ha-pill ha-p-verm">Falta {money(c)}</span>;
  if (c < 0) return <span className="ha-pill ha-p-verm">Passou {money(-c)}</span>;
  return <span className="ha-pill ha-p-verde">Ok</span>;
}

const ST = {
  aprovada: ['verde', 'Aprovado'], rascunho: ['azul', 'Rascunho · não enviado'], pendente: ['laranja', 'Aguardando aprovação'], reprovado: ['verm', 'Reprovado · ajuste e reenvie'],
};
export function statusDe(d) {
  if (!d.aberta) return 'aprovada';
  if (d.aberta.status === 'rascunho' && d.aberta.motivo) return 'reprovado';
  return d.aberta.status;
}
export function Status({ s }) { const [cor, txt] = ST[s] || ['cinza', s]; return <span className={`ha-pill ha-p-${cor}`}>{txt}</span>; }
export const Pill = ({ cor = 'cinza', children }) => <span className={`ha-pill ha-p-${cor}`}>{children}</span>;

export function Kpi({ rotulo, valor, detalhe, tom }) {
  return <div className={`ha-kpi ${tom ? `ha-kpi-${tom}` : ''}`}><div className="ha-kpi-r">{rotulo}</div><div className="ha-kpi-v">{valor}</div>{detalhe && <div className="ha-kpi-d">{detalhe}</div>}</div>;
}

/** Variação "+58" / "−1.200,00" com cor (aumento de horas/budget = laranja, redução = verde). */
export function Delta({ a, b, fmt = num, subir = 'ruim' }) {
  const x = r2(n0(b) - n0(a));
  if (!x) return <span className="muted">sem mudança</span>;
  const ruim = (x > 0) === (subir === 'ruim');
  return <span className={ruim ? 'ha-up' : 'ha-dn'}>{x > 0 ? '+' : '−'}{fmt(Math.abs(x))}</span>;
}

// ---------------------------------------------------------------- célula de horas (aceita vírgula, não perde o cursor)
function Celula({ value, onCommit, disabled, mudou }) {
  const [txt, setTxt] = useState(value == null ? '' : String(value).replace('.', ','));
  const foco = useRef(false);
  useEffect(() => { if (!foco.current) setTxt(value == null ? '' : String(value).replace('.', ',')); }, [value]);
  return (
    <input className={`ha-cel ${mudou ? 'ha-cel-mud' : ''}`} inputMode="decimal" value={txt} disabled={disabled}
      onFocus={(e) => { foco.current = true; e.target.select(); }} onBlur={() => { foco.current = false; setTxt(value == null ? '' : String(value).replace('.', ',')); }}
      onChange={(e) => {
        const t = e.target.value;
        if (!/^\d{0,5}([.,]\d{0,2})?$/.test(t)) return;
        setTxt(t);
        onCommit(t === '' ? null : Number(t.replace(',', '.')));
      }} />
  );
}

function corCurva(v, max) { if (!max || !v) return undefined; const t = Math.min(1, v / max); return { background: `hsl(${Math.round(125 - 125 * t)} 70% ${Math.round(80 - 9 * t)}%)` }; }

/**
 * Grade de horas de um distrito: 4 módulos × semanas, com total, curva, budget, auditores e veículos.
 * onChange(mod, semana, valor) só é usado quando não é somente leitura.
 */
export function GradeHoras({ plano, horas, prog, comparar, onChange, disabled }) {
  const c = calcular(plano, horas, prog), ws = semanasDe(plano), maxCurva = Math.max(0, ...c.tot.map((x) => (c.horas ? x / c.horas : 0)));
  return (
    <div className="ha-wrap">
      <table className="ha-grade">
        <thead>
          <tr className="ha-datas"><th className="ha-c1" />{ws.map((x, i) => <th key={i}>{x}</th>)}<th colSpan={3} /></tr>
          <tr><th className="ha-c1">Módulo</th>{ws.map((_, i) => <th key={i}>SEM {i + 1}</th>)}<th>Total h</th><th>R$/h</th><th>Budget</th></tr>
        </thead>
        <tbody>
          {MODS.map((m) => (
            <tr key={m}>
              <td className="ha-c1"><b>{m}</b></td>
              {ws.map((_, w) => (
                <td key={w}>{disabled && !onChange
                  ? <span className={comparar && r2(comparar[m]?.[w]) !== r2(horas[m]?.[w]) ? 'ha-mud' : ''}>{horas[m]?.[w] ? num(horas[m][w]) : ''}</span>
                  : <Celula value={horas[m]?.[w] ?? null} disabled={disabled} mudou={comparar && r2(comparar[m]?.[w]) !== r2(horas[m]?.[w])} onCommit={(v) => onChange(m, w, v)} />}</td>
              ))}
              <td><b>{num(c.mod[m].horas)}</b></td><td className="muted">{num(plano.taxas[m])}</td><td className="ha-num">{money(c.mod[m].budget)}</td>
            </tr>
          ))}
          <tr className="ha-tot"><td className="ha-c1">TOTAL</td>{c.tot.map((x, i) => <td key={i}>{x ? num(x) : 0}</td>)}<td>{num(c.horas)}</td><td /><td className="ha-num">{money(c.budget)}</td></tr>
          <tr className="ha-curva"><td className="ha-c1">CURVA</td>{c.tot.map((x, i) => { const v = c.horas ? x / c.horas : 0; return <td key={i} style={corCurva(v, maxCurva)}>{c.horas ? `${Math.round(v * 100)}%` : ''}</td>; })}<td colSpan={3} /></tr>
          <tr className="ha-sub"><td className="ha-c1">Auditores 2H/4H</td>{c.audA.map((x, i) => <td key={i}>{x || ''}</td>)}<td colSpan={3} /></tr>
          <tr className="ha-sub"><td className="ha-c1">Auditores 8H</td>{c.audB.map((x, i) => <td key={i}>{x || ''}</td>)}<td colSpan={3} /></tr>
          <tr className="ha-sub ha-sub-t"><td className="ha-c1">Total de auditores</td>{c.audTot.map((x, i) => <td key={i}>{x || ''}</td>)}<td><b>{c.picoAud}</b></td><td colSpan={2} className="muted small">pico</td></tr>
          <tr className="ha-sub ha-sub-t"><td className="ha-c1">Veículos</td>{c.vecTot.map((x, i) => <td key={i}>{x || ''}</td>)}<td><b>{c.picoVec}</b></td><td colSpan={2} className="muted small">pico</td></tr>
        </tbody>
      </table>
    </div>
  );
}

/** Painel "aprovado hoje × proposto" com os números e a grade das mudanças. */
export function Comparacao({ plano, antes, depois }) {
  const A = calcular(plano, antes.horas, antes.prog), B = calcular(plano, depois.horas, depois.prog);
  const mud = celulasMudadas(plano, antes.horas, depois.horas), ws = semanasDe(plano);
  const linha = (nome, a, b, fmt, subir) => (
    <tr><td>{nome}</td><td className="ha-num">{fmt(a)}</td><td className="ha-num"><b>{fmt(b)}</b></td><td className="ha-num"><Delta a={a} b={b} fmt={fmt} subir={subir} /></td></tr>
  );
  return (
    <div className="ha-cmp">
      <table className="ha-resumo">
        <thead><tr><th>Indicador</th><th>Antes</th><th>Depois</th><th>Variação</th></tr></thead>
        <tbody>
          {linha('Horas', A.horas, B.horas, (x) => `${num(x)} h`)}
          {linha('Budget (R$)', A.budget, B.budget, money)}
          {linha('Budget programado', A.prog, B.prog, money, 'bom')}
          <tr><td>Diferença (programado − budget)</td><td className="ha-num"><Diferenca dif={A.dif} prog={A.prog} /></td><td className="ha-num"><Diferenca dif={B.dif} prog={B.prog} /></td><td /></tr>
          {linha('Pico de auditores', A.picoAud, B.picoAud, (x) => String(x))}
          {linha('Pico de veículos', A.picoVec, B.picoVec, (x) => String(x))}
        </tbody>
      </table>
      <div className="ha-sub-titulo">O que mudou nas horas <span className="muted">· {mud} célula(s) · antigo riscado, novo em destaque</span></div>
      <div className="ha-wrap">
        <table className="ha-grade ha-grade-mini">
          <thead><tr><th className="ha-c1">Módulo</th>{ws.map((x, i) => <th key={i}>SEM {i + 1}<br /><small>{x}</small></th>)}</tr></thead>
          <tbody>
            {MODS.map((m) => (
              <tr key={m}><td className="ha-c1"><b>{m}</b></td>
                {ws.map((_, w) => {
                  const a = r2(antes.horas?.[m]?.[w]), b = r2(depois.horas?.[m]?.[w]);
                  return a === b ? <td key={w} className="ha-ig">{a ? num(a) : ''}</td> : <td key={w} className="ha-mudc"><s>{a ? num(a) : '0'}</s> {b ? num(b) : '0'}</td>;
                })}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const dataHora = (s) => (s ? new Date(String(s).replace(' ', 'T') + 'Z') : null);
