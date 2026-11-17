import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Search, MessageSquare, FileSpreadsheet, Play, Undo2, CheckCircle2, RotateCcw, Plus, User } from 'lucide-react';
import { Button, Card, Empty, Modal, PageHeader, fmtDate, norm, useAction, useConfirm } from '@hub';
import { Conversa, DadosPedido, Status } from './shared.jsx';

const COLUNAS = [
  { k: 'pendente', titulo: 'Pendentes', cls: 'pend', f: (p) => p.status === 'pendente' },
  { k: 'analise', titulo: 'Em análise', cls: 'anal', f: (p) => p.status === 'analise' },
  { k: 'correcao', titulo: 'Aguardando solicitante', cls: 'corr', f: (p) => p.status === 'correcao' },
  { k: 'feito', titulo: 'Feitos', cls: 'feit', f: (p) => ['feito', 'cancelado'].includes(p.status) },
];

function Detalhe({ api, id, onClose, onMudou }) {
  const [p, setP] = useState(null);
  const [t, setT] = useState('');
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const load = () => api.get(`/pedidos/${id}?lado=central`).then((x) => { setP(x); onMudou(); });
  useEffect(() => { load(); }, [id]);
  const mudar = async (status, msgOk) => {
    if (status === 'correcao' && !t.trim()) return run(async () => { throw new Error('Escreva o que está errado para o solicitante corrigir.'); });
    if (status === 'feito' && !await confirmar({ titulo: `Concluir ${p.codigo}?`, mensagem: `O solicitante recebe um e-mail avisando que foi feito.${t.trim() ? '' : '\nSem observação.'}`, confirmar: 'Concluir' })) return;
    const r = await run(() => api.post(`/central/pedidos/${p.id}/status`, { status, mensagem: t }), msgOk);
    if (r) { setP(r); setT(''); onMudou(); }
  };
  return (
    <Modal title={p ? `${p.codigo} · ${p.tipo_label}` : 'Carregando…'} onClose={onClose} wide>
      {!p ? <Empty>Carregando…</Empty> : (
        <div className="sl-det">
          <div className="sl-det-dados">
            <div className="sl-det-status"><Status p={p} />{p.responsavel_nome && <span className="small muted"><User size={13} /> {p.responsavel_nome}</span>}</div>
            <DadosPedido p={p} central />
          </div>
          <div className="sl-det-lado">
            <Conversa api={api} pedido={p} lado="central" />
            {p.status !== 'cancelado' && (
              <div className="sl-det-acoes">
                <div className="sl-label">Observação / retorno ao solicitante</div>
                <textarea rows={3} value={t} onChange={(e) => setT(e.target.value)} placeholder="Ex.: a linha 3 tem a data errada; a visita V-1020 não existe no sistema…" />
                <div className="sl-det-botoes">
                  {p.status === 'pendente' && <Button variant="outline" onClick={() => mudar('analise', 'Em análise')} disabled={busy}><Play size={15} /> Pegar (em análise)</Button>}
                  {['pendente', 'analise'].includes(p.status) && <Button variant="outline" className="sl-btn-corr" onClick={() => mudar('correcao', 'Devolvida para correção · o solicitante foi avisado')} disabled={busy}><Undo2 size={15} /> Devolver para correção</Button>}
                  {['pendente', 'analise'].includes(p.status) && <Button onClick={() => mudar('feito', 'Concluída · e-mail enviado ao solicitante')} disabled={busy}><CheckCircle2 size={15} /> Concluir</Button>}
                  {p.status === 'correcao' && <Button variant="outline" onClick={() => mudar('analise', 'Voltou para análise')} disabled={busy}><RotateCcw size={15} /> Voltar para análise</Button>}
                  {p.status === 'feito' && <Button variant="outline" onClick={() => mudar('analise', 'Reaberta')} disabled={busy}><RotateCcw size={15} /> Reabrir</Button>}
                </div>
                <p className="small muted sl-m0">"Devolver para correção" exige a explicação, que vai para a conversa e por e-mail. O solicitante corrige e a solicitação volta para Pendentes.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Quadro({ api }) {
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState('');
  const [todos, setTodos] = useState(false);
  const [sel, setSel] = useState(null);
  const load = () => api.get(`/central/pedidos${todos ? '?todos=1' : ''}`).then(setLista);
  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, [todos]);
  const vis = (lista || []).filter((p) => !busca || norm(`${p.codigo} ${p.solicitante_nome} ${p.tipo_label} ${p.cod_visita || ''} ${p.titulo || ''} ${p.id_carga || ''}`).includes(norm(busca)));
  return (
    <>
      <PageHeader title="Central Harvest" subtitle="Os cards andam de Pendente para Em análise e Feitos. Achou erro? Devolva para correção com a explicação." back="/"
        actions={<Button variant="outline" onClick={() => { window.location.href = '/api/m/solicitacoes/central/exportar'; }}><FileSpreadsheet size={15} /> Excel</Button>} />
      <div className="sl-busca-bar">
        <label className="sl-busca"><Search size={16} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número, solicitante, tipo, código da visita, carga ou título" /></label>
        <label className="check small"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Feitos antigos (mais de 60 dias)</label>
      </div>
      {lista === null ? <Empty>Carregando…</Empty> : (
        <div className="sl-quadro">
          {COLUNAS.map((c) => {
            const itens = vis.filter(c.f);
            return (
              <div key={c.k} className={`sl-col sl-col-${c.cls}`}>
                <div className="sl-col-head">{c.titulo} <b>{itens.length}</b></div>
                <div className="sl-col-itens">
                  {!itens.length ? <div className="muted small sl-vazio">Nenhuma</div> : itens.map((p) => (
                    <button key={p.id} className={`sl-card ${p.msgs_solicitante ? 'nova' : ''}`} onClick={() => setSel(p.id)}>
                      <div className="sl-card-top"><b>{p.codigo}</b>{p.msgs_solicitante > 0 && <span className="sl-nova-msg"><MessageSquare size={12} /> {p.msgs_solicitante}</span>}</div>
                      <div>{p.solicitante_nome}</div>
                      <div className="small muted">{fmtDate(p.created_at)} · {p.tipo_label}</div>
                      {(p.cod_visita || p.titulo || p.linhas_qtd > 0) && <div className="small">{p.cod_visita ? `Visita ${p.cod_visita}` : p.titulo || `${p.linhas_qtd} linha(s)`}{p.anexo ? ' · 📎' : ''}</div>}
                      {p.status === 'cancelado' && <span className="sl-st sl-st-cinza">Cancelado</span>}
                      {p.responsavel_nome && p.status !== 'pendente' && <div className="small muted">com {p.responsavel_nome}</div>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {sel && <Detalhe api={api} id={sel} onClose={() => { setSel(null); load(); }} onMudou={() => window.dispatchEvent(new Event('qh:atualizar'))} />}
    </>
  );
}

function Projetos({ api }) {
  const [lista, setLista] = useState(null);
  const [nome, setNome] = useState('');
  const [run, busy] = useAction();
  const load = () => api.get('/central/projetos').then(setLista);
  useEffect(() => { load(); }, []);
  const add = async () => { if (await run(() => api.post('/central/projetos', { nome }), 'Projeto adicionado')) { setNome(''); load(); } };
  return (
    <>
      <PageHeader title="Projetos" subtitle="Projetos que aparecem no formulário de nova solicitação." back="/" />
      <Card className="sl-proj">
        <div className="sl-proj-add"><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Novo projeto" onKeyDown={(e) => e.key === 'Enter' && nome.trim() && add()} />
          <Button onClick={add} disabled={busy || !nome.trim()}><Plus size={15} /> Adicionar</Button></div>
        {!lista ? <Empty>Carregando…</Empty> : (
          <ul className="sl-proj-lista">
            {lista.map((p) => (
              <li key={p.id} className={p.ativo ? '' : 'inativo'}><b>{p.nome}</b>
                <button className="sl-link" onClick={async () => { if (await run(() => api.put(`/central/projetos/${p.id}`, { ativo: !p.ativo }), p.ativo ? 'Desativado' : 'Reativado')) load(); }}>{p.ativo ? 'Desativar' : 'Reativar'}</button></li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function Central(props) {
  return (
    <Routes>
      <Route index element={<Quadro {...props} />} />
      <Route path="projetos" element={<Projetos {...props} />} />
    </Routes>
  );
}
