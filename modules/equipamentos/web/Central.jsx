import { useEffect, useMemo, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Plus, UserPlus, ArrowLeftRight, History, Pencil, ArrowDownToLine, Trash2, X, Send, Undo2 } from 'lucide-react';
import { Button, Card, Empty, Field, FiltroSelect, Modal, PageHeader, fmtDate, fmtDateTime, money, norm, useAction, useConfirm } from '@hub';
import { Barra, DadosSolicitacao, Kpi, Status, UsuarioModal, dash, qtdTipo, useSelecao } from './shared.jsx';

const POR_PAGINA = 200;

function useCfg(api) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api.get('/config').then(setCfg); }, []);
  return cfg;
}

// ------------------------------------------------------------------ cadastro / edição de equipamento
function EquipamentoModal({ cfg, inicial, onClose, onSalvar }) {
  const [f, setF] = useState(() => ({
    tipo: inicial?.tipo || cfg.tipos[0], base: inicial?.base || cfg.bases[0], modelo: inicial?.modelo || '', patrimonio: inicial?.patrimonio || '',
    serie: inicial?.serie || '', data_compra: inicial?.data_compra || '', valor: inicial?.valor ? String(inicial.valor) : '', obs: inicial?.obs || '',
  }));
  const [run, busy] = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const salvar = async () => { if (await run(() => onSalvar(f), inicial ? 'Equipamento atualizado' : `Equipamento ${f.patrimonio} cadastrado em estoque`)) onClose(); };
  return (
    <Modal title={inicial ? `Editar ${inicial.patrimonio}` : 'Cadastrar equipamento'} onClose={onClose} wide
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={salvar} disabled={busy || !f.modelo.trim() || !f.patrimonio.trim()}>{inicial ? 'Salvar' : 'Cadastrar'}</Button></>}>
      <div className="eq-grid2">
        <Field label="Tipo"><select value={f.tipo} onChange={set('tipo')}>{cfg.tipos.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Base"><select value={f.base} onChange={set('base')}>{cfg.bases.map((b) => <option key={b}>{b}</option>)}</select></Field>
        <Field label="Modelo"><input value={f.modelo} onChange={set('modelo')} placeholder="Ex.: Aspire 5" maxLength={120} autoFocus /></Field>
        <Field label="Patrimônio"><input value={f.patrimonio} onChange={set('patrimonio')} placeholder="Ex.: QIMA12354800" maxLength={60} /></Field>
        <Field label="Nº série / IMEI"><input value={f.serie} onChange={set('serie')} placeholder="Opcional" maxLength={80} /></Field>
        <Field label="Data de compra"><input type="date" value={f.data_compra || ''} onChange={set('data_compra')} /></Field>
        <Field label="Valor (R$)"><input inputMode="decimal" value={f.valor} onChange={set('valor')} placeholder="0,00" /></Field>
        {!inicial && <Field label="Status inicial"><input value="Em estoque" disabled /></Field>}
      </div>
      <Field label="Observação"><textarea rows={2} value={f.obs || ''} onChange={set('obs')} placeholder="Ex.: configuração, acessórios" maxLength={500} /></Field>
    </Modal>
  );
}

