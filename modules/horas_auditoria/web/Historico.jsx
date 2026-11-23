// Histórico em formato de painel: indicadores, gráficos, ranking por distrito e por pessoa, e a linha do tempo
// com o antes × depois de cada envio. Serve as duas áreas (Planejamento e Central).
import { useEffect, useMemo, useState } from 'react';
import { Card, Empty, Modal, PageHeader, money, num } from '@hub';
import { BarrasEmpilhadas, Legenda, LinhasTempo, Rosca } from './Graficos.jsx';
import { Comparacao, Delta, Diferenca, Kpi, Pill, dataHora } from './shared.jsx';

const DIA = 86400000;
const PERIODOS = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['0', 'Tudo']];
const FILTROS = [['', 'Tudo'], ['enviada', 'Enviados'], ['aprovada', 'Aprovados'], ['reprovada', 'Reprovados'], ['outros', 'Outros']];
const INFO = {
  enviada: { cor: '#1d4f91', ic: '↑', verbo: 'enviou', pill: 'azul', nome: 'Enviado para aprovação' },
  aprovada: { cor: '#0f7a4b', ic: '✓', verbo: 'aprovou', pill: 'verde', nome: 'Aprovado' },
  reprovada: { cor: '#b42318', ic: '✕', verbo: 'reprovou', pill: 'verm', nome: 'Reprovado' },
  descartada: { cor: '#6b7280', ic: '⌫', verbo: 'descartou o rascunho de', pill: 'cinza', nome: 'Rascunho descartado' },
  criada: { cor: '#0c303e', ic: '+', verbo: 'criou', pill: 'cinza', nome: 'Distrito criado' },
  importada: { cor: '#0c303e', ic: '⇪', verbo: 'importou', pill: 'cinza', nome: 'Importado da planilha' },
  parametros: { cor: '#b45309', ic: '⚙', verbo: 'alterou os parâmetros', pill: 'laranja', nome: 'Parâmetros alterados' },
};
const POR_PAGINA = 25;

