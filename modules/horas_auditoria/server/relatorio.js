// Relatório do sistema Horas de Auditoria.
//  - aba do solicitante: movimentações (envios, aprovações, reprovações) no período
//  - aba da central: planejamento aprovado hoje, por distrito e módulo
import { MODS, calcular, ACOES, json, n0 } from './regras.js';

export default async function relatorio({ db, entre, periodo }) {
  const ev = await db.all(`SELECT e.*, p.nome AS plano FROM horas_eventos e LEFT JOIN horas_planejamentos p ON p.id = e.planejamento_id
    WHERE ${entre('e.created_at')} ORDER BY e.id`, ...periodo);
  const ps = await db.all('SELECT * FROM horas_planejamentos ORDER BY id');
  const linhas = [];
  for (const p of ps) {
    const plano = { ...p, taxas: json(p.taxas), horas_por_auditor: n0(p.horas_por_auditor), aud_veic_a: n0(p.aud_veic_a), aud_veic_b: n0(p.aud_veic_b) };
    const ds = await db.all(`SELECT d.nome, v.horas, v.prog FROM horas_distritos d JOIN horas_versoes v ON v.id = d.aprovada_id WHERE d.planejamento_id = ? ORDER BY d.id`, p.id);
    for (const d of ds) {
      const c = calcular(plano, json(d.horas), n0(d.prog));
      MODS.forEach((m, i) => linhas.push([p.nome, d.nome, m, c.mod[m].horas, n0(plano.taxas[m]), c.mod[m].budget, i === 0 ? c.prog : null, i === 0 ? c.dif : null, i === 0 ? c.picoAud : null, i === 0 ? c.picoVec : null]));
    }
  }
  return {
    solicitante: {
      columns: [{ label: 'Quando', type: 'datetime', width: 17 }, { label: 'Planejamento', width: 20 }, { label: 'Distrito', width: 22 }, { label: 'Ação', width: 24 }, { label: 'Feito por', width: 22 },
        { label: 'Horas antes', type: 'number' }, { label: 'Horas depois', type: 'number' }, { label: 'Budget antes', type: 'money' }, { label: 'Budget depois', type: 'money' },
        { label: 'Células alteradas', type: 'number' }, { label: 'Observação', type: 'texto', width: 40 }],
      rows: ev.map((e) => { const r = e.resumo ? json(e.resumo) : {}; return [e.created_at, e.plano, e.distrito_nome, ACOES[e.acao] || e.acao, e.por_nome, r.horas_antes ?? null, r.horas_depois ?? null, r.budget_antes ?? null, r.budget_depois ?? null, r.celulas ?? null, e.nota]; }),
    },
    central: {
      columns: [{ label: 'Planejamento', width: 20 }, { label: 'Distrito', width: 22 }, { label: 'Módulo', width: 10 }, { label: 'Horas', type: 'number' }, { label: 'R$/hora', type: 'money' },
        { label: 'Budget (R$)', type: 'money' }, { label: 'Budget programado', type: 'money' }, { label: 'Diferença (programado − budget)', type: 'money' }, { label: 'Pico de auditores', type: 'number' }, { label: 'Pico de veículos', type: 'number' }],
      rows: linhas,
    },
  };
}
