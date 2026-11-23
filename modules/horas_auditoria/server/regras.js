// Regras de negócio do sistema Horas de Auditoria (as mesmas contas da planilha de planejamento).

export class RuleError extends Error {
  constructor(msg, status = 400, extra = {}) { super(msg); this.status = status; this.extra = extra; }
}

export const MODS = ['2/4H', '2/4HE', '8H', '8HE'];
export const GRUPO_A = ['2/4H', '2/4HE']; // contam como "2H/4H" nos auditores
export const GRUPO_B = ['8H', '8HE'];
export const TAXAS_PADRAO = { '2/4H': 237.2, '2/4HE': 273.02, '8H': 208.98, '8HE': 217.72 };
export const MAX_SEMANAS = 60;
export const MAX_HORAS_CELULA = 9999;
export const MAX_BUDGET = 1_000_000_000;

export const n0 = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const r2 = (v) => Math.round(n0(v) * 100) / 100;
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const txt = (v, max = 500) => { const s = String(v ?? '').trim().replace(/\s+/g, ' '); return s ? s.slice(0, max) : null; };
export const txtLivre = (v, max = 1000) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
export const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
export const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

/** Valida as horas de um distrito: { módulo: [valor|null × semanas] }. Devolve sempre os 4 módulos com o tamanho certo. */
export function lerHoras(h, semanas) {
  const src = h && typeof h === 'object' ? h : {};
  const out = {};
  for (const m of MODS) {
    const arr = Array.isArray(src[m]) ? src[m] : [];
    out[m] = Array.from({ length: semanas }, (_, i) => {
      const v = arr[i];
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > MAX_HORAS_CELULA) throw new RuleError(`Horas inválidas em ${m}, semana ${i + 1} (use de 0 a ${MAX_HORAS_CELULA}).`);
      return n === 0 ? null : r2(n);
    });
  }
  return out;
}
export const horasVazias = (semanas) => lerHoras({}, semanas);

export function lerValor(v, nome = 'Valor') {
  const n = Number(v);
  if (v === '' || v === null || v === undefined) return 0;
  if (!Number.isFinite(n) || n < 0 || n > MAX_BUDGET) throw new RuleError(`${nome} inválido.`);
  return r2(n);
}

export function lerTaxas(t) {
  const out = {};
  for (const m of MODS) {
    const n = Number(t?.[m] ?? TAXAS_PADRAO[m]);
    if (!Number.isFinite(n) || n < 0 || n > 100000) throw new RuleError(`Valor por hora inválido em ${m}.`);
    out[m] = r2(n);
  }
  return out;
}

/** Conta tudo de um distrito: totais, budget, diferença, auditores e veículos por semana. */
export function calcular(plano, horas, prog) {
  const W = plano.semanas, taxas = plano.taxas, k = n0(plano.horas_por_auditor) || 44;
  const h = (m, w) => n0(horas?.[m]?.[w]);
  const r = { tot: Array(W).fill(0), mod: {}, horas: 0, budget: 0, audTot: [], vecTot: [] };
  for (const m of MODS) {
    let s = 0;
    for (let w = 0; w < W; w++) { s += h(m, w); r.tot[w] += h(m, w); }
    r.mod[m] = { horas: r2(s), budget: r2(s * n0(taxas[m])) };
    r.horas += s; r.budget += s * n0(taxas[m]);
  }
  for (let w = 0; w < W; w++) {
    const a = GRUPO_A.reduce((s, m) => s + h(m, w), 0), b = GRUPO_B.reduce((s, m) => s + h(m, w), 0);
    const audA = Math.ceil(a / k - 1e-9), audB = Math.ceil(b / k - 1e-9);
    r.audTot[w] = audA + audB;
    r.vecTot[w] = Math.ceil(audA / (n0(plano.aud_veic_a) || 1) - 1e-9) + Math.ceil(audB / (n0(plano.aud_veic_b) || 1) - 1e-9);
  }
  r.horas = r2(r.horas); r.budget = r2(r.budget);
  r.prog = r2(prog);
  r.dif = r2(r.prog - r.budget);          // >0 = "Falta", <0 = "Passou"
  r.picoAud = Math.max(0, ...r.audTot);
  r.picoVec = Math.max(0, ...r.vecTot);
  return r;
}

/** Quantas células de horas são diferentes entre duas versões. */
export function celulasAlteradas(plano, a, b) {
  let n = 0;
  for (const m of MODS) for (let w = 0; w < plano.semanas; w++) if (r2(a?.[m]?.[w]) !== r2(b?.[m]?.[w])) n++;
  return n;
}

/** Resumo "antes → depois" guardado no histórico. */
export function resumir(plano, antes, depois) {
  const A = calcular(plano, antes.horas, antes.prog), D = calcular(plano, depois.horas, depois.prog);
  return {
    horas_antes: A.horas, horas_depois: D.horas, budget_antes: A.budget, budget_depois: D.budget,
    prog_antes: A.prog, prog_depois: D.prog, dif_antes: A.dif, dif_depois: D.dif,
    aud_antes: A.picoAud, aud_depois: D.picoAud, veic_antes: A.picoVec, veic_depois: D.picoVec,
    celulas: celulasAlteradas(plano, antes.horas, depois.horas),
    // cópia do que foi comparado: o histórico mostra sempre o que foi enviado, mesmo se o rascunho mudar depois
    snap: {
      antes: { horas: antes.horas, prog: r2(antes.prog) }, depois: { horas: depois.horas, prog: r2(depois.prog) },
      // valores por hora e divisores da época (podem mudar depois)
      params: { taxas: plano.taxas, horas_por_auditor: n0(plano.horas_por_auditor), aud_veic_a: n0(plano.aud_veic_a), aud_veic_b: n0(plano.aud_veic_b) },
    },
  };
}

export const ACOES = { criada: 'Distrito criado', importada: 'Importado da planilha', enviada: 'Enviado para aprovação', aprovada: 'Aprovado', reprovada: 'Reprovado', descartada: 'Rascunho descartado', parametros: 'Parâmetros alterados' };
