import { useEffect, useMemo, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Plus, Send, Repeat, Undo2, Pencil, Trash2, UserRound } from 'lucide-react';
import { Button, Card, Empty, FiltroSelect, PageHeader, fmtDate, norm, useAction, useConfirm, usePrompt } from '@hub';
import { Barra, Kpi, PedidoModal, Status, UsuarioModal, dash, qtdTipo, useSelecao } from './shared.jsx';

const KPIS = ['rascunho', 'enviado', 'reservado', 'em_uso', 'devolucao_pendente'];

function useCfg(api) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api.get('/config').then(setCfg); }, []);
  return cfg;
}

// ------------------------------------------------------------------ Solicitações
function Solicitacoes({ api }) {
  const cfg = useCfg(api);
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [tipo, setTipo] = useState('');
  const [modal, setModal] = useState(null); // 'nova' | solicitação em edição
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const perguntar = usePrompt();
  const load = () => api.get('/minhas').then(setLista);
  useEffect(() => { load(); }, []);
  const all = lista || [];
  const rascunhos = all.filter((s) => s.status === 'rascunho');
  const vis = useMemo(() => all.filter((s) => (!busca || norm(`${s.codigo} ${s.projeto} ${s.base} ${s.colaborador || ''}`).includes(norm(busca)))
    && (!status || s.status === status) && (!tipo || s.itens.some((i) => i.tipo === tipo))), [all, busca, status, tipo]);
  const acao = async (fn, ok) => { if (await run(fn, ok)) load(); };

  const enviar = async () => {
    if (!await confirmar({ titulo: `Enviar ${rascunhos.length} solicitação(ões)?`, mensagem: 'Elas seguem para o Administrativo, que reserva os equipamentos.', confirmar: 'Enviar' })) return;
    acao(() => api.post('/solicitacoes/enviar'), (r) => `${r.enviadas} solicitação(ões) enviada(s) ao Administrativo`);
  };
  const colaborador = async (s) => {
    const nome = await perguntar({ titulo: `Colaborador de ${s.codigo}`, label: 'Nome completo', obrigatorio: true, valor: s.colaborador || '' });
    if (nome) acao(() => api.post('/solicitacoes/substituir', { ids: [s.id], nome: nome.split('\n')[0] }), 'Colaborador atualizado');
  };
  const excluir = async (s) => {
    if (await confirmar({ titulo: `Excluir ${s.codigo}?`, mensagem: 'O rascunho será apagado.', confirmar: 'Excluir', perigo: true })) acao(() => api.post(`/solicitacoes/${s.id}/excluir`), 'Rascunho excluído');
  };
  const devolver = async (s) => {
    if (await confirmar({ titulo: `Pedir devolução de ${s.codigo}?`, mensagem: 'O Administrativo é avisado e confirma quando os equipamentos voltarem.', confirmar: 'Pedir devolução' })) {
      acao(() => api.post('/solicitacoes/devolver', { ids: [s.id] }), 'Devolução solicitada');
    }
  };

  return (
    <>
      <PageHeader title="Solicitar equipamento" subtitle="Monte os pedidos como rascunho e envie todos de uma vez ao Administrativo." back="/"
        actions={<>
          <Button variant="outline" onClick={enviar} disabled={busy || !rascunhos.length}><Send size={15} /> Enviar {rascunhos.length} solicitação(ões)</Button>
          <Button onClick={() => setModal('nova')} disabled={!cfg}><Plus size={16} /> Adicionar</Button>
        </>} />
      <div className="eq-kpis">
        {KPIS.map((k) => <Kpi key={k} rotulo={cfg?.status_req[k] || k} valor={all.filter((s) => s.status === k).length} ativo={status === k} onClick={() => setStatus(status === k ? '' : k)} />)}
      </div>
      <div className="eq-filtros">
        <label className="kit-filtro eq-busca"><span>Buscar</span><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, projeto, base ou colaborador" /></label>
        <FiltroSelect label="Status" value={status} onChange={setStatus} options={KPIS.map((k) => ({ value: k, label: cfg?.status_req[k] || k }))} />
        <FiltroSelect label="Tipo" value={tipo} onChange={setTipo} options={cfg?.tipos || []} />
      </div>
      <Card className="eq-card-tabela">
        {lista === null || !cfg ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>Nenhuma solicitação encontrada.</Empty> : (
          <table className="table eq-table" style={{ minWidth: 1100 }}>
            <thead><tr><th>Código</th><th>Colaborador</th><th>Projeto</th><th>Base</th><th>Retirada</th><th>Devolução</th>
              {cfg.tipos.map((t) => <th key={t} className="num">{t === 'Chip telefônico' ? 'Chip' : t}</th>)}<th>Status</th><th /></tr></thead>
            <tbody>
              {vis.map((s) => (
                <tr key={s.id}>
                  <td className="cell-strong">{s.codigo}</td>
                  <td>{dash(s.colaborador)}</td>
                  <td>{s.projeto}</td>
                  <td>{s.base}</td>
                  <td>{fmtDate(s.retirada)}</td>
                  <td>{fmtDate(s.devolucao)}</td>
                  {cfg.tipos.map((t) => <td key={t} className="num">{qtdTipo(s, t)}</td>)}
                  <td><Status s={s.status} label={s.status_label} /></td>
                  <td className="eq-acoes">
                    {s.status === 'rascunho' && <Button variant="outline" className="btn-sm" onClick={() => setModal(s)}><Pencil size={13} /> Editar</Button>}
                    {s.status === 'rascunho' && <Button variant="outline" className="btn-sm" onClick={() => excluir(s)} aria-label="Excluir"><Trash2 size={13} /></Button>}
                    {s.status !== 'devolvido' && <Button variant="outline" className="btn-sm" onClick={() => colaborador(s)}><UserRound size={13} /> Colaborador</Button>}
                    <Button variant="outline" className="btn-sm" onClick={() => acao(() => api.post('/solicitacoes/troca', { ids: [s.id] }), 'Troca criada como rascunho')}><Repeat size={13} /> Trocar</Button>
                    {s.status === 'em_uso' && <Button variant="outline" className="btn-sm" onClick={() => devolver(s)}><Undo2 size={13} /> Devolver</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {modal && cfg && (
        <PedidoModal cfg={cfg} inicial={modal === 'nova' ? null : modal} onClose={() => setModal(null)}
          onSalvar={async (f) => { const r = modal === 'nova' ? await api.post('/solicitacoes', f) : await api.put(`/solicitacoes/${modal.id}`, f); load(); return r; }} />
      )}
    </>
  );
}

// ------------------------------------------------------------------ Responsáveis
function Responsaveis({ api }) {
  const cfg = useCfg(api);
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [base, setBase] = useState('');
  const [usuario, setUsuario] = useState(null); // { ids, titulo }
  const { sel, alternar, marcarTodos, limpar } = useSelecao();
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const load = () => api.get('/responsaveis').then(setLista);
  useEffect(() => { load(); }, []);

  // um grupo por pessoa; equipamentos sem usuário ficam em linhas próprias
  const grupos = useMemo(() => {
    const m = new Map();
    for (const e of lista || []) {
      const k = e.colaborador ? `p:${e.colaborador}` : `e:${e.id}`;
      if (!m.has(k)) m.set(k, { k, nome: e.colaborador || '', projeto: e.projeto, superior: e.superior, base: e.base, eqs: [] });
      m.get(k).eqs.push(e);
    }
    return [...m.values()];
  }, [lista]);
  const vis = grupos.filter((g) => (!busca || norm(`${g.nome} ${g.eqs.map((e) => e.patrimonio).join(' ')}`).includes(norm(busca)))
    && (!tipo || g.eqs.some((e) => e.tipo === tipo)) && (!base || g.base === base));
  const idsDe = (ks) => grupos.filter((g) => ks.includes(g.k)).flatMap((g) => g.eqs.map((e) => e.id));
  const acao = async (fn, ok) => { if (await run(fn, ok)) { limpar(); load(); } };

  const devolver = async (ks) => {
    if (await confirmar({ titulo: 'Solicitar devolução?', mensagem: 'O Administrativo é avisado e confirma quando os equipamentos voltarem.', confirmar: 'Pedir devolução' })) {
      acao(() => api.post('/responsaveis/devolver', { ids: idsDe(ks) }), (r) => `${r.devolucoes} devolução(ões) solicitada(s)`);
    }
  };
  const trocar = (ks) => acao(() => api.post('/responsaveis/troca', { ids: idsDe(ks) }), (r) => `${r.criadas} solicitação(ões) de troca criada(s) como rascunho`);
  const todos = vis.length > 0 && vis.every((g) => sel.has(g.k));
  const ks = [...sel];

  return (
    <>
      <PageHeader title="Responsáveis pelos equipamentos" subtitle="Equipamentos que saíram dos seus pedidos e estão com cada pessoa." back="/" />
      <div className="eq-filtros">
        <label className="kit-filtro eq-busca"><span>Buscar</span><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Responsável ou patrimônio" /></label>
        <FiltroSelect label="Tipo" value={tipo} onChange={setTipo} options={cfg?.tipos || []} />
        <FiltroSelect label="Base" value={base} onChange={setBase} options={cfg?.bases || []} />
      </div>
      <Barra n={ks.length} vazio="Selecione responsáveis para ações em massa">
        <Button variant="outline" disabled={!ks.length || busy} onClick={() => trocar(ks)}><Repeat size={15} /> Solicitar troca</Button>
        <Button variant="outline" disabled={!ks.length || busy} onClick={() => setUsuario({ ids: idsDe(ks), titulo: 'Substituir usuário' })}><UserRound size={15} /> Substituir usuário</Button>
        <Button disabled={!ks.length || busy} onClick={() => devolver(ks)}><Undo2 size={15} /> Solicitar devolução</Button>
      </Barra>
      <Card className="eq-card-tabela">
        {lista === null ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>Nenhum responsável encontrado.</Empty> : (
          <table className="table eq-table" style={{ minWidth: 1000 }}>
            <thead><tr><th><input type="checkbox" checked={todos} onChange={(e) => marcarTodos(vis.map((g) => g.k), e.target.checked)} aria-label="Selecionar todos" /></th>
              <th>Responsável</th><th>Projeto</th><th>Superior</th><th>Base</th><th>Equipamentos</th><th className="num">Qtd</th><th>Início</th><th>Fim</th><th>Status</th><th /></tr></thead>
            <tbody>
              {vis.map((g) => {
                const pend = g.eqs.some((e) => e.status === 'devolucao_pendente');
                const inicio = g.eqs.map((e) => e.inicio).filter(Boolean).sort()[0];
                const fim = g.eqs.map((e) => e.fim).filter(Boolean).sort().pop();
                return (
                  <tr key={g.k} className={sel.has(g.k) ? 'eq-sel' : ''}>
                    <td><input type="checkbox" checked={sel.has(g.k)} onChange={() => alternar(g.k)} aria-label={`Selecionar ${g.nome || 'equipamento'}`} /></td>
                    <td className="cell-strong">{g.nome || <span className="muted">Sem usuário</span>}</td>
                    <td>{dash(g.projeto)}</td><td>{dash(g.superior)}</td><td>{g.base}</td>
                    <td className="small">{g.eqs.map((e) => <div key={e.id}>{e.modelo} ({e.patrimonio})</div>)}</td>
                    <td className="num">{g.eqs.length}</td><td>{fmtDate(inicio)}</td><td>{fmtDate(fim)}</td>
                    <td><Status s={pend ? 'devolucao_pendente' : 'em_uso'} label={pend ? 'Devolução pendente' : 'Em uso'} /></td>
                    <td className="eq-acoes">
                      <Button variant="outline" className="btn-sm" onClick={() => setUsuario({ ids: idsDe([g.k]), titulo: g.nome ? 'Substituir usuário' : 'Adicionar usuário' })}>{g.nome ? 'Substituir' : 'Adicionar usuário'}</Button>
                      <Button variant="outline" className="btn-sm" onClick={() => devolver([g.k])} disabled={pend || busy}>Devolver</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {usuario && (
        <UsuarioModal projetos={cfg?.projetos} titulo={usuario.titulo} ok="Salvar" onClose={() => setUsuario(null)}
          onSalvar={async (f) => { const r = await api.post('/responsaveis/usuario', { ...f, ids: usuario.ids }); limpar(); load(); return r; }} />
      )}
    </>
  );
}

export default function Solicitante(props) {
  return (
    <Routes>
      <Route index element={<Solicitacoes {...props} />} />
      <Route path="responsaveis" element={<Responsaveis {...props} />} />
    </Routes>
  );
}