const duracao = (ms) => { if (ms == null) return '—'; const m = ms / 60000; if (m < 60) return `${Math.max(1, Math.round(m))} min`; const h = m / 60; return h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`; };
const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const seg = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }; // segunda-feira
const dm = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function DiffModal({ api, e, onClose }) {
  const [x, setX] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => { api.get(`/eventos/${e.id}`).then(setX).catch((er) => setErro(er.message)); }, []);
  return (
    <Modal title={`${INFO[e.acao]?.nome || e.acao} · ${e.distrito_nome}`} onClose={onClose} wide={1150}>
      {erro ? <Empty>{erro}</Empty> : !x ? <Empty>Carregando…</Empty> : <Comparacao plano={x.plano} antes={x.antes} depois={x.depois} />}
    </Modal>
  );
}

function Item({ e, espera, onVer }) {
  const i = INFO[e.acao] || { cor: '#6b7280', ic: '•', verbo: e.acao, pill: 'cinza', nome: e.acao }, r = e.resumo;
  const dep = e.acao === 'criada' || e.acao === 'importada';
  return (
    <li>
      <span className="ha-tl-ic" style={{ background: i.cor }}>{i.ic}</span>
      <div>
        <div className="ha-tl-top">
          <b>{e.por_nome || 'Sistema'}</b><span>{i.verbo}</span>{e.distrito_nome && <b>{e.distrito_nome}</b>}
          <Pill cor={i.pill}>{i.nome}</Pill>
          {espera != null && <span className="muted small">respondido em {duracao(espera)}</span>}
          <span className="ha-tl-quando">{dataHora(e.created_at)?.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
        {r && (
          <div className="ha-tl-nums">
            {dep ? <>
              <div className="ha-tl-num"><small>Horas</small><b>{num(r.horas_depois)} h</b></div>
              <div className="ha-tl-num"><small>Budget</small><b>{money(r.budget_depois)}</b></div>
              <div className="ha-tl-num"><small>Programado</small><b>{money(r.prog_depois)}</b></div>
            </> : r.horas_antes != null && <>
              <div className="ha-tl-num"><small>Horas</small>{num(r.horas_antes)} → <b>{num(r.horas_depois)}</b> <Delta a={r.horas_antes} b={r.horas_depois} /></div>
              <div className="ha-tl-num"><small>Budget</small>{money(r.budget_antes)} → <b>{money(r.budget_depois)}</b> <Delta a={r.budget_antes} b={r.budget_depois} fmt={money} /></div>
              {r.prog_antes !== r.prog_depois && <div className="ha-tl-num"><small>Programado</small>{money(r.prog_antes)} → <b>{money(r.prog_depois)}</b></div>}
              <div className="ha-tl-num"><small>Diferença depois</small><Diferenca dif={r.dif_depois} prog={r.prog_depois} /></div>
              <div className="ha-tl-num"><small>Auditores (pico)</small>{r.aud_antes} → <b>{r.aud_depois}</b></div>
              <div className="ha-tl-num"><small>Veículos (pico)</small>{r.veic_antes} → <b>{r.veic_depois}</b></div>
              <div className="ha-tl-num"><small>Células alteradas</small><b>{r.celulas}</b></div>
            </>}
          </div>
        )}
        {e.nota && <div className={`ha-tl-nota ${e.acao === 'reprovada' ? 'ruim' : ''}`}>{e.acao === 'reprovada' ? 'Motivo: ' : '“'}{e.nota}{e.acao === 'reprovada' ? '' : '”'}</div>}
        {e.tem_snap && <button type="button" className="ha-linkbtn" onClick={() => onVer(e)}>Ver as mudanças semana a semana →</button>}
      </div>
    </li>
  );
}

export default function Historico({ api }) {
  const [data, setData] = useState(null);
  const [pid, setPid] = useState('');
  const [periodo, setPeriodo] = useState('30');
  const [dist, setDist] = useState('');
  const [pessoa, setPessoa] = useState('');
  const [filtro, setFiltro] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [ver, setVer] = useState(null);

  const [erro, setErro] = useState('');
  useEffect(() => { api.get('/historico').then((d) => { setData(d); setPid((p) => p || String(d.planos[0]?.id ?? '')); }).catch((e) => setErro(e.message)); }, []);

  const m = useMemo(() => {
    if (!data || !pid) return null;
    const asc = data.eventos.filter((e) => String(e.planejamento_id) === pid).reverse().map((e) => ({ ...e, t: dataHora(e.created_at).getTime() }));
    const agora = Date.now(), dias = Number(periodo), de = dias ? agora - dias * DIA : (asc[0]?.t ?? agora) - 3600000;
    const okD = (e) => !dist || e.distrito_nome === dist, okP = (e) => !pessoa || e.por_nome === pessoa;

    // quem enviou cada versão e quanto demorou a resposta (a mesma versão pode ser reenviada depois de reprovada)
    const envio = {}, dono = {}, espera = {};
    for (const e of asc) {
      if (e.acao === 'enviada') { envio[e.versao_id] = { t: e.t, d: e.distrito_nome }; dono[e.versao_id] = e.por_nome; }
      else if ((e.acao === 'aprovada' || e.acao === 'reprovada') && envio[e.versao_id]) { espera[e.id] = e.t - envio[e.versao_id].t; delete envio[e.versao_id]; }
    }
    const aguardando = Object.values(envio).filter((x) => !dist || x.d === dist).length;

    const jan = asc.filter((e) => e.t >= de && okD(e) && okP(e));
    const cont = (a) => jan.filter((e) => e.acao === a).length;
    const env = cont('enviada'), apr = cont('aprovada'), rep = cont('reprovada');
    const decis = jan.filter((e) => e.acao === 'aprovada' || e.acao === 'reprovada');
    const dBudget = jan.filter((e) => e.acao === 'aprovada').reduce((s, e) => s + (e.resumo.budget_depois - e.resumo.budget_antes), 0);
    const dHoras = jan.filter((e) => e.acao === 'aprovada').reduce((s, e) => s + (e.resumo.horas_depois - e.resumo.horas_antes), 0);

    // atividade por dia (7 dias) ou por semana
    const porDia = dias === 7, passo = porDia ? DIA : 7 * DIA, ini = porDia ? new Date(new Date(agora - 6 * DIA).setHours(0, 0, 0, 0)).getTime() : seg(Math.max(de, agora - 26 * 7 * DIA));
    const chave = (t) => (porDia ? new Date(new Date(t).setHours(0, 0, 0, 0)).getTime() : seg(t));
    const baldes = new Map();
    for (let t = ini; t <= agora; t += passo) baldes.set(chave(t), { rotulo: dm(t), titulo: porDia ? dm(t) : `Semana de ${dm(t)}`, v: [0, 0, 0] });
    for (const e of jan) { const b = baldes.get(chave(e.t)), k = { enviada: 0, aprovada: 1, reprovada: 2 }[e.acao]; if (b && k !== undefined) b.v[k]++; }

    // evolução do budget aprovado (e do programado) ao longo do tempo
    const est = new Map(), pts = []; let antes = null;
    for (const e of asc) {
      if (!['criada', 'importada', 'aprovada'].includes(e.acao) || !okD(e)) continue;
      est.set(e.distrito_id, { b: e.resumo.budget_depois, p: e.resumo.prog_depois });
      const soma = [...est.values()].reduce((s, x) => [s[0] + x.b, s[1] + x.p], [0, 0]);
      if (e.t < de) antes = { t: de, v: soma }; else pts.push({ t: e.t, v: soma });
    }
    const linha = antes ? [antes, ...pts] : pts;
    const atual = new Map([...est.entries()]);

    // por distrito
    const nomes = [...new Set(asc.filter((e) => e.distrito_nome).map((e) => e.distrito_nome))];
    const idPorNome = new Map(asc.filter((e) => e.distrito_id).map((e) => [e.distrito_nome, e.distrito_id]));
    const distritos = nomes.map((n) => {
      const ev = asc.filter((e) => e.t >= de && e.distrito_nome === n), s = atual.get(idPorNome.get(n));
      return { n, env: ev.filter((e) => e.acao === 'enviada').length, apr: ev.filter((e) => e.acao === 'aprovada').length, rep: ev.filter((e) => e.acao === 'reprovada').length, b: s?.b ?? 0, p: s?.p ?? 0 };
    });

    // por pessoa
    const plan = new Map(), cen = new Map();
    for (const e of jan) {
      if (e.acao === 'enviada') { const x = plan.get(e.por_nome) || { n: e.por_nome, env: 0, apr: 0, rep: 0 }; x.env++; plan.set(e.por_nome, x); }
      if (e.acao === 'aprovada' || e.acao === 'reprovada') {
        const o = dono[e.versao_id]; if (o) { const x = plan.get(o) || { n: o, env: 0, apr: 0, rep: 0 }; x[e.acao === 'aprovada' ? 'apr' : 'rep']++; plan.set(o, x); }
        const c = cen.get(e.por_nome) || { n: e.por_nome, apr: 0, rep: 0, esp: [] }; c[e.acao === 'aprovada' ? 'apr' : 'rep']++; if (espera[e.id] != null) c.esp.push(espera[e.id]); cen.set(e.por_nome, c);
      }
    }
    const pessoas = [...new Set(asc.map((e) => e.por_nome).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { asc, jan, de, agora, env, apr, rep, aguardando, taxa: apr + rep ? apr / (apr + rep) : null, espera: media(decis.map((e) => espera[e.id]).filter((x) => x != null)), dBudget, dHoras,
      baldes: [...baldes.values()], linha, distritos, plan: [...plan.values()].sort((a, b) => b.env - a.env), cen: [...cen.values()].sort((a, b) => b.apr + b.rep - a.apr - a.rep), esperaPorEvento: espera, pessoas, nomes };
  }, [data, pid, periodo, dist, pessoa]);

  if (erro) return <Empty>Não foi possível carregar: {erro}</Empty>;
  if (!data) return <Empty>Carregando…</Empty>;
  if (!data.planos.length) return <><PageHeader back="/" title="Histórico" /><Empty>Ainda não há planejamentos.</Empty></>;

  const lista = m ? m.jan.filter((e) => (!filtro ? true : filtro === 'outros' ? !['enviada', 'aprovada', 'reprovada'].includes(e.acao) : e.acao === filtro)).slice().reverse() : [];
  const decisoes = m ? m.apr + m.rep : 0;
  return (
    <>
      <PageHeader back="/" title="Histórico e painel" subtitle="O que foi enviado, aprovado e reprovado, quem fez e quanto isso mudou no budget." />
      <div className="ha-linha">
        <label className="field"><span className="field-label">Planejamento</span>
          <select value={pid} onChange={(e) => { setPid(e.target.value); setDist(''); setLimite(POR_PAGINA); }}>{data.planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
        <label className="field"><span className="field-label">Distrito</span>
          <select value={dist} onChange={(e) => { setDist(e.target.value); setLimite(POR_PAGINA); }}><option value="">Todos</option>{m?.nomes.map((n) => <option key={n}>{n}</option>)}</select></label>
        <label className="field"><span className="field-label">Pessoa</span>
          <select value={pessoa} onChange={(e) => { setPessoa(e.target.value); setLimite(POR_PAGINA); }}><option value="">Todas</option>{m?.pessoas.map((n) => <option key={n}>{n}</option>)}</select></label>
        <span className="ha-sp" />
        <div className="ha-chips">{PERIODOS.map(([k, t]) => <button key={k} type="button" className={`ha-chip ${periodo === k ? 'on' : ''}`} onClick={() => { setPeriodo(k); setLimite(POR_PAGINA); }}>{t}</button>)}</div>
      </div>
      {m && (
        <div className="ha-dash">
          <div className="ha-kpis" style={{ marginBottom: 0 }}>
            <Kpi rotulo="Enviados" valor={m.env} detalhe="para aprovação" />
            <Kpi rotulo="Aprovados" valor={m.apr} tom="ok" />
            <Kpi rotulo="Reprovados" valor={m.rep} tom={m.rep ? 'ruim' : undefined} />
            <Kpi rotulo="Aguardando a Central" valor={m.aguardando} tom={m.aguardando ? 'azul' : undefined} detalhe="agora" />
            <Kpi rotulo="Taxa de aprovação" valor={m.taxa == null ? '—' : `${Math.round(m.taxa * 100)}%`} detalhe={`${decisoes} decisão(ões)`} />
            <Kpi rotulo="Tempo de resposta" valor={duracao(m.espera)} detalhe="média da Central" />
            <Kpi rotulo="Budget aprovado" valor={`${m.dBudget >= 0 ? '+' : '−'}${money(Math.abs(m.dBudget))}`} detalhe={`${m.dHoras >= 0 ? '+' : '−'}${num(Math.abs(m.dHoras))} h no período`} />
          </div>

          <div className="ha-dash-2">
            <Card className="ha-graf"><h3>Atividade</h3><p className="sub">{periodo === '7' ? 'Por dia' : 'Por semana'} · passe o mouse nas barras</p>
              <BarrasEmpilhadas dados={m.baldes} cores={['#6f9bd1', '#2e9d6a', '#d4584f']} /><Legenda itens={[['#6f9bd1', 'Enviados'], ['#2e9d6a', 'Aprovados'], ['#d4584f', 'Reprovados']]} /></Card>
            <Card className="ha-graf"><h3>Resultado das decisões</h3><p className="sub">Aprovadas × reprovadas no período</p>
              <Rosca centro={m.taxa == null ? '—' : `${Math.round(m.taxa * 100)}%`} legenda="aprovadas" fatias={[{ rotulo: 'aprovadas', valor: m.apr, cor: '#2e9d6a' }, { rotulo: 'reprovadas', valor: m.rep, cor: '#d4584f' }, { rotulo: 'aguardando', valor: m.aguardando, cor: '#c9d3da' }]} /></Card>
          </div>

          <Card className="ha-graf"><h3>Budget aprovado × programado</h3><p className="sub">Soma dos distritos filtrados, a cada aprovação. Só muda quando a Central aprova — reprovar não mexe.</p>
            <LinhasTempo pontos={m.linha} de={m.de} ate={m.agora} cores={['#0c303e', '#e4002b']} />
            <Legenda itens={[['#0c303e', 'Budget aprovado'], ['#e4002b', 'Budget programado']]} /></Card>

          <div className="ha-dash-2">
            <Card className="ha-graf"><h3>Por distrito</h3><p className="sub">Decisões no período e situação aprovada hoje</p>
              <table className="ha-rank"><thead><tr><th>Distrito</th><th>Envios</th><th>Resultado</th><th>Budget</th><th>Diferença</th></tr></thead>
                <tbody>{m.distritos.map((d) => (
                  <tr key={d.n}><td><b>{d.n}</b></td><td>{d.env}</td>
                    <td><div className="ha-barra" title={`${d.apr} aprovada(s) · ${d.rep} reprovada(s)`}>{d.apr + d.rep ? <><span style={{ width: `${(d.apr / (d.apr + d.rep)) * 100}%`, background: '#2e9d6a' }} /><span style={{ width: `${(d.rep / (d.apr + d.rep)) * 100}%`, background: '#d4584f' }} /></> : null}</div></td>
                    <td>{money(d.b)}</td><td><Diferenca dif={d.p - d.b} prog={d.p} /></td></tr>))}</tbody></table></Card>
            <Card className="ha-graf"><h3>Por pessoa</h3><p className="sub">Planejadores e Central</p>
              <table className="ha-rank"><thead><tr><th>Planejador</th><th>Env.</th><th>Apr.</th><th>Rep.</th></tr></thead>
                <tbody>{m.plan.length ? m.plan.map((p) => <tr key={p.n}><td>{p.n}</td><td>{p.env}</td><td>{p.apr}</td><td>{p.rep}</td></tr>) : <tr><td colSpan={4} className="muted">Sem envios no período.</td></tr>}</tbody></table>
              <table className="ha-rank" style={{ marginTop: 12 }}><thead><tr><th>Central</th><th>Apr.</th><th>Rep.</th><th>Resposta</th></tr></thead>
                <tbody>{m.cen.length ? m.cen.map((p) => <tr key={p.n}><td>{p.n}</td><td>{p.apr}</td><td>{p.rep}</td><td>{duracao(media(p.esp))}</td></tr>) : <tr><td colSpan={4} className="muted">Sem decisões no período.</td></tr>}</tbody></table></Card>
          </div>

          <Card className="ha-card">
            <div className="ha-card-top"><h2>Linha do tempo</h2><span className="muted small">{lista.length} registro(s)</span><span className="ha-sp" />
              <div className="ha-chips">{FILTROS.map(([k, t]) => <button key={k} type="button" className={`ha-chip ${filtro === k ? 'on' : ''}`} onClick={() => { setFiltro(k); setLimite(POR_PAGINA); }}>{t}</button>)}</div></div>
            {!lista.length ? <Empty>Nada neste período e filtros.</Empty> : (
              <>
                <ul className="ha-tl">{lista.slice(0, limite).map((e) => <Item key={e.id} e={e} espera={m.esperaPorEvento[e.id]} onVer={setVer} />)}</ul>
                {lista.length > limite && <div style={{ textAlign: 'center', padding: 14 }}><button type="button" className="ha-chip" onClick={() => setLimite((l) => l + POR_PAGINA)}>Mostrar mais ({lista.length - limite})</button></div>}
              </>
            )}
          </Card>
        </div>
      )}
      {ver && <DiffModal api={api} e={ver} onClose={() => setVer(null)} />}
    </>
  );
}
