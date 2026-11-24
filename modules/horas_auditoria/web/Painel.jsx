// Painel: o que os números lançados dizem. Usa só a versão APROVADA de cada distrito (o que vale hoje),
// e mostra o efeito das alterações em análise à parte. Serve as duas áreas (Planejamento e Central).
import { useEffect, useMemo, useState } from 'react';
import { Card, Empty, PageHeader, money, num } from '@hub';
import { BarrasEmpilhadas, Legenda, LinhasSemanas, Rosca } from './Graficos.jsx';
import { Diferenca, Kpi, MODS, calcular, n0, semanasDe } from './shared.jsx';

const CORES_MOD = { '2/4H': '#0c303e', '2/4HE': '#3f7f99', '8H': '#e4002b', '8HE': '#f08a99' };
const pct = (v) => `${Math.round(v * 100)}%`;
const ptb = (v, c = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: c });

/** Cor do mapa de calor: de branco (0) até azul-petróleo (maior valor). */
const calor = (v, max) => (v && max ? { background: `rgba(12, 48, 62, ${0.08 + 0.82 * (v / max)})`, color: v / max > 0.55 ? '#fff' : 'inherit' } : undefined);

export default function Painel({ api }) {
  const [planos, setPlanos] = useState(null);
  const [pid, setPid] = useState('');
  const [det, setDet] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => { api.get('/planejamentos').then((l) => { setPlanos(l); if (l.length) setPid(String(l[0].id)); }).catch((e) => setErro(e.message)); }, []);
  useEffect(() => { if (!pid) return; setDet(null); setFiltro(''); api.get(`/planejamentos/${pid}`).then(setDet).catch((e) => setErro(e.message)); }, [pid]);

  const m = useMemo(() => {
    if (!det) return null;
    const { plano } = det, W = plano.semanas, ws = semanasDe(plano);
    const ativos = det.distritos.filter((d) => !filtro || String(d.id) === filtro);
    const linhas = ativos.map((d) => ({ d, c: calcular(plano, d.aprovada.horas, d.aprovada.prog), h: d.aprovada.horas }));

    const sem = Array.from({ length: W }, (_, w) => {
      const porMod = MODS.map((mod) => linhas.reduce((s, x) => s + n0(x.h?.[mod]?.[w]), 0));
      const horas = porMod.reduce((a, b) => a + b, 0);
      return { w, porMod, horas, budget: MODS.reduce((s, mod, k) => s + porMod[k] * n0(plano.taxas[mod]), 0),
        audA: linhas.reduce((s, x) => s + x.c.audA[w], 0), audB: linhas.reduce((s, x) => s + x.c.audB[w], 0),
        veic: linhas.reduce((s, x) => s + x.c.vecTot[w], 0) };
    });
    const tot = { horas: 0, budget: 0, prog: 0 };
    for (const x of linhas) { tot.horas += x.c.horas; tot.budget += x.c.budget; tot.prog += x.c.prog; }
    const aud = sem.map((s) => s.audA + s.audB);
    const iPicoH = sem.reduce((b, s, i) => (s.horas > sem[b].horas ? i : b), 0), iPicoA = aud.reduce((b, v, i) => (v > aud[b] ? i : b), 0);
    const ativas = sem.filter((s) => s.horas > 0);
    const primeira = sem.findIndex((s) => s.horas > 0), ultima = W - 1 - [...sem].reverse().findIndex((s) => s.horas > 0);
    let acum = 0; const acumulado = sem.map((s) => (acum += s.budget));
    const porMod = MODS.map((mod, k) => ({ mod, horas: sem.reduce((s, x) => s + x.porMod[k], 0) })).map((x) => ({ ...x, budget: x.horas * n0(plano.taxas[x.mod]) }));
    const heatMax = Math.max(0, ...linhas.flatMap((x) => x.c.tot));

    // efeito das alterações em análise (rascunhos e pendentes) caso fossem aprovadas
    let emAnaliseH = 0, emAnaliseB = 0, nAnalise = 0;
    for (const d of det.distritos.filter((x) => !filtro || String(x.id) === filtro)) {
      if (!d.aberta) continue;
      const a = calcular(plano, d.aprovada.horas, d.aprovada.prog), b = calcular(plano, d.aberta.horas, d.aberta.prog);
      if (a.horas !== b.horas || a.budget !== b.budget) { nAnalise++; emAnaliseH += b.horas - a.horas; emAnaliseB += b.budget - a.budget; }
    }

    const dist = linhas.map((x) => {
      const comHoras = x.c.tot.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
      const iPico = x.c.tot.reduce((b, v, i) => (v > x.c.tot[b] ? i : b), 0);
      return { id: x.d.id, nome: x.d.nome, c: x.c, de: comHoras.length ? comHoras[0] : null, ate: comHoras.length ? comHoras[comHoras.length - 1] : null,
        picoSem: x.c.horas ? iPico : null, custoHora: x.c.horas ? x.c.budget / x.c.horas : 0, tot: x.c.tot };
    }).sort((a, b) => b.c.budget - a.c.budget);

    // leituras prontas
    const dicas = [];
    if (tot.horas > 0) {
      dicas.push(`Semana de maior carga: SEM ${iPicoH + 1} (${ws[iPicoH]}), com ${num(sem[iPicoH].horas)} h — ${pct(sem[iPicoH].horas / tot.horas)} de todas as horas.`);
      dicas.push(`Equipe máxima: ${aud[iPicoA]} auditores e ${Math.max(...sem.map((s) => s.veic))} veículos ao mesmo tempo (SEM ${iPicoA + 1}, ${ws[iPicoA]}).`);
      const mediaAtiva = tot.horas / ativas.length;
      dicas.push(`Operação de SEM ${primeira + 1} a SEM ${ultima + 1} (${ativas.length} semana(s) com horas) — média de ${num(Math.round(mediaAtiva))} h por semana ativa; o pico é ${ptb(sem[iPicoH].horas / mediaAtiva)}× a média.`);
      const lider = dist[0];
      if (dist.length > 1 && lider.c.budget > 0) dicas.push(`${lider.nome} concentra ${pct(lider.c.budget / tot.budget)} do budget (${money(lider.c.budget)}).`);
      const he = porMod.filter((x) => x.mod.endsWith('HE')).reduce((s, x) => s + x.horas, 0);
      dicas.push(`Horas em modalidade HE (extra): ${num(he)} h, ${pct(he / tot.horas)} do total.`);
      const sem0 = dist.filter((x) => x.c.horas > 0 && !x.c.prog).map((x) => x.nome);
      if (sem0.length) dicas.push(`Sem budget programado: ${sem0.join(', ')}.`);
      const cruza = acumulado.findIndex((v) => tot.prog > 0 && v > tot.prog);
      if (cruza >= 0) dicas.push(`O budget acumulado passa o programado já na SEM ${cruza + 1} (${ws[cruza]}).`);
    }
    return { plano, ws, sem, tot, aud, iPicoH, iPicoA, acumulado, porMod, dist, heatMax, dicas, primeira, ultima, emAnaliseH, emAnaliseB, nAnalise };
  }, [det, filtro]);

  if (erro) return <Empty>Não foi possível carregar: {erro}</Empty>;
  if (!planos) return <Empty>Carregando…</Empty>;
  if (!planos.length) return <><PageHeader back="/" title="Painel" /><Empty>Ainda não há planejamentos.</Empty></>;
  const vazio = m && m.tot.horas === 0;
  return (
    <>
      <PageHeader back="/" title="Painel de horas" subtitle="Carga, equipe e custo do que está aprovado hoje — por semana, módulo e distrito." />
      <div className="ha-linha">
        <label className="field"><span className="field-label">Planejamento</span>
          <select value={pid} onChange={(e) => setPid(e.target.value)}>{planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
        <label className="field"><span className="field-label">Distrito</span>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="">Todos</option>{det?.distritos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></label>
      </div>
      {!m ? <Empty>Carregando…</Empty> : vazio ? <Empty>Ainda não há horas aprovadas {filtro ? 'neste distrito' : 'neste planejamento'}. Lance as horas na aba Planejamento.</Empty> : (
        <div className="ha-dash">
          <div className="ha-kpis" style={{ marginBottom: 0 }}>
            <Kpi rotulo="Horas planejadas" valor={`${num(m.tot.horas)} h`} detalhe={`${m.dist.length} distrito(s) · ${m.plano.semanas} semanas`} />
            <Kpi rotulo="Budget" valor={money(m.tot.budget)} detalhe={`${money(m.tot.budget / m.tot.horas)} por hora em média`} />
            <Kpi rotulo="Budget programado" valor={money(m.tot.prog)} detalhe={m.tot.prog ? `${pct(m.tot.budget / m.tot.prog)} do programado usado` : 'não informado'} />
            <Kpi rotulo="Diferença" valor={<Diferenca dif={m.tot.prog - m.tot.budget} prog={m.tot.prog} />} detalhe="programado − budget" />
            <Kpi rotulo="Pico de auditores" valor={m.aud[m.iPicoA]} detalhe={`SEM ${m.iPicoA + 1} · ${m.ws[m.iPicoA]}`} />
            <Kpi rotulo="Pico de veículos" valor={Math.max(...m.sem.map((s) => s.veic))} detalhe="ao mesmo tempo" />
            <Kpi rotulo="Janela da operação" valor={`SEM ${m.primeira + 1}–${m.ultima + 1}`} detalhe={`${m.ws[m.primeira]} a ${m.ws[m.ultima]}`} />
            {m.nAnalise > 0 && <Kpi rotulo="Em análise" valor={`${m.emAnaliseH >= 0 ? '+' : '−'}${num(Math.abs(m.emAnaliseH))} h`} tom="azul" detalhe={`${m.emAnaliseB >= 0 ? '+' : '−'}${money(Math.abs(m.emAnaliseB))} · ${m.nAnalise} distrito(s), se aprovado`} />}
          </div>

          <Card className="ha-graf"><h3>O que os números mostram</h3>
            <ul className="ha-dicas">{m.dicas.map((t) => <li key={t}>{t}</li>)}</ul></Card>

          <Card className="ha-graf"><h3>Horas por semana</h3><p className="sub">Curva de demanda, empilhada por módulo · passe o mouse para ver cada semana</p>
            <BarrasEmpilhadas dados={m.sem.map((s) => ({ rotulo: `${s.w + 1}`, titulo: `SEM ${s.w + 1} · ${m.ws[s.w]}`, v: s.porMod }))} cores={MODS.map((x) => CORES_MOD[x])} nomes={MODS} fmt={(v) => num(v)} unidade=" h" />
            <Legenda itens={MODS.map((x) => [CORES_MOD[x], x])} /></Card>

          <div className="ha-dash-2">
            <Card className="ha-graf"><h3>Equipe necessária por semana</h3><p className="sub">Auditores (horas ÷ {num(m.plano.horas_por_auditor)} h por auditor, arredondado para cima)</p>
              <BarrasEmpilhadas dados={m.sem.map((s) => ({ rotulo: `${s.w + 1}`, titulo: `SEM ${s.w + 1} · ${m.ws[s.w]}`, v: [s.audA, s.audB] }))} cores={['#3f7f99', '#e4002b']} nomes={['Auditores 2H/4H', 'Auditores 8H']} fmt={(v) => String(v)} />
              <Legenda itens={[['#3f7f99', 'Auditores 2H/4H'], ['#e4002b', 'Auditores 8H']]} /></Card>
            <Card className="ha-graf"><h3>Mix de módulos</h3><p className="sub">Participação nas horas</p>
              <Rosca centro={num(m.tot.horas)} legenda="horas" fatias={m.porMod.map((x) => ({ rotulo: `${x.mod} · ${money(x.budget)}`, valor: Math.round(x.horas), cor: CORES_MOD[x.mod] }))} /></Card>
          </div>

          <Card className="ha-graf"><h3>Budget acumulado × programado</h3><p className="sub">Quanto do orçamento já foi consumido ao fim de cada semana (linha tracejada = budget programado)</p>
            <LinhasSemanas rotulos={m.ws.map((_, i) => `${i + 1}`)} fmt={(v) => (v >= 1e6 ? `${ptb(v / 1e6, 2)} mi` : v >= 1e3 ? `${Math.round(v / 1e3)} mil` : String(Math.round(v)))}
              series={[{ nome: 'Budget acumulado', cor: '#0c303e', v: m.acumulado, fmt: money }, ...(m.tot.prog ? [{ nome: 'Programado', cor: '#e4002b', tracejado: true, v: m.acumulado.map(() => m.tot.prog), fmt: money }] : [])]} />
            <Legenda itens={[['#0c303e', 'Budget acumulado'], ...(m.tot.prog ? [['#e4002b', 'Budget programado']] : [])]} /></Card>

          <Card className="ha-graf"><h3>Onde está a carga</h3><p className="sub">Horas por distrito e semana — quanto mais escuro, mais horas</p>
            <div className="ha-wrap"><table className="ha-heat"><thead><tr><th>Distrito</th>{m.ws.map((x, i) => <th key={i} title={x}>{i + 1}</th>)}<th>Total</th></tr></thead>
              <tbody>{m.dist.map((x) => <tr key={x.id}><td><b>{x.nome}</b></td>{x.tot.map((v, i) => <td key={i} style={calor(v, m.heatMax)} title={`${x.nome} · SEM ${i + 1} (${m.ws[i]}): ${num(v)} h`}>{v ? num(Math.round(v)) : ''}</td>)}<td><b>{num(x.c.horas)}</b></td></tr>)}</tbody></table></div></Card>

          <Card className="ha-graf"><h3>Por distrito</h3><p className="sub">Ordenado pelo maior budget</p>
            <div className="ha-wrap"><table className="ha-rank"><thead><tr><th>Distrito</th><th>Horas</th><th>Budget</th><th>% do budget</th><th>Programado</th><th>Diferença</th><th>R$/h</th><th>Atua</th><th>Pico</th><th>Aud.</th><th>Veíc.</th></tr></thead>
              <tbody>{m.dist.map((x) => (
                <tr key={x.id}><td><b>{x.nome}</b></td><td>{num(x.c.horas)}</td><td>{money(x.c.budget)}</td>
                  <td><div className="ha-barra" title={pct(m.tot.budget ? x.c.budget / m.tot.budget : 0)}><span style={{ width: `${m.tot.budget ? (x.c.budget / m.tot.budget) * 100 : 0}%`, background: '#0c303e' }} /></div></td>
                  <td>{money(x.c.prog)}</td><td><Diferenca dif={x.c.dif} prog={x.c.prog} /></td><td>{x.custoHora ? money(x.custoHora) : '—'}</td>
                  <td>{x.de == null ? '—' : `SEM ${x.de + 1}–${x.ate + 1}`}</td><td>{x.picoSem == null ? '—' : `SEM ${x.picoSem + 1}`}</td><td>{x.c.picoAud}</td><td>{x.c.picoVec}</td></tr>))}</tbody></table></div></Card>
        </div>
      )}
    </>
  );
}
