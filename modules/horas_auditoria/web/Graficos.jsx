// Gráficos em SVG puro (sem biblioteca) para o painel de histórico.
import { useState } from 'react';
import { money } from '@hub';

const compacto = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2).replace('.', ',')} mi` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)} mil` : String(Math.round(v)));
/** Passo "redondo" (1, 2, 5 × 10ⁿ) para ter uns 4 traços no eixo. */
const passo = (max) => { const raw = (max || 1) / 4, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

export function Legenda({ itens }) {
  return <div className="ha-leg">{itens.map(([cor, nome]) => <span key={nome}><i style={{ background: cor }} />{nome}</span>)}</div>;
}

/** Barras empilhadas. dados: [{ rotulo, v: [a, b, c] }], cores: [c1, c2, c3] */
export function BarrasEmpilhadas({ dados, cores }) {
  const W = 640, H = 220, ml = 30, mb = 28, mt = 10, area = { w: W - ml - 8, h: H - mb - mt };
  const max = Math.max(1, ...dados.map((d) => d.v.reduce((a, b) => a + b, 0)));
  const st = Math.max(1, Math.ceil(max / 4)), topo = st * Math.ceil(max / st);
  const bw = Math.min(46, (area.w / Math.max(1, dados.length)) * 0.62), gap = area.w / Math.max(1, dados.length);
  const [tip, setTip] = useState(null);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ha-svg" role="img" aria-label="Atividade por período">
      {Array.from({ length: topo / st + 1 }, (_, i) => { const y = mt + area.h - (i * st / topo) * area.h; return <g key={i}><line x1={ml} x2={W - 8} y1={y} y2={y} stroke="#e5e7eb" /><text x={ml - 6} y={y + 4} textAnchor="end">{i * st}</text></g>; })}
      {dados.map((d, i) => {
        let y = mt + area.h; const x = ml + gap * i + (gap - bw) / 2;
        return (
          <g key={i} onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(null)}>
            <rect x={ml + gap * i} y={mt} width={gap} height={area.h} fill="transparent" />
            {d.v.map((v, k) => { const h = (v / topo) * area.h; y -= h; return v ? <rect key={k} x={x} y={y} width={bw} height={h} fill={cores[k]} rx={2} /> : null; })}
            <text x={x + bw / 2} y={H - 10} textAnchor="middle">{d.rotulo}</text>
          </g>
        );
      })}
      {tip !== null && dados[tip] && (() => {
        const d = dados[tip], x = Math.min(W - 150, ml + gap * tip + gap / 2 + 8);
        return <g pointerEvents="none"><rect x={x} y={mt} width={142} height={58} rx={6} fill="#0c303e" /><text x={x + 8} y={mt + 16} style={{ fill: '#fff', fontWeight: 700 }}>{dados[tip].titulo || d.rotulo}</text>
          {['Enviados', 'Aprovados', 'Reprovados'].map((n, k) => <text key={n} x={x + 8} y={mt + 31 + k * 12} style={{ fill: '#cfe0e7' }}>{n}: {d.v[k]}</text>)}</g>;
      })()}
    </svg>
  );
}

/** Linhas em degrau no tempo. pontos: [{ t: ms, v: [serie1, serie2] }] */
export function LinhasTempo({ pontos, de, ate, cores }) {
  const W = 640, H = 230, ml = 56, mb = 26, mt = 10, w = W - ml - 12, h = H - mb - mt;
  if (!pontos.length) return <div className="muted small" style={{ padding: 30, textAlign: 'center' }}>Sem dados no período.</div>;
  const todos = pontos.flatMap((p) => p.v), hi = Math.max(1, ...todos), lo = Math.min(...todos), span = hi - lo;
  // quando as mudanças são pequenas perto do total, o eixo não começa do zero (senão a linha parece parada)
  const recorta = lo > 0 && span < hi * 0.6, alto = recorta ? hi + Math.max(span, hi * 0.02) * 0.2 : hi;
  const baixo0 = recorta ? lo - Math.max(span, hi * 0.02) * 0.3 : 0, st = passo(alto - baixo0);
  const base = recorta ? Math.floor(baixo0 / st) * st : 0, topo = st * Math.ceil(alto / st);
  const x = (t) => ml + ((t - de) / Math.max(1, ate - de)) * w, y = (v) => mt + h - ((v - base) / Math.max(1, topo - base)) * h;
  const caminho = (k) => pontos.map((p, i) => `${i ? `L${x(p.t)},${y(pontos[i - 1].v[k])} ` : 'M'}${x(p.t)},${y(p.v[k])}`).join(' ') + ` L${x(ate)},${y(pontos[pontos.length - 1].v[k])}`;
  const ticks = Array.from({ length: Math.round((topo - base) / st) + 1 }, (_, i) => base + i * st);
  const datas = Array.from({ length: 5 }, (_, i) => de + ((ate - de) * i) / 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ha-svg" role="img" aria-label="Evolução do budget">
      {ticks.map((v) => <g key={v}><line x1={ml} x2={W - 12} y1={y(v)} y2={y(v)} stroke="#e5e7eb" /><text x={ml - 6} y={y(v) + 4} textAnchor="end">{compacto(v)}</text></g>)}
      {datas.map((t, i) => <text key={i} x={x(t)} y={H - 8} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}>{new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</text>)}
      {cores.map((c, k) => <path key={k} d={caminho(k)} fill="none" stroke={c} strokeWidth={k === 0 ? 2.5 : 2} strokeDasharray={k === 0 ? undefined : '5 4'} />)}
      {pontos.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.v[0])} r={3.5} fill={cores[0]}><title>{`${new Date(p.t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${money(p.v[0])}${p.v[1] != null ? ` (programado ${money(p.v[1])})` : ''}`}</title></circle>)}
    </svg>
  );
}

/** Rosca com total no centro. fatias: [{ rotulo, valor, cor }] */
export function Rosca({ fatias, centro, legenda }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0), R = 58, C = 2 * Math.PI * R;
  let acum = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <svg viewBox="0 0 150 150" width={150} height={150} role="img" aria-label="Resultado das decisões">
        <circle cx={75} cy={75} r={R} fill="none" stroke="#eef0f3" strokeWidth={20} />
        {total > 0 && fatias.map((f) => { const len = (f.valor / total) * C, el = <circle key={f.rotulo} cx={75} cy={75} r={R} fill="none" stroke={f.cor} strokeWidth={20} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acum} transform="rotate(-90 75 75)" />; acum += len; return f.valor ? el : null; })}
        <text x={75} y={73} textAnchor="middle" style={{ fill: '#111827', fontSize: 24, fontWeight: 700 }}>{centro}</text>
        <text x={75} y={91} textAnchor="middle" style={{ fontSize: 11 }}>{legenda}</text>
      </svg>
      <div style={{ display: 'grid', gap: 6, fontSize: 13.5 }}>
        {fatias.map((f) => <div key={f.rotulo}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: f.cor, marginRight: 8 }} /><b>{f.valor}</b> <span className="muted">{f.rotulo}</span></div>)}
      </div>
    </div>
  );
}
