import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, CalendarPlus, LogOut, XCircle, MessageSquare, Undo2 } from 'lucide-react';
import { Alert, Badge, Button, Card, Empty, Field, PageHeader, useConfirm } from '@hub';
import {
  AJUSTE, CidadeInput, HospedesPicker, Modal, StatusBadge, StatusPedidoBadge, cidadeOficial, addDays, fmtDateTime, fmtDate,
  norm, todayISO, useAction, FiltroSelect, uniq, statusPedido, statusQuarto, statusHospede,
} from './shared.jsx';

// =========================================================================== linhas e ações (usadas na lista e no detalhe)
/** Hóspedes do pedido, cada um com o quarto (vivo ou o último em que esteve) e o status exibido. */
function linhasHospedes(p) {
  return p.hospedes.map((h) => {
    const q = p.quartos.find((x) => x.id === h.quarto_id) || [...p.quartos].reverse().find((x) => x.ocupantes.some((o) => o.id === h.id));
    return { ...h, pedido: p, quarto: q, st: statusHospede(h, q, p) };
  });
}
const pedidoAtivo = (p) => !['finalizado', 'cancelado', 'rascunho'].includes(p.status);
const abertasDe = (p) => p.solicitacoes.filter((s) => s.status === 'aberta');
/** Ajuste aberto que já cobre este hóspede (pedido só dele ou do quarto inteiro dele). */
const ajusteDoHospede = (p, h, q) => abertasDe(p).find((s) => s.hospede_id === h.id || (!s.hospede_id && s.quarto_id && q && s.quarto_codigo === q.codigo));
const ajusteDoQuarto = (p, q) => abertasDe(p).find((s) => !s.hospede_id && s.quarto_id && s.quarto_codigo === q.codigo);

function Acoes({ pode, ajuste, temQuarto, onAjuste, onRetirar, busy }) {
  if (ajuste) {
    return (
      <div className="hs-acts">
        <Badge tone="brand">{AJUSTE[ajuste.tipo]} enviado</Badge>
        {onRetirar && <button className="hs-link" onClick={() => onRetirar(ajuste)} disabled={busy}><Undo2 size={13} /> retirar</button>}
      </div>
    );
  }
  if (!pode) return <span className="muted">—</span>;
  return (
    <div className="hs-acts">
      {temQuarto && <button className="hs-act" onClick={() => onAjuste('prorrogar')}><CalendarPlus size={14} /> Prorrogar</button>}
      {temQuarto && <button className="hs-act" onClick={() => onAjuste('checkout')}><LogOut size={14} /> Check-out</button>}
      <button className="hs-act" onClick={() => onAjuste('editar')}><MessageSquare size={14} /> Editar</button>
      <button className="hs-act hs-act-danger" onClick={() => onAjuste('cancelar')}><XCircle size={14} /> Cancelar</button>
    </div>
  );
}

