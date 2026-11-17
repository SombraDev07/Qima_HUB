import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, CalendarPlus, LogOut, XCircle, MessageSquare, Undo2 } from 'lucide-react';
import { Alert, Badge, Button, Card, Empty, Field, PageHeader, useConfirm } from '@hub';
import {
  AJUSTE, CidadeInput, HospedesPicker, Modal, PedidoBadge, SituacaoBadge, cidadeOficial, addDays, fmtDate, fmtDateTime,
  norm, todayISO, useAction, FiltroSelect, uniq,
} from './shared.jsx';

// =========================================================================== lista
function MeusPedidos({ module, api }) {
  const [pedidos, setPedidos] = useState(null);
  const [aba, setAba] = useState('pedidos');
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [erro, setErro] = useState('');
  const navigate = useNavigate();

  useEffect(() => { api.get('/meus').then(setPedidos).catch((e) => setErro(e.message)); }, []);

  const filtrados = (pedidos || []).filter((p) =>
    (!status || p.status === status) &&
    (!busca || norm(`${p.codigo} ${p.cidade} ${p.projeto} ${p.hospedes.map((h) => h.nome).join(' ')}`).includes(norm(busca))));

  const hospedes = useMemo(() => filtrados.filter((p) => p.status !== 'rascunho').flatMap((p) => p.hospedes.map((h) => {
    const q = p.quartos.find((x) => x.situacao !== 'finalizado' && x.ocupantes.some((o) => o.id === h.id))
      || [...p.quartos].reverse().find((x) => x.ocupantes.some((o) => o.id === h.id));
    return { ...h, pedido: p, quarto: q };
  })), [filtrados]);

  return (
    <>
      <PageHeader
        title={module.title}
        subtitle="Solicite, acompanhe e ajuste suas hospedagens"
        actions={<Button onClick={() => navigate('novo')}><Plus size={16} /> Nova solicitação</Button>}
      />
      <Alert>{erro}</Alert>
      <div className="tabs">
        <button className={aba === 'pedidos' ? 'active' : ''} onClick={() => setAba('pedidos')}>Pedidos</button>
        <button className={aba === 'hospedes' ? 'active' : ''} onClick={() => setAba('hospedes')}>Hóspedes e quartos</button>
      </div>
      <div className="hs-filtros">
        <label className="hs-filtro hs-filtro-grow"><span>Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, cidade, projeto ou hóspede" />
        </label>
        <FiltroSelect label="Status" value={status} onChange={setStatus}
          options={uniq((pedidos || []).map((p) => p.status)).map((s) => ({ value: s, label: { rascunho: 'Rascunho', pendente: 'Solicitado', ajustado: 'Ajustado', em_andamento: 'Em andamento', finalizado: 'Finalizado', cancelado: 'Cancelado' }[s] || s }))} />
      </div>

      {pedidos === null ? <Empty>Carregando…</Empty> : aba === 'pedidos' ? (
        !filtrados.length ? <Empty>Nenhum pedido. Clique em “Nova solicitação”.</Empty> : (
          <Card className="table-card">
            <table className="table hs-table">
              <thead><tr><th>Código</th><th>Cidade</th><th>Check-in</th><th>Check-out</th><th>Projeto</th><th>Hóspedes</th><th>Status</th><th /></tr></thead>
              <tbody>
                {filtrados.map((p) => {
                  const aj = p.solicitacoes.filter((s) => s.status === 'aberta').length;
                  return (
                    <tr key={p.id} className="hs-click" onClick={() => navigate(p.status === 'rascunho' ? `editar/${p.id}` : `pedido/${p.id}`)}>
                      <td className="cell-strong">{p.codigo}</td>
                      <td>{p.cidade} - {p.uf}</td>
                      <td>{fmtDate(p.data_inicio)}</td>
                      <td>{fmtDate(p.data_fim)}</td>
                      <td>{p.projeto || '—'}</td>
                      <td>{p.hospedes.filter((h) => h.status !== 'cancelado').length}</td>
                      <td><div className="tags"><PedidoBadge s={p.status} />{aj > 0 && <Badge tone="brand">{aj} ajuste(s) aguardando</Badge>}</div></td>
                      <td className="row-actions"><Button variant="outline" className="btn-sm">{p.status === 'rascunho' ? 'Continuar' : 'Abrir'}</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )
      ) : (
        !hospedes.length ? <Empty>Nenhum hóspede.</Empty> : (
          <Card className="table-card">
            <table className="table hs-table">
              <thead><tr><th>Hóspede</th><th>Pedido</th><th>Quarto</th><th>Hotel</th><th>Check-in</th><th>Check-out</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {hospedes.map((h) => (
                  <tr key={h.id}>
                    <td className="cell-strong">{h.nome}{h.status !== 'ativo' && <div className="muted small">{h.status === 'checkout' ? 'Fez check-out' : 'Cancelado'}</div>}</td>
                    <td>{h.pedido.codigo}<div className="muted small">{h.pedido.cidade} - {h.pedido.uf}</div></td>
                    <td>{h.quarto ? `${h.quarto.codigo} · ${h.quarto.tipo}` : <span className="muted">Aguardando central</span>}</td>
                    <td>{h.quarto?.enviado ? h.quarto.hotel_nome : '—'}</td>
                    <td>{fmtDate(h.quarto?.data_in || h.pedido.data_inicio)}</td>
                    <td>{fmtDate(h.quarto?.data_out || h.pedido.data_fim)}</td>
                    <td>{h.quarto?.enviado ? <SituacaoBadge s={h.quarto.situacao} /> : <PedidoBadge s={h.pedido.status} />}</td>
                    <td className="row-actions"><Link className="btn btn-outline btn-sm" to={`pedido/${h.pedido.id}`}>Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}
    </>
  );
}

// =========================================================================== formulário
function PedidoForm({ module, api }) {
  const base = `/m/${module.key}/solicitante`;
  const { id } = useParams();
  const navigate = useNavigate();
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const [opcoes, setOpcoes] = useState({ projetos: [] });
  const [erro, setErro] = useState('');
  const [form, setForm] = useState({
    cidade: '', uf: 'PR', data_inicio: todayISO(), data_fim: addDays(todayISO(), 5), projeto: '', garagem: 'sem', obs: '', hospedes: [],
  });
  const [orig, setOrig] = useState(null);

  useEffect(() => {
    api.get('/opcoes').then((o) => {
      setOpcoes(o);
      setForm((f) => ({ ...f, projeto: f.projeto || o.projetos[0] || '' }));
    });
    if (id) {
      api.get(`/pedidos/${id}`).then((p) => {
        setOrig(p);
        setForm({
          cidade: p.cidade, uf: p.uf, data_inicio: p.data_inicio, data_fim: p.data_fim, projeto: p.projeto || '', garagem: p.garagem || 'sem', obs: p.obs || '',
          hospedes: p.hospedes.filter((h) => h.status !== 'cancelado').map((h) => ({ pessoa_id: h.pessoa_id, nome: h.nome, email: h.email, tipo: h.tipo })),
        });
      }).catch((e) => setErro(e.message));
    }
  }, [id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const nd = Math.round((Date.parse(form.data_fim) - Date.parse(form.data_inicio)) / 86400000);

  const salvar = async (rascunho) => {
    setErro('');
    const cidade = cidadeOficial(form.cidade, form.uf);
    if (!cidade) return setErro(`Escolha uma cidade válida de ${form.uf} na lista.`);
    const body = { ...form, cidade, rascunho };
    const r = await run(
      () => (id ? api.put(`/meus/${id}`, body) : api.post('/meus', body)),
      (x) => (rascunho ? `Rascunho salvo · ${x.codigo}` : `Pedido enviado · ${x.codigo}`),
    );
    if (r) navigate(rascunho ? base : `${base}/pedido/${r.id}`);
  };

  const excluir = async () => {
    if (!await confirmar({ titulo: 'Excluir este rascunho?', mensagem: 'Os dados e os hóspedes anexados serão apagados.', confirmar: 'Excluir', perigo: true })) return;
    if (await run(() => api.del(`/meus/${id}`), 'Rascunho excluído')) navigate(base);
  };

  return (
    <div className="hs-form-page">
      <PageHeader
        title={id ? `${orig?.codigo || ''} · ${orig?.status === 'rascunho' ? 'rascunho' : 'editar pedido'}` : 'Nova solicitação'}
        subtitle={module.title}
        back={id && orig?.status !== 'rascunho' ? `${base}/pedido/${id}` : base}
      />
      <Alert>{erro}</Alert>
      <div className="hs-form-grid">
        <Card>
          <div className="form-grid">
            <h3>Onde e quando</h3>
            <Field label="Estado e cidade"><CidadeInput cidade={form.cidade} uf={form.uf} onChange={({ cidade, uf }) => setForm((f) => ({ ...f, cidade, uf }))} required /></Field>
            <div className="grid-2">
              <Field label="Check-in"><input type="date" value={form.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} /></Field>
              <Field label="Check-out" hint={nd > 0 ? `${nd} diária(s)` : 'Precisa ser depois do check-in'}>
                <input type="date" value={form.data_fim} min={addDays(form.data_inicio, 1)} onChange={(e) => set('data_fim', e.target.value)} />
              </Field>
            </div>
            <div className="grid-2">
              <Field label="Projeto">
                <select value={form.projeto} onChange={(e) => set('projeto', e.target.value)}>
                  {opcoes.projetos.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Garagem">
                <select value={form.garagem} onChange={(e) => set('garagem', e.target.value)}>
                  <option value="sem">Sem garagem</option>
                  <option value="free">Garagem free</option>
                  <option value="paga">Garagem paga</option>
                </select>
              </Field>
            </div>
            <Field label="Observação"><textarea rows={3} value={form.obs} onChange={(e) => set('obs', e.target.value)} /></Field>
          </div>
        </Card>

        <Card>
          <div className="form-grid">
            <h3>Hóspedes <span className="muted small">({form.hospedes.length})</span></h3>
            <p className="muted small hs-m0">Busque no banco de pessoas ou adicione vagas <b>Open</b> quando ainda não souber quem vai.</p>
            <HospedesPicker api={api} value={form.hospedes} onChange={(h) => set('hospedes', h)} />
          </div>
        </Card>
      </div>

      <div className="hs-form-actions">
        {id && orig?.status === 'rascunho' && <Button variant="danger" onClick={excluir} disabled={busy}><Trash2 size={15} /> Excluir rascunho</Button>}
        <span style={{ flex: 1 }} />
        {(!id || orig?.status === 'rascunho') && <Button variant="outline" onClick={() => salvar(true)} disabled={busy}>Salvar rascunho</Button>}
        <Button onClick={() => salvar(false)} disabled={busy}>{id && orig?.status !== 'rascunho' ? 'Salvar ajuste' : 'Enviar pedido'}</Button>
      </div>
    </div>
  );
}

// =========================================================================== detalhe + ajustes
function AjusteDialog({ pedido, hospede, tipo, api, onClose, onDone }) {
  const quarto = pedido.quartos.find((q) => q.id === hospede.quarto_id);
  const [data, setData] = useState(tipo === 'prorrogar' ? addDays(quarto?.data_out || pedido.data_fim, 1) : (quarto?.data_out || pedido.data_fim));
  const [obs, setObs] = useState('');
  const [run, busy] = useAction();

  const textos = {
    cancelar: `Cancelar a hospedagem de ${hospede.nome}? A central vai retirar a pessoa do quarto.`,
    prorrogar: `Até quando ${hospede.nome} precisa ficar?`,
    checkout: `Em que data ${hospede.nome} sai do hotel?`,
    editar: `O que precisa mudar para ${hospede.nome}? (nome, datas, quarto…)`,
  };
  const enviar = async () => {
    const r = await run(() => api.post(`/meus/${pedido.id}/solicitacoes`, { hospede_id: hospede.id, tipo, data, obs }),
      'Pedido de ajuste enviado à central. Nada muda até a central confirmar.');
    if (r) onDone();
  };

  return (
    <Modal title={`${AJUSTE[tipo]} · ${hospede.nome}`} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Voltar</Button><Button onClick={enviar} disabled={busy}>Enviar à central</Button></>}>
      <p className="hs-m0">{textos[tipo]}</p>
      {quarto && <p className="muted small hs-m0">Hoje: {quarto.codigo} · {quarto.hotel_nome || 'hotel a definir'} · {fmtDate(quarto.data_in)} → {fmtDate(quarto.data_out)}</p>}
      {(tipo === 'prorrogar' || tipo === 'checkout') && (
        <Field label={tipo === 'prorrogar' ? 'Novo check-out' : 'Data do check-out'}>
          <input type="date" value={data} min={quarto?.data_in} max={tipo === 'checkout' ? quarto?.data_out : undefined} onChange={(e) => setData(e.target.value)} />
        </Field>
      )}
      <Field label={tipo === 'editar' ? 'Descrição' : 'Observação (opcional)'}>
        <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} required={tipo === 'editar'} />
      </Field>
    </Modal>
  );
}

function PedidoSolicitante({ module, api }) {
  const base = `/m/${module.key}/solicitante`;
  const { id } = useParams();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [erro, setErro] = useState('');
  const [dlg, setDlg] = useState(null);
  const [run, busy] = useAction();
  const confirmar = useConfirm();

  const load = () => api.get(`/pedidos/${id}`).then(setP).catch((e) => setErro(e.message));
  useEffect(() => { load(); }, [id]);

  if (erro) return <><PageHeader title="Pedido" back={base} /><Alert>{erro}</Alert></>;
  if (!p) return <Empty>Carregando…</Empty>;

  const abertas = p.solicitacoes.filter((s) => s.status === 'aberta');
  const podeEditar = ['pendente', 'ajustado', 'rascunho'].includes(p.status) && !p.quartos.length;
  const ativo = !['finalizado', 'cancelado', 'rascunho'].includes(p.status);
  const pedidoCancel = abertas.some((s) => s.tipo === 'cancelar_pedido');
  const quartosVisiveis = p.quartos.filter((q) => q.enviado);

  const cancelarPedido = async () => {
    const semQuarto = !p.quartos.some((q) => q.enviado);
    if (!await confirmar(semQuarto
      ? { titulo: `Cancelar o pedido ${p.codigo}?`, mensagem: 'Nenhum quarto foi reservado ainda, então o cancelamento é imediato.', confirmar: 'Cancelar pedido', cancelar: 'Voltar', perigo: true }
      : { titulo: `Pedir o cancelamento de ${p.codigo}?`, mensagem: 'Já existem quartos reservados. A central vai analisar o pedido de cancelamento.', confirmar: 'Pedir cancelamento', cancelar: 'Voltar', perigo: true })) return;
    const r = await run(() => api.post(`/meus/${p.id}/cancelar`), (x) => (x.direto ? 'Pedido cancelado' : 'Pedido de cancelamento enviado à central'));
    if (r) load();
  };
  const retirar = async (s) => {
    if (await run(() => api.del(`/meus/solicitacoes/${s.id}`), 'Pedido de ajuste retirado')) load();
  };

  return (
    <>
      <PageHeader
        title={p.codigo}
        subtitle={`${p.cidade} - ${p.uf} · ${fmtDate(p.data_inicio)} → ${fmtDate(p.data_fim)} · ${p.projeto || ''}`}
        back={base}
        actions={<div className="tags">
          <PedidoBadge s={p.status} />
          {podeEditar && <Button variant="outline" onClick={() => navigate(`${base}/editar/${p.id}`)}><Pencil size={15} /> Editar</Button>}
          {ativo && !pedidoCancel && <Button variant="danger" onClick={cancelarPedido} disabled={busy}><XCircle size={15} /> Cancelar pedido</Button>}
        </div>}
      />

      {abertas.length > 0 && (
        <Card className="hs-aviso">
          <h3>Aguardando a central</h3>
          <ul className="hs-list">
            {abertas.map((s) => (
              <li key={s.id}>
                <b>{AJUSTE[s.tipo]}</b>{s.hospede_nome ? ` · ${s.hospede_nome}` : ''}{s.data ? ` · ${fmtDate(s.data)}` : ''}{s.obs ? ` · “${s.obs}”` : ''}
                <button className="hs-link" onClick={() => retirar(s)} disabled={busy}><Undo2 size={13} /> retirar</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <h3 className="hs-section">Hóspedes</h3>
      <Card className="table-card">
        <table className="table hs-table">
          <thead><tr><th>Hóspede</th><th>Quarto</th><th>Hotel</th><th>Check-in</th><th>Check-out</th><th>Situação</th><th>Ajustes</th></tr></thead>
          <tbody>
            {p.hospedes.map((h) => {
              const q = p.quartos.find((x) => x.id === h.quarto_id) || [...p.quartos].reverse().find((x) => x.ocupantes.some((o) => o.id === h.id));
              const visivel = q?.enviado;
              const temAjuste = abertas.some((s) => s.hospede_id === h.id);
              const pode = ativo && h.status === 'ativo';
              return (
                <tr key={h.id}>
                  <td className="cell-strong">{h.nome}{h.tipo === 'open' && <div className="muted small">vaga Open</div>}</td>
                  <td>{visivel ? `${q.codigo} · ${q.tipo}` : <span className="muted">Aguardando central</span>}</td>
                  <td>{visivel ? <>{q.hotel_nome}<div className="muted small">{q.hotel_endereco}</div></> : '—'}</td>
                  <td>{fmtDate(visivel ? q.data_in : p.data_inicio)}</td>
                  <td>{fmtDate(visivel ? q.data_out : p.data_fim)}</td>
                  <td>{h.status === 'cancelado' ? <Badge tone="muted">Cancelado</Badge> : h.status === 'checkout' ? <Badge tone="success">Check-out</Badge> : visivel ? <SituacaoBadge s={q.situacao} /> : <PedidoBadge s={p.status} />}</td>
                  <td>
                    {pode && !temAjuste ? (
                      <div className="hs-acts">
                        {h.quarto_id && <button className="hs-act" onClick={() => setDlg({ h, tipo: 'prorrogar' })}><CalendarPlus size={14} /> Prorrogar</button>}
                        {h.quarto_id && <button className="hs-act" onClick={() => setDlg({ h, tipo: 'checkout' })}><LogOut size={14} /> Check-out</button>}
                        <button className="hs-act" onClick={() => setDlg({ h, tipo: 'editar' })}><MessageSquare size={14} /> Editar</button>
                        <button className="hs-act hs-act-danger" onClick={() => setDlg({ h, tipo: 'cancelar' })}><XCircle size={14} /> Cancelar</button>
                      </div>
                    ) : temAjuste ? <Badge tone="brand">Ajuste enviado</Badge> : <span className="muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {quartosVisiveis.length > 0 && (
        <>
          <h3 className="hs-section">Reservas confirmadas</h3>
          <div className="hs-cards">
            {quartosVisiveis.map((q) => (
              <Card key={q.id}>
                <div className="hs-card-head"><b>{q.codigo} · {q.tipo}</b><SituacaoBadge s={q.situacao} /></div>
                <div className="small">{q.hotel_nome}</div>
                <div className="muted small">{q.hotel_endereco}{q.hotel_telefone ? ` · ${q.hotel_telefone}` : ''}</div>
                <div className="small hs-mt">{fmtDate(q.data_in)} → {fmtDate(q.data_out)} · {q.dias} diária(s)</div>
                <div className="small">{q.ocupantes.map((o) => o.nome).join(', ')}</div>
              </Card>
            ))}
          </div>
        </>
      )}

      {p.obs && <><h3 className="hs-section">Observação</h3><Card><p className="hs-m0">{p.obs}</p></Card></>}

      <Historico itens={p.historico} solicitacoes={p.solicitacoes} />

      {dlg && <AjusteDialog pedido={p} hospede={dlg.h} tipo={dlg.tipo} api={api} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load(); }} />}
    </>
  );
}

export function Historico({ itens, solicitacoes = [] }) {
  const [open, setOpen] = useState(false);
  const respondidas = solicitacoes.filter((s) => s.status === 'recusada' && s.resposta);
  return (
    <>
      <h3 className="hs-section"><button className="hs-link" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} Histórico ({itens.length})</button></h3>
      {open && (
        <Card>
          {respondidas.map((s) => (
            <div key={s.id} className="hs-hist hs-hist-warn">Ajuste “{AJUSTE[s.tipo]}”{s.hospede_nome ? ` de ${s.hospede_nome}` : ''} não aprovado: {s.resposta}</div>
          ))}
          {itens.map((h) => (
            <div key={h.id} className="hs-hist">
              <span className="muted small">{fmtDateTime(h.created_at)}</span> <b>{h.acao}</b>{h.detalhe ? ` · ${h.detalhe}` : ''} <span className="muted small">— {h.user_nome}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

export default function Solicitante(props) {
  return (
    <Routes>
      <Route index element={<MeusPedidos {...props} />} />
      <Route path="novo" element={<PedidoForm {...props} />} />
      <Route path="editar/:id" element={<PedidoForm {...props} />} />
      <Route path="pedido/:id" element={<PedidoSolicitante {...props} />} />
    </Routes>
  );
}