function HistoricoModal({ api, e, onClose }) {
  const [h, setH] = useState(null);
  useEffect(() => { api.get(`/central/equipamentos/${e.id}/historico`).then(setH); }, []);
  return (
    <Modal title={`Histórico · ${e.modelo} (${e.patrimonio})`} onClose={onClose}>
      {!h ? <Empty>Carregando…</Empty> : !h.length ? <Empty>Sem movimentações.</Empty> : (
        <ul className="eq-hist">
          {h.map((x) => (
            <li key={x.id}><b>{x.acao}</b>{x.detalhe && <span> · {x.detalhe}</span>}<div className="small muted">{fmtDateTime(x.created_at)} · {x.usuario_nome || 'Sistema'}</div></li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ Equipamentos
function Equipamentos({ api }) {
  const cfg = useCfg(api);
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [status, setStatus] = useState('');
  const [base, setBase] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [modal, setModal] = useState(null); // { k: 'novo' | 'editar' | 'historico' | 'usuario', ... }
  const { sel, alternar, marcarTodos, limpar } = useSelecao();
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const load = () => api.get('/central/equipamentos').then(setLista);
  useEffect(() => { load(); }, []);
  const all = lista || [];
  const cnt = (s) => all.filter((e) => e.status === s).length;
  const vis = useMemo(() => all.filter((e) => (!busca || norm(`${e.patrimonio} ${e.serie || ''} ${e.colaborador || ''} ${e.modelo}`).includes(norm(busca)))
    && (!tipo || e.tipo === tipo) && (!status || e.status === status) && (!base || e.base === base)), [all, busca, tipo, status, base]);
  const mostrados = vis.slice(0, limite);
  const ids = [...sel];
  const acao = async (fn, ok) => { if (await run(fn, ok)) { limpar(); load(); } };
  useEffect(() => { setLimite(POR_PAGINA); }, [busca, tipo, status, base]);

  const devolucao = async (lista) => {
    if (await confirmar({ titulo: 'Confirmar devolução?', mensagem: `${lista.length} equipamento(s) voltam para o estoque e o usuário é desvinculado. O histórico é mantido.`, confirmar: 'Confirmar devolução' })) {
      acao(() => api.post('/central/equipamentos/devolucao', { ids: lista }), (r) => `Devolução confirmada para ${r.devolvidos} equipamento(s)`);
    }
  };
  const baixa = async (lista) => {
    if (await confirmar({ titulo: 'Dar baixa?', mensagem: `${lista.length} equipamento(s) saem do estoque e o vínculo com o usuário é encerrado.`, confirmar: 'Dar baixa', perigo: true })) {
      acao(() => api.post('/central/equipamentos/baixa', { ids: lista }), (r) => `${r.baixados} equipamento(s) com baixa registrada`);
    }
  };
  const excluir = async (lista) => {
    if (await confirmar({ titulo: 'Excluir equipamentos?', mensagem: `Excluir ${lista.length} equipamento(s)? Isso apaga também o histórico e não pode ser desfeito.`, confirmar: 'Excluir', perigo: true })) {
      acao(() => api.post('/central/equipamentos/excluir', { ids: lista }), (r) => `${r.excluidos} equipamento(s) excluído(s)`);
    }
  };
  const todos = vis.length > 0 && vis.every((e) => sel.has(e.id));

  return (
    <>
      <PageHeader title="Gestão de equipamentos" subtitle="Parque completo: estoque, reservas, equipamentos em uso e devoluções." back="/"
        actions={<Button onClick={() => setModal({ k: 'novo' })} disabled={!cfg}><Plus size={16} /> Adicionar equipamento</Button>} />
      <div className="eq-kpis">
        <Kpi rotulo="Total" valor={all.length} />
        {['estoque', 'reservado', 'em_uso', 'devolucao_pendente'].map((s) => <Kpi key={s} rotulo={cfg?.status_eq[s] || s} valor={cnt(s)} ativo={status === s} onClick={() => setStatus(status === s ? '' : s)} />)}
      </div>
      <div className="eq-filtros">
        <label className="kit-filtro eq-busca"><span>Buscar</span><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Patrimônio, série, modelo ou colaborador" /></label>
        <FiltroSelect label="Tipo" value={tipo} onChange={setTipo} options={cfg?.tipos || []} />
        <FiltroSelect label="Status" value={status} onChange={setStatus} options={Object.entries(cfg?.status_eq || {}).map(([value, label]) => ({ value, label }))} />
        <FiltroSelect label="Base" value={base} onChange={setBase} options={cfg?.bases || []} />
      </div>
      <Barra n={ids.length} vazio="Selecione equipamentos para ações em massa">
        <Button disabled={!ids.length || busy} onClick={() => setModal({ k: 'usuario', ids, substituir: false })}><UserPlus size={15} /> Adicionar usuário</Button>
        <Button variant="outline" disabled={!ids.length || busy} onClick={() => devolucao(ids)}><Undo2 size={15} /> Confirmar devolução</Button>
      </Barra>
      <Card className="eq-card-tabela">
        {lista === null || !cfg ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>Nenhum equipamento encontrado.</Empty> : (
          <>
            <table className="table eq-table" style={{ minWidth: 1250 }}>
              <thead><tr><th><input type="checkbox" checked={todos} onChange={(e) => marcarTodos(vis.map((x) => x.id), e.target.checked)} aria-label="Selecionar todos" /></th>
                <th>Ações</th><th>Tipo</th><th>Modelo</th><th>Patrimônio</th><th>Nº série / IMEI</th><th>Status</th><th>Base</th><th>Compra</th><th className="num">Valor</th>
                <th>Colaborador</th><th>Projeto</th><th>Superior</th><th>Observação</th></tr></thead>
              <tbody>
                {mostrados.map((e) => (
                  <tr key={e.id} className={sel.has(e.id) ? 'eq-sel' : ''}>
                    <td><input type="checkbox" checked={sel.has(e.id)} onChange={() => alternar(e.id)} aria-label={`Selecionar ${e.modelo}`} /></td>
                    <td className="eq-icos">
                      {e.status === 'estoque' && <button className="eq-ico eq-ico-azul" title="Adicionar usuário" aria-label="Adicionar usuário" onClick={() => setModal({ k: 'usuario', ids: [e.id], substituir: false })}><UserPlus size={15} /></button>}
                      {['em_uso', 'devolucao_pendente'].includes(e.status) && <button className="eq-ico" title="Substituir usuário" aria-label="Substituir usuário" onClick={() => setModal({ k: 'usuario', ids: [e.id], substituir: true })}><ArrowLeftRight size={15} /></button>}
                      {['em_uso', 'devolucao_pendente'].includes(e.status) && <button className="eq-ico" title="Confirmar devolução" aria-label="Confirmar devolução" onClick={() => devolucao([e.id])}><Undo2 size={15} /></button>}
                      <button className="eq-ico" title="Histórico" aria-label="Histórico" onClick={() => setModal({ k: 'historico', e })}><History size={15} /></button>
                      <button className="eq-ico" title="Editar" aria-label="Editar" onClick={() => setModal({ k: 'editar', e })}><Pencil size={15} /></button>
                      {e.status !== 'baixado' && <button className="eq-ico" title="Dar baixa" aria-label="Dar baixa" onClick={() => baixa([e.id])}><ArrowDownToLine size={15} /></button>}
                      <button className="eq-ico eq-ico-perigo" title="Excluir" aria-label="Excluir" onClick={() => excluir([e.id])}><Trash2 size={15} /></button>
                    </td>
                    <td>{e.tipo}</td><td>{e.modelo}</td><td className="cell-strong">{e.patrimonio}</td><td>{dash(e.serie)}</td>
                    <td><Status s={e.status} label={e.status_label} /></td><td>{e.base}</td><td>{fmtDate(e.data_compra)}</td>
                    <td className="num">{e.valor ? money(e.valor) : '-'}</td>
                    <td>{dash(e.colaborador)}</td><td>{dash(e.projeto)}</td><td>{dash(e.superior)}</td><td className="small eq-obs">{dash(e.obs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vis.length > limite && <div className="eq-mais"><Button variant="outline" onClick={() => setLimite((l) => l + POR_PAGINA)}>Mostrar mais ({vis.length - limite} restantes)</Button></div>}
          </>
        )}
      </Card>
      {modal?.k === 'novo' && <EquipamentoModal cfg={cfg} onClose={() => setModal(null)} onSalvar={async (f) => { const r = await api.post('/central/equipamentos', f); load(); return r; }} />}
      {modal?.k === 'editar' && <EquipamentoModal cfg={cfg} inicial={modal.e} onClose={() => setModal(null)} onSalvar={async (f) => { const r = await api.put(`/central/equipamentos/${modal.e.id}`, f); load(); return r; }} />}
      {modal?.k === 'historico' && <HistoricoModal api={api} e={modal.e} onClose={() => setModal(null)} />}
      {modal?.k === 'usuario' && (
        <UsuarioModal titulo={modal.substituir ? 'Substituir usuário' : 'Adicionar usuário'} ok={modal.substituir ? 'Substituir' : 'Adicionar'}
          aviso={modal.ids.length > 1 ? `${modal.ids.length} equipamentos selecionados. ${modal.substituir ? '' : 'Os que não estão em estoque são ignorados.'}` : null}
          onClose={() => setModal(null)}
          onSalvar={async (f) => { const r = await api.post('/central/equipamentos/usuario', { ...f, ids: modal.ids, substituir: modal.substituir }); limpar(); load(); return r; }} />
      )}
    </>
  );
}

// ------------------------------------------------------------------ Solicitações
function DetalheSolicitacao({ api, id, onClose, onMudou }) {
  const [s, setS] = useState(null);
  const [escolha, setEscolha] = useState({});
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  useEffect(() => { api.get(`/central/solicitacoes/${id}`).then(setS); }, [id]);
  const aberta = s && ['enviado', 'reservado'].includes(s.status);
  const atualizar = (r) => { setS(r); onMudou(); };

  const anexar = async (tipo) => {
    const eqId = Number(escolha[tipo]);
    if (!eqId) return run(async () => { throw new Error('Selecione um equipamento.'); });
    const r = await run(() => api.post(`/central/solicitacoes/${id}/anexar`, { equipamento_id: eqId }));
    if (r) { setEscolha((x) => ({ ...x, [tipo]: '' })); atualizar(r); }
  };
  const desanexar = async (eqId) => { const r = await run(() => api.post(`/central/solicitacoes/${id}/desanexar`, { equipamento_id: eqId })); if (r) atualizar(r); };
  const enviar = async () => {
    if (!await confirmar({ titulo: `Enviar equipamentos de ${s.codigo}?`, mensagem: `Os equipamentos passam a "Em uso"${s.colaborador ? ` com ${s.colaborador}` : ''} e o solicitante é avisado.`, confirmar: 'Enviar' })) return;
    if (await run(() => api.post(`/central/solicitacoes/${id}/enviar`), 'Equipamentos enviados')) { onMudou(); onClose(); }
  };
  const devolucao = async () => {
    if (!await confirmar({ titulo: `Confirmar devolução de ${s.codigo}?`, mensagem: 'Os equipamentos voltam para o estoque.', confirmar: 'Confirmar devolução' })) return;
    if (await run(() => api.post(`/central/solicitacoes/${id}/devolucao`), 'Devolução confirmada')) { onMudou(); onClose(); }
  };

  return (
    <Modal title={s ? `Solicitação ${s.codigo}` : 'Carregando…'} onClose={onClose} wide
      footer={s && (<>
        <Button variant="outline" onClick={onClose}>Fechar</Button>
        {aberta && <Button onClick={enviar} disabled={busy || !s.completo}><Send size={15} /> Enviar equipamentos</Button>}
        {['em_uso', 'devolucao_pendente'].includes(s.status) && <Button onClick={devolucao} disabled={busy}><Undo2 size={15} /> Confirmar devolução</Button>}
      </>)}>
      {!s ? <Empty>Carregando…</Empty> : (
        <div className="eq-det">
          <div><Status s={s.status} label={s.status_label} /></div>
          <DadosSolicitacao s={s} />
          {s.blocos.map((b) => (
            <div key={b.tipo} className="eq-bloco">
              <div className="eq-bloco-top"><b>{b.tipo}</b><span className={`eq-st eq-st-${b.anexados.length >= b.qtd ? 'verde' : 'laranja'}`}>{b.anexados.length}/{b.qtd} anexados</span></div>
              {b.anexados.map((e) => (
                <div key={e.id} className="eq-anexo"><span>{e.modelo} · {e.patrimonio} <span className="muted small">({e.base})</span></span>
                  {aberta && <button className="icon-btn" onClick={() => desanexar(e.id)} aria-label="Remover equipamento" title="Remover"><X size={16} /></button>}
                </div>
              ))}
              {aberta && b.anexados.length < b.qtd && (
                <div className="eq-anexar">
                  <select value={escolha[b.tipo] || ''} onChange={(e) => setEscolha((x) => ({ ...x, [b.tipo]: e.target.value }))}>
                    <option value="">{b.livres.length ? 'Selecione o equipamento' : 'Sem estoque deste tipo'}</option>
                    {b.livres.map((e) => <option key={e.id} value={e.id}>{e.modelo} - {e.patrimonio} ({e.base})</option>)}
                  </select>
                  <Button onClick={() => anexar(b.tipo)} disabled={busy || !escolha[b.tipo]}>Anexar</Button>
                </div>
              )}
            </div>
          ))}
          {aberta && !s.completo && <p className="small muted eq-m0">Anexe todos os equipamentos pedidos para liberar o envio.</p>}
        </div>
      )}
    </Modal>
  );
}

const ABAS = [
  { k: 'abertas', label: 'Abertas', f: (s) => ['enviado', 'reservado'].includes(s.status) },
  { k: 'uso', label: 'Em uso', f: (s) => s.status === 'em_uso' },
  { k: 'dev', label: 'Devoluções', f: (s) => ['devolucao_pendente', 'devolvido'].includes(s.status) },
  { k: 'todas', label: 'Todas', f: () => true },
];

function Solicitacoes({ api }) {
  const cfg = useCfg(api);
  const [lista, setLista] = useState(null);
  const [aba, setAba] = useState('abertas');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [aberta, setAberta] = useState(null);
  const load = () => api.get('/central/solicitacoes').then(setLista);
  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, []);
  const all = lista || [];
  const f = ABAS.find((a) => a.k === aba).f;
  const vis = all.filter((s) => f(s) && (!busca || norm(`${s.codigo} ${s.colaborador || ''} ${s.projeto} ${s.base} ${s.solicitante_nome}`).includes(norm(busca))) && (!tipo || s.itens.some((i) => i.tipo === tipo)));
  return (
    <>
      <PageHeader title="Solicitações" subtitle="Reserve os equipamentos de cada pedido, envie e acompanhe as devoluções." back="/" />
      <div className="eq-abas">
        {ABAS.map((a) => {
          const n = all.filter(a.f).length;
          return <button key={a.k} className={aba === a.k ? 'on' : ''} onClick={() => setAba(a.k)}>{a.label} ({n})</button>;
        })}
      </div>
      <div className="eq-filtros">
        <label className="kit-filtro eq-busca"><span>Buscar</span><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, colaborador, projeto, base ou solicitante" /></label>
        <FiltroSelect label="Tipo" value={tipo} onChange={setTipo} options={cfg?.tipos || []} />
      </div>
      <Card className="eq-card-tabela">
        {lista === null || !cfg ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>Nenhuma solicitação aqui.</Empty> : (
          <table className="table eq-table" style={{ minWidth: 1200 }}>
            <thead><tr><th>Código</th><th>Solicitante</th><th>Colaborador</th><th>Projeto</th><th>Base</th><th>Retirada</th><th>Devolução</th>
              {cfg.tipos.map((t) => <th key={t} className="num">{t === 'Chip telefônico' ? 'Chip' : t}</th>)}<th>Anexados</th><th>Status</th><th /></tr></thead>
            <tbody>
              {vis.map((s) => (
                <tr key={s.id}>
                  <td className="cell-strong">{s.codigo}</td><td>{s.solicitante_nome}</td><td>{dash(s.colaborador)}</td><td>{s.projeto}</td><td>{s.base}</td>
                  <td>{fmtDate(s.retirada)}</td><td>{fmtDate(s.devolucao)}</td>
                  {cfg.tipos.map((t) => <td key={t} className="num">{qtdTipo(s, t)}</td>)}
                  <td><span className={`eq-st eq-st-${s.anexados >= s.precisa ? 'verde' : 'laranja'}`}>{s.anexados}/{s.precisa}</span></td>
                  <td><Status s={s.status} label={s.status_label} /></td>
                  <td className="eq-acoes"><Button className="btn-sm" onClick={() => setAberta(s.id)}>Abrir</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {aberta && <DetalheSolicitacao api={api} id={aberta} onClose={() => { setAberta(null); load(); }} onMudou={load} />}
    </>
  );
}

export default function Central(props) {
  return (
    <Routes>
      <Route index element={<Equipamentos {...props} />} />
      <Route path="solicitacoes" element={<Solicitacoes {...props} />} />
    </Routes>
  );
}