/** Tabela de hóspedes com os ajustes na própria linha. comPedido = mostra a coluna do pedido (lista geral). */
function TabelaHospedes({ linhas, comPedido, onAjuste, onRetirar, busy }) {
  return (
    <Card className="table-card">
      <table className="table hs-table">
        <thead><tr><th>Hóspede</th>{comPedido && <th>Pedido</th>}<th>Quarto</th><th>Hotel</th><th>Check-in</th><th>Check-out</th><th>Situação</th><th>Ajustes</th></tr></thead>
        <tbody>
          {linhas.map((h) => {
            const p = h.pedido;
            const q = h.quarto;
            const visivel = q?.enviado;
            return (
              <tr key={h.id}>
                <td className="cell-strong">{h.nome}{h.tipo === 'open' && <div className="muted small">vaga Open</div>}</td>
                {comPedido && <td>{p.codigo}<div className="muted small">{p.cidade} - {p.uf}</div></td>}
                <td>{visivel ? `${q.codigo} · ${q.tipo}` : <span className="muted">Aguardando central</span>}</td>
                <td>{visivel ? <>{q.hotel_nome}<div className="muted small">{q.hotel_endereco}</div></> : '—'}</td>
                <td>{fmtDate(visivel ? q.data_in : p.data_inicio)}</td>
                <td>{fmtDate(visivel ? q.data_out : p.data_fim)}</td>
                <td><StatusBadge st={h.st} /></td>
                <td>
                  <Acoes pode={pedidoAtivo(p) && h.status === 'ativo'} ajuste={ajusteDoHospede(p, h, q)} temQuarto={!!h.quarto_id}
                    onAjuste={(tipo) => onAjuste({ pedido: p, hospede: h, tipo })} onRetirar={onRetirar} busy={busy} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

/** Tabela de quartos: o ajuste vale para todos os hóspedes do quarto. */
function TabelaQuartos({ linhas, onAjuste, onRetirar, busy }) {
  return (
    <Card className="table-card">
      <table className="table hs-table">
        <thead><tr><th>Quarto</th><th>Pedido</th><th>Hóspedes</th><th>Hotel</th><th>Check-in</th><th>Check-out</th><th>Situação</th><th>Ajustes</th></tr></thead>
        <tbody>
          {linhas.map(({ q, p, st }) => (
            <tr key={q.id}>
              <td className="cell-strong">{q.codigo}<div className="muted small">{q.tipo}</div></td>
              <td>{p.codigo}<div className="muted small">{p.cidade} - {p.uf}</div></td>
              <td>{q.ocupantes.map((o) => o.nome).join(', ') || '—'}</td>
              <td>{q.hotel_nome}<div className="muted small">{q.hotel_endereco}</div></td>
              <td>{fmtDate(q.data_in)}</td>
              <td>{fmtDate(q.data_out)}<div className="muted small">{q.dias} diária(s)</div></td>
              <td><StatusBadge st={st} /></td>
              <td>
                <Acoes pode={pedidoAtivo(p) && q.situacao !== 'finalizado' && q.ocupantes.length > 0}
                  ajuste={q.situacao !== 'finalizado' ? ajusteDoQuarto(p, q) : null} temQuarto
                  onAjuste={(tipo) => onAjuste({ pedido: p, quarto: q, tipo })} onRetirar={onRetirar} busy={busy} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// =========================================================================== lista
const ABAS = [
  { key: 'pedidos', label: 'Pedidos' },
  { key: 'hospedes', label: 'Hóspedes' },
  { key: 'quartos', label: 'Quartos' },
];

function MeusPedidos({ module, api }) {
  const [pedidos, setPedidos] = useState(null);
  const [aba, setAba] = useState(() => { try { return sessionStorage.getItem('hs-sol-aba') || 'pedidos'; } catch { return 'pedidos'; } });
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [erro, setErro] = useState('');
  const [dlg, setDlg] = useState(null);
  const [run, busy] = useAction();
  const navigate = useNavigate();

  const load = () => api.get('/meus').then(setPedidos).catch((e) => setErro(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => { try { sessionStorage.setItem('hs-sol-aba', aba); } catch {} setStatus(''); }, [aba]);

  // linhas de cada aba, já com o status exibido (st) — o filtro de status usa o mesmo status da tela
  const linhas = useMemo(() => {
    const comBusca = (pedidos || []).filter((p) => !busca || norm(`${p.codigo} ${p.cidade} ${p.projeto} ${p.hospedes.map((h) => h.nome).join(' ')}`).includes(norm(busca)));
    const enviados = comBusca.filter((p) => p.status !== 'rascunho');
    return {
      pedidos: comBusca.map((p) => ({ p, st: statusPedido(p) })),
      hospedes: enviados.flatMap(linhasHospedes),
      quartos: enviados.flatMap((p) => p.quartos.filter((q) => q.enviado).map((q) => ({ q, p, st: statusQuarto(q) }))),
    };
  }, [pedidos, busca]);
  const daAba = linhas[aba] || linhas.pedidos;
  const opcoesStatus = uniq(daAba.map((x) => x.st.label));
  const visiveis = daAba.filter((x) => !status || x.st.label === status);

  const retirar = async (s) => { if (await run(() => api.del(`/meus/solicitacoes/${s.id}`), 'Pedido de ajuste retirado')) load(); };

  return (
    <>
      <PageHeader
        title={module.title}
        subtitle="Solicite, acompanhe e ajuste suas hospedagens"
        actions={<Button onClick={() => navigate('novo')}><Plus size={16} /> Nova solicitação</Button>}
      />
      <Alert>{erro}</Alert>
      <div className="tabs">
        {ABAS.map((a) => <button key={a.key} className={aba === a.key ? 'active' : ''} onClick={() => setAba(a.key)}>{a.label}</button>)}
      </div>
      <div className="hs-filtros">
        <label className="hs-filtro hs-filtro-grow"><span>Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, cidade, projeto ou hóspede" />
        </label>
        <FiltroSelect label="Status" value={status} onChange={setStatus} options={opcoesStatus} />
      </div>

      {pedidos === null ? <Empty>Carregando…</Empty> : aba === 'hospedes' ? (
        !visiveis.length ? <Empty>Nenhum hóspede.</Empty>
          : <TabelaHospedes linhas={visiveis} comPedido onAjuste={setDlg} onRetirar={retirar} busy={busy} />
      ) : aba === 'quartos' ? (
        !visiveis.length ? <Empty>Nenhum quarto reservado ainda.</Empty>
          : <TabelaQuartos linhas={visiveis} onAjuste={setDlg} onRetirar={retirar} busy={busy} />
      ) : (
        !visiveis.length ? <Empty>Nenhum pedido. Clique em “Nova solicitação”.</Empty> : (
          <Card className="table-card">
            <table className="table hs-table">
              <thead><tr><th>Código</th><th>Cidade</th><th>Check-in</th><th>Check-out</th><th>Projeto</th><th>Hóspedes</th><th>Status</th><th /></tr></thead>
              <tbody>
                {visiveis.map(({ p, st }) => {
                  const aj = abertasDe(p).length;
                  return (
                    <tr key={p.id} className="hs-click" onClick={() => navigate(p.status === 'rascunho' ? `editar/${p.id}` : `pedido/${p.id}`)}>
                      <td className="cell-strong">{p.codigo}</td>
                      <td>{p.cidade} - {p.uf}</td>
                      <td>{fmtDate(p.data_inicio)}</td>
                      <td>{fmtDate(p.data_fim)}</td>
                      <td>{p.projeto || '—'}</td>
                      <td>{p.hospedes.filter((h) => h.status !== 'cancelado').length}</td>
                      <td><div className="tags"><StatusBadge st={st} />{aj > 0 && <Badge tone="brand">{aj} ajuste(s) aguardando</Badge>}</div></td>
                      <td className="row-actions"><Button variant="outline" className="btn-sm">{p.status === 'rascunho' ? 'Continuar' : 'Abrir'}</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )
      )}

      {dlg && <AjusteDialog {...dlg} api={api} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load(); }} />}
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
/** Pedido de ajuste de um hóspede ou do quarto inteiro (quarto = vale para todos os hóspedes dele). */
function AjusteDialog({ pedido, hospede, quarto: quartoAlvo, tipo, api, onClose, onDone }) {
  const quarto = quartoAlvo || pedido.quartos.find((q) => q.id === hospede?.quarto_id);
  const [data, setData] = useState(tipo === 'prorrogar' ? addDays(quarto?.data_out || pedido.data_fim, 1) : (quarto?.data_out || pedido.data_fim));
  const [obs, setObs] = useState('');
  const [run, busy] = useAction();

  const nomes = quartoAlvo ? quarto.ocupantes.map((o) => o.nome).join(', ') : '';
  const textos = quartoAlvo ? {
    cancelar: `Cancelar o quarto ${quarto.codigo}? A central vai cancelar a hospedagem de todos: ${nomes}.`,
    prorrogar: `Até quando o quarto ${quarto.codigo} (${nomes}) precisa ficar?`,
    checkout: `Em que data todos do quarto ${quarto.codigo} (${nomes}) saem do hotel?`,
    editar: `O que precisa mudar no quarto ${quarto.codigo}?`,
  } : {
    cancelar: `Cancelar a hospedagem de ${hospede.nome}? A central vai retirar a pessoa do quarto.`,
    prorrogar: `Até quando ${hospede.nome} precisa ficar?`,
    checkout: `Em que data ${hospede.nome} sai do hotel?`,
    editar: `O que precisa mudar para ${hospede.nome}? (nome, datas, quarto…)`,
  };
  const enviar = async () => {
    const alvo = quartoAlvo ? { quarto_id: quarto.id } : { hospede_id: hospede.id };
    const r = await run(() => api.post(`/meus/${pedido.id}/solicitacoes`, { ...alvo, tipo, data, obs }),
      'Pedido de ajuste enviado à central. Nada muda até a central confirmar.');
    if (r) onDone();
  };

  return (
    <Modal title={`${AJUSTE[tipo]} · ${quartoAlvo ? `quarto ${quarto.codigo}` : hospede.nome}`} onClose={onClose}
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

  const abertas = abertasDe(p);
  const podeEditar = ['pendente', 'ajustado', 'rascunho'].includes(p.status) && !p.quartos.length;
  const ativo = pedidoAtivo(p);
  const pedidoCancel = abertas.some((s) => s.tipo === 'cancelar_pedido');

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
          <StatusPedidoBadge p={p} />
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
                <b>{AJUSTE[s.tipo]}</b>{s.hospede_nome ? ` · ${s.hospede_nome}` : s.quarto_codigo ? ` · quarto ${s.quarto_codigo}` : ''}{s.data ? ` · ${fmtDate(s.data)}` : ''}{s.obs ? ` · “${s.obs}”` : ''}
                <button className="hs-link" onClick={() => retirar(s)} disabled={busy}><Undo2 size={13} /> retirar</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <h3 className="hs-section">Hóspedes</h3>
      <TabelaHospedes linhas={linhasHospedes(p)} onAjuste={setDlg} busy={busy} />

      {p.obs && <><h3 className="hs-section">Observação</h3><Card><p className="hs-m0">{p.obs}</p></Card></>}

      {dlg && <AjusteDialog {...dlg} api={api} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load(); }} />}
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
