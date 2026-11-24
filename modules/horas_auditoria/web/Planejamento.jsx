// Área do Planejamento: lança as horas por distrito e semana (rascunho com salvamento automático) e envia para a Central.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Plus, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Send, Undo2 } from 'lucide-react';
import { Button, Card, Empty, PageHeader, fmtDateTime, money, num, parseMoney, useAction, useAuth, useConfirm, usePrompt, useToast } from '@hub';
import { Diferenca, GradeHoras, Kpi, Status, calcular, clone, statusDe } from './shared.jsx';

/** Um distrito: edita o rascunho (ou mostra o aprovado) e envia. */
export function DistritoCard({ api, plano, d, onAtualizar, onRecarregar, fechado, onAlternar, extra }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const perguntar = usePrompt();
  const [run, busy] = useAction();
  const st = statusDe(d);
  const { modules } = useAuth();
  const papel = modules.find((m) => m.key === 'horas_auditoria')?.role;
  const ehCentral = papel === 'central' || papel === 'ambos';
  const ativo = d.aberta || d.aprovada;
  const [horas, setHoras] = useState(() => clone(ativo.horas));
  const [prog, setProg] = useState(ativo.prog);
  const [progTxt, setProgTxt] = useState(String(ativo.prog || '').replace('.', ','));
  const [estado, setEstado] = useState('');
  const rev = useRef(d.aberta?.rev || 0), timer = useRef(), ocupado = useRef(false), denovo = useRef(false), ult = useRef({ horas, prog });
  const travado = st === 'pendente';

  useEffect(() => () => clearTimeout(timer.current), []);

  const salvar = useCallback(async () => {
    if (ocupado.current) { denovo.current = true; return; }
    ocupado.current = true; setEstado('salvando');
    try {
      const v = await api.put(`/distritos/${d.id}/rascunho`, { horas: ult.current.horas, prog: ult.current.prog, rev: rev.current });
      rev.current = v.rev; setEstado('salvo'); onAtualizar(d.id, v);
    } catch (e) {
      setEstado('erro'); toast(e.message, 'erro');
      if (e.status === 409) onRecarregar();
    } finally {
      ocupado.current = false;
      if (denovo.current) { denovo.current = false; salvar(); }
    }
  }, [api, d.id, onAtualizar, onRecarregar, toast]);

  const agendar = (h, p) => { ult.current = { horas: h, prog: p }; setEstado('pendente'); clearTimeout(timer.current); timer.current = setTimeout(salvar, 700); };
  const aoMudar = (m, w, v) => { const h = clone(horas); h[m][w] = v; setHoras(h); agendar(h, prog); };
  const aoMudarProg = (t) => { setProgTxt(t); const p = parseMoney(t) || 0; setProg(p); agendar(horas, p); };

  /** Garante que o que está na tela já foi gravado antes de enviar. */
  async function gravarAgora() {
    clearTimeout(timer.current);
    if (estado === 'pendente') await salvar();
    while (ocupado.current) await new Promise((r) => setTimeout(r, 80));
  }
  async function enviar() {
    const nota = await perguntar({ titulo: `Enviar ${d.nome} para aprovação`, label: 'Recado para a Central', obrigatorio: false, confirmar: 'Enviar' });
    if (nota === null) return;
    await run(async () => { await gravarAgora(); await api.post(`/distritos/${d.id}/enviar`, { nota }); onRecarregar(); }, 'Enviado para a Central');
  }
  async function aplicar() {
    if (!(await confirmar({ titulo: `Aplicar as alterações em ${d.nome}?`, mensagem: 'Como Central, as horas passam a valer agora, sem enviar para aprovação. Fica registrado no histórico.', confirmar: 'Aplicar' }))) return;
    await run(async () => { await gravarAgora(); await api.post(`/central/distritos/${d.id}/aplicar`); onRecarregar(); }, 'Alterações aplicadas — já valem');
  }
  async function descartar() {
    if (!(await confirmar({ titulo: 'Descartar alterações?', mensagem: 'O rascunho some e a versão aprovada continua valendo.', confirmar: 'Descartar', perigo: true }))) return;
    await run(async () => { clearTimeout(timer.current); await api.post(`/distritos/${d.id}/descartar`); onRecarregar(); }, 'Rascunho descartado');
  }

  const c = calcular(plano, horas, prog);
  const base = d.aprovada;
  const podeEnviar = !travado && (d.aberta || estado !== '');
  return (
    <Card className="ha-card">
      <div className="ha-card-top">
        <button type="button" className="btn btn-outline" style={{ padding: '4px 8px' }} onClick={onAlternar} aria-expanded={!fechado} title={fechado ? 'Expandir' : 'Minimizar'}>{fechado ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button>
        <h2>{d.nome}</h2><Status s={st} />
        {fechado && <><span className="muted small">{num(calcular(plano, horas, prog).horas)} h · {money(calcular(plano, horas, prog).budget)}</span></>}
        {estado === 'salvando' && <span className="ha-salvo">Salvando…</span>}
        {estado === 'pendente' && <span className="ha-salvo">Alterações ainda não salvas…</span>}
        {estado === 'salvo' && <span className="ha-salvo">Rascunho salvo</span>}
        <span className="ha-sp" />
        {podeEnviar && <>
          <Button variant="outline" onClick={descartar} disabled={busy}><Undo2 size={15} /> Descartar</Button>
          {ehCentral && <Button variant="outline" onClick={aplicar} disabled={busy}><Check size={15} /> Aplicar direto</Button>}
          <Button onClick={enviar} disabled={busy}><Send size={15} /> Enviar para aprovação</Button>
        </>}
        {extra}
      </div>
      {!fechado && <>
      {st === 'reprovado' && <div className="ha-aviso ha-aviso-ruim"><b>Pedido reprovado por {d.aberta.decidido_por || 'Central'}</b> em {fmtDateTime(d.aberta.decidido_em)} · solicitado por <b>{d.aberta.por}</b><br /><b>Motivo:</b> {d.aberta.motivo}<br />A versão aprovada continua valendo. Qualquer planejador pode ajustar abaixo e enviar de novo.</div>}
      {st === 'pendente' && <div className="ha-aviso ha-aviso-pend">Enviado por <b>{d.aberta.por}</b> em {fmtDateTime(d.aberta.enviado_em)}{d.aberta.nota ? ` · “${d.aberta.nota}”` : ''}. Aguardando a Central — não dá para editar até ela responder.</div>}
      {st === 'rascunho' && <div className="ha-aviso ha-aviso-azul">Rascunho de <b>{d.aberta.por}</b> · última edição {fmtDateTime(d.aberta.atualizado)}. Ainda não enviado; a versão aprovada continua valendo até a Central aprovar. Todos os planejadores podem editar.</div>}
      <GradeHoras plano={plano} horas={horas} prog={prog} comparar={st !== 'aprovada' ? base.horas : undefined} onChange={aoMudar} disabled={travado} />
      <div className="ha-rodape">
        <div><small>Horas</small><b>{num(c.horas)} h</b></div>
        <div><small>Budget (R$)</small><b>{money(c.budget)}</b></div>
        <div><small>Budget programado</small><input value={progTxt} onChange={(e) => aoMudarProg(e.target.value)} disabled={travado} inputMode="decimal" placeholder="0,00" /></div>
        <div><small>Diferença</small><Diferenca dif={c.dif} prog={c.prog} /></div>
        <div className="muted small">Aprovado hoje: {base.decidido_por ? `${base.decidido_por}, ` : ''}{fmtDateTime(base.decidido_em)}</div>
      </div>
      </>}
    </Card>
  );
}

export default function Planejamento({ api }) {
  const [planos, setPlanos] = useState(null);
  const [sp] = useSearchParams(); // ?p=planejamento&d=distrito (vem do botão "Lançar horas" da Central)
  const [pid, setPid] = useState(sp.get('p') || '');
  const [det, setDet] = useState(null);
  const [filtro, setFiltro] = useState(sp.get('d') || '');
  const perguntar = usePrompt();
  const [run, busy] = useAction();
  const [fechados, setFechados] = useState(() => new Set()); // distritos minimizados
  const alternar = (id) => setFechados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [gen, setGen] = useState(0); // muda para recriar os cartões depois de enviar/descartar/recarregar

  const [erro, setErro] = useState('');
  useEffect(() => { api.get('/planejamentos').then((l) => { setPlanos(l); if (l.length) setPid((p) => p || String(l[0].id)); }).catch((e) => setErro(e.message)); }, []);
  const carregar = useCallback(async () => {
    if (!pid) return;
    try { setDet(await api.get(`/planejamentos/${pid}`)); setGen((g) => g + 1); } catch (e) { setErro(e.message); }
  }, [api, pid]);
  useEffect(() => { setDet(null); carregar(); }, [pid]);

  const atualizar = useCallback((id, v) => setDet((x) => x && ({ ...x, distritos: x.distritos.map((d) => (d.id === id ? { ...d, aberta: v } : d)) })), []);

  async function novoDistrito() {
    const nome = await perguntar({ titulo: 'Novo distrito', label: 'Nome do distrito', obrigatorio: true, confirmar: 'Criar' });
    if (!nome) return;
    await run(async () => { const d = await api.post(`/planejamentos/${pid}/distritos`, { nome }); await carregar(); setFiltro(String(d.id)); }, 'Distrito criado — lance as horas e envie para a Central');
  }

  if (erro) return <Empty>Não foi possível carregar: {erro}</Empty>;
  if (!planos) return <Empty>Carregando…</Empty>;
  if (!planos.length) return <><PageHeader back="/" title="Planejamento de horas" /><Empty>Ainda não há nenhum planejamento. A Central cria o primeiro (aba Planejamentos).</Empty></>;
  const lista = det ? det.distritos.filter((d) => !filtro || String(d.id) === filtro) : [];
  const pend = det ? det.distritos.filter((d) => d.aberta?.status === 'pendente').length : 0, rep = det ? det.distritos.filter((d) => statusDe(d) === 'reprovado').length : 0;
  const rasc = det ? det.distritos.filter((d) => d.aberta?.status === 'rascunho').length - rep : 0;
  return (
    <>
      <PageHeader back="/" title="Planejamento de horas" subtitle="Lance as horas por distrito e semana. A Central compara com a versão atual e aprova antes de valer." />
      <div className="ha-linha">
        <label className="field"><span className="field-label">Planejamento</span>
          <select value={pid} onChange={(e) => { setPid(e.target.value); setFiltro(''); }}>{planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
        <label className="field"><span className="field-label">Distrito</span>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="">Todos</option>{det?.distritos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></label>
        <span className="ha-sp" />
        <Button onClick={novoDistrito} disabled={!det || busy}><Plus size={15} /> Novo distrito</Button>
        {det && <><Button variant="outline" onClick={() => setFechados(new Set(det.distritos.map((d) => d.id)))}><ChevronsDownUp size={15} /> Minimizar todos</Button>
          <Button variant="outline" onClick={() => setFechados(new Set())}><ChevronsUpDown size={15} /> Expandir todos</Button></>}
      </div>
      {det && <div className="ha-kpis"><Kpi rotulo="Distritos" valor={det.distritos.length} /><Kpi rotulo="Aguardando a Central" valor={pend} /><Kpi rotulo="Rascunhos" valor={rasc} /><Kpi rotulo="Reprovados" valor={rep} tom={rep ? 'ruim' : undefined} detalhe="precisam de ajuste" /></div>}
      {!det ? <Empty>Carregando…</Empty> : !lista.length ? <Empty>Nenhum distrito neste planejamento.</Empty>
        : lista.map((d) => <DistritoCard key={`${d.id}-${gen}`} api={api} plano={det.plano} d={d} onAtualizar={atualizar} onRecarregar={carregar} fechado={fechados.has(d.id)} onAlternar={() => alternar(d.id)} />)}
    </>
  );
}
