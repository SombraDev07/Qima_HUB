// Histórico em formato de painel: indicadores, gráficos, ranking por distrito e por pessoa, e a linha do tempo
// com o antes × depois de cada envio. Serve as duas áreas (Planejamento e Central).
import { useEffect, useMemo, useState } from 'react';
import { Card, Empty, Modal, PageHeader, money, num } from '@hub';
import { Comparacao, Delta, Diferenca, Pill, dataHora } from './shared.jsx';

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

    const pessoas = [...new Set(asc.map((e) => e.por_nome).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { asc, jan, esperaPorEvento: espera, pessoas, nomes };
  }, [data, pid, periodo, dist, pessoa]);

  if (erro) return <Empty>Não foi possível carregar: {erro}</Empty>;
  if (!data) return <Empty>Carregando…</Empty>;
  if (!data.planos.length) return <><PageHeader back="/" title="Histórico" /><Empty>Ainda não há planejamentos.</Empty></>;

  const lista = m ? m.jan.filter((e) => (!filtro ? true : filtro === 'outros' ? !['enviada', 'aprovada', 'reprovada'].includes(e.acao) : e.acao === filtro)).slice().reverse() : [];
  return (
    <>
      <PageHeader back="/" title="Histórico de alterações" subtitle="Quem alterou, enviou, aprovou ou reprovou cada distrito — com o antes e o depois. Os gráficos de dados estão na aba Painel." />
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
      )}
      {ver && <DiffModal api={api} e={ver} onClose={() => setVer(null)} />}
    </>
  );
}

