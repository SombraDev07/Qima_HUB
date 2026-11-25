// Telas da Central: pedidos (aceitar, recusar, anexar passagens e concluir) e configurações (BUs).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Check, XCircle, Upload, CheckCircle2, RotateCcw, Save, Plus, Copy } from 'lucide-react';
import {
  Alert, Badge, Button, Card, Empty, Field, Modal, PageHeader, useAction, useConfirm, useToast, uploadArquivo,
  fmtDate, fmtDateTime, fmtCpf, norm, money, parseMoney,
} from '@hub';
import { STATUS, TRANSPORTE, StatusBadge, IconeTransporte, ResumoViagem, TabelaPassageiros, Passagens, Historico, trecho, fmtTel } from './shared.jsx';

const ABAS = [
  { key: 'pendente', label: 'Novos', filtro: (p) => p.status === 'pendente' },
  { key: 'agendando', label: 'Em agendamento', filtro: (p) => p.status === 'agendando' },
  { key: 'agendado', label: 'Agendados', filtro: (p) => p.status === 'agendado' },
  { key: 'encerrados', label: 'Recusados e cancelados', filtro: (p) => ['recusado', 'cancelado'].includes(p.status) },
];

// =========================================================================== lista
function Pedidos({ api }) {
  const [pedidos, setPedidos] = useState(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState(() => { try { return sessionStorage.getItem('vg-cen-aba') || 'pendente'; } catch { return 'pendente'; } });
  const [busca, setBusca] = useState('');
  const navigate = useNavigate();
  useEffect(() => { api.get('/central/pedidos').then(setPedidos).catch((e) => setErro(e.message)); }, []);
  useEffect(() => { try { sessionStorage.setItem('vg-cen-aba', aba); } catch { /* sem armazenamento */ } }, [aba]);

  const filtro = ABAS.find((a) => a.key === aba) || ABAS[0];
  const comBusca = (pedidos || []).filter((p) => !busca
    || norm(`${p.codigo} ${trecho(p)} ${p.solicitante_nome} ${p.passageiros.map((x) => `${x.nome} ${x.cpf}`).join(' ')}`).includes(norm(busca)));
  const visiveis = comBusca.filter(filtro.filtro);

  return (
    <>
      <PageHeader title="Pedidos de viagem" subtitle="Aceite, anexe as passagens e conclua o agendamento" />
      <Alert>{erro}</Alert>
      <div className="tabs">
        {ABAS.map((a) => {
          const n = comBusca.filter(a.filtro).length;
          return <button key={a.key} className={aba === a.key ? 'active' : ''} onClick={() => setAba(a.key)}>{a.label}{n > 0 && <span className="vg-count">{n}</span>}</button>;
        })}
      </div>
      <div className="vg-filtros">
        <label className="vg-filtro vg-filtro-grow"><span>Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, cidade, solicitante, passageiro ou CPF" />
        </label>
      </div>
      {pedidos === null ? <Empty>Carregando…</Empty> : !visiveis.length ? <Empty>Nenhum pedido aqui.</Empty> : (
        <Card className="table-card">
          <table className="table vg-table">
            <thead><tr><th>Código</th><th>Solicitante</th><th>Trecho</th><th>Transporte</th><th>Saída</th><th>Volta</th><th>Passageiros</th><th>Status</th><th /></tr></thead>
            <tbody>
              {visiveis.map((p) => (
                <tr key={p.id} className="vg-click" onClick={() => navigate(`pedido/${p.id}`)}>
                  <td className="cell-strong">{p.codigo}<div className="muted small">{fmtDateTime(p.created_at).slice(0, 10)}</div></td>
                  <td>{p.solicitante_nome}</td>
                  <td>{trecho(p)}</td>
                  <td className="vg-ico"><IconeTransporte t={p.transporte} /> {TRANSPORTE[p.transporte]}</td>
                  <td>{fmtDate(p.data_ida)} <span className="muted small">{p.horario}</span></td>
                  <td>{p.data_volta ? fmtDate(p.data_volta) : <span className="muted">Só ida</span>}</td>
                  <td>{p.passageiros.length}</td>
                  <td><StatusBadge s={p.status} /></td>
                  <td className="row-actions"><Button variant="outline" className="btn-sm">Abrir</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

// =========================================================================== detalhe
function Detalhe({ module, api }) {
  const base = `/m/${module.key}/central`;
  const { id } = useParams();
  const toast = useToast();
  const confirmar = useConfirm();
  const [run, busy] = useAction();
  const [p, setP] = useState(null);
  const [erro, setErro] = useState('');
  const [edits, setEdits] = useState({});
  const [obsCentral, setObsCentral] = useState('');
  const [recusa, setRecusa] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const arquivo = useRef();

  const aplicar = (x) => {
    setP(x);
    setEdits(Object.fromEntries(x.passageiros.map((y) => [y.id, { localizador: y.localizador || '', valor: y.valor != null ? String(y.valor).replace('.', ',') : '' }])));
    setObsCentral(x.obs_central || '');
  };
  const load = () => api.get(`/pedidos/${id}`).then(aplicar).catch((e) => setErro(e.message));
  useEffect(() => { load(); }, [id]);

  const sujo = useMemo(() => !!p && (p.passageiros.some((y) => {
    const e = edits[y.id] || {};
    return (e.localizador || '') !== (y.localizador || '') || (e.valor === '' ? null : parseMoney(e.valor)) !== y.valor;
  }) || obsCentral !== (p.obs_central || '')), [p, edits, obsCentral]);

  if (erro) return <><PageHeader title="Pedido" back={base} /><Alert>{erro}</Alert></>;
  if (!p) return <Empty>Carregando…</Empty>;
  const emAgendamento = p.status === 'agendando';

  const salvarPassagens = (msg = 'Passagens salvas') => run(async () => {
    const x = await api.put(`/central/pedidos/${p.id}/passagens`, {
      passageiros: p.passageiros.map((y) => ({ id: y.id, localizador: edits[y.id]?.localizador, valor: edits[y.id]?.valor === '' ? null : parseMoney(edits[y.id]?.valor) })),
      obs_central: obsCentral,
    });
    aplicar(x);
    return x;
  }, msg);

  const aceitar = async () => { const x = await run(() => api.post(`/central/pedidos/${p.id}/aceitar`), 'Pedido aceito: em agendamento'); if (x) aplicar(x); };
  const recusar = async () => {
    const x = await run(() => api.post(`/central/pedidos/${p.id}/recusar`, { motivo: recusa }), 'Pedido recusado; o solicitante foi avisado');
    if (x) { aplicar(x); setRecusa(null); }
  };
  const concluir = async () => {
    if (!p.anexos.length) return toast('Anexe a passagem antes de concluir.', 'erro');
    if (!await confirmar({ titulo: `Concluir ${p.codigo}?`, mensagem: 'O pedido fica como Agendado e o solicitante recebe um e-mail para ver as passagens.', confirmar: 'Concluir' })) return;
    if (sujo && !await salvarPassagens(null)) return;
    const x = await run(() => api.post(`/central/pedidos/${p.id}/concluir`), 'Viagem agendada; o solicitante foi avisado');
    if (x) aplicar(x);
  };
  const reabrir = async () => {
    if (!await confirmar({ titulo: `Reabrir ${p.codigo}?`, mensagem: 'Volta para "Em agendamento" para trocar passagens. O solicitante não é avisado.', confirmar: 'Reabrir' })) return;
    const x = await run(() => api.post(`/central/pedidos/${p.id}/reabrir`), 'Agendamento reaberto');
    if (x) aplicar(x);
  };
  const enviarArquivos = async (files) => {
    setEnviando(true);
    try {
      for (const f of files) await uploadArquivo(`/api/m/${module.key}/central/pedidos/${p.id}/anexos`, f);
      toast(files.length > 1 ? `${files.length} passagens anexadas` : 'Passagem anexada');
    } catch (e) { toast(e.message, 'erro'); }
    setEnviando(false);
    load();
  };
  const remover = async (a) => {
    if (!await confirmar({ titulo: 'Remover esta passagem?', mensagem: a.nome, confirmar: 'Remover', perigo: true })) return;
    if (await run(() => api.del(`/central/anexos/${a.id}`), 'Passagem removida')) load();
  };
  const copiar = () => {
    const linhas = p.passageiros.map((x) => [x.nome, fmtCpf(x.cpf), x.rg, fmtDate(x.nascimento), x.email, fmtTel(x.telefone), x.bu, x.poltrona || ''].join('\t'));
    navigator.clipboard?.writeText(['Nome\tCPF\tRG\tNascimento\tE-mail\tTelefone\tBU\tPoltrona', ...linhas].join('\n'))
      .then(() => toast('Dados dos passageiros copiados (cole no Excel ou no site da companhia)'), () => toast('Não foi possível copiar', 'erro'));
  };

  return (
    <>
      <PageHeader title={p.codigo} subtitle={`${p.solicitante_nome} · ${trecho(p)}`} back={base}
        actions={<div className="tags">
          <StatusBadge s={p.status} />
          {p.status === 'pendente' && <Button onClick={aceitar} disabled={busy}><Check size={15} /> Aceitar</Button>}
          {['pendente', 'agendando'].includes(p.status) && <Button variant="danger" onClick={() => setRecusa('')} disabled={busy}><XCircle size={15} /> Recusar</Button>}
          {p.status === 'agendado' && <Button variant="outline" onClick={reabrir} disabled={busy}><RotateCcw size={15} /> Reabrir</Button>}
        </div>} />
      {p.status === 'recusado' && <Alert kind="warning">Recusado: {p.motivo_recusa}</Alert>}
      {p.status === 'cancelado' && <Alert kind="warning">Cancelado pelo solicitante.</Alert>}
      {p.status === 'agendado' && <Alert kind="success">Agendado por {p.agendado_por}{p.valor_total != null ? ` · total ${money(p.valor_total)}` : ''}.</Alert>}

      <ResumoViagem p={p} />

      <div className="vg-section vg-section-row">
        <h3>Passageiros ({p.passageiros.length})</h3>
        <Button variant="outline" className="btn-sm" onClick={copiar}><Copy size={14} /> Copiar dados</Button>
      </div>
      <TabelaPassageiros passageiros={p.passageiros} editavel={emAgendamento} mostrarPassagem={['agendado'].includes(p.status)}
        edits={edits} onEdit={(pid, v) => setEdits((e) => ({ ...e, [pid]: { ...e[pid], ...v } }))} />
      {emAgendamento && p.passageiros.length > 1 && (
        <p className="muted small vg-m0">Total: {money(p.passageiros.reduce((s, y) => s + (edits[y.id]?.valor ? parseMoney(edits[y.id].valor) : 0), 0))}</p>
      )}

      {['agendando', 'agendado'].includes(p.status) && (
        <>
          <h3 className="vg-section">Passagens</h3>
          <Card>
            <div className="form-grid">
              <Passagens module={module} anexos={p.anexos} onRemover={emAgendamento ? remover : null} busy={busy} />
              {emAgendamento && (
                <>
                  <div>
                    <input ref={arquivo} type="file" accept="application/pdf,image/*" multiple hidden
                      onChange={(e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) enviarArquivos(fs); }} />
                    <Button variant="outline" onClick={() => arquivo.current.click()} disabled={enviando}><Upload size={15} /> {enviando ? 'Enviando…' : 'Anexar passagem (PDF ou foto)'}</Button>
                  </div>
                  <Field label="Observação para o solicitante"><textarea rows={2} value={obsCentral} onChange={(e) => setObsCentral(e.target.value)} placeholder="Opcional (ex.: embarque no portão 3)" /></Field>
                </>
              )}
              {!emAgendamento && p.obs_central && <p className="vg-m0"><b>Observação:</b> {p.obs_central}</p>}
            </div>
          </Card>
          {emAgendamento && (
            <div className="vg-form-actions">
              <Button variant="outline" onClick={() => salvarPassagens()} disabled={busy || !sujo}><Save size={15} /> Salvar</Button>
              <Button onClick={concluir} disabled={busy || enviando}><CheckCircle2 size={15} /> Concluir agendamento</Button>
            </div>
          )}
        </>
      )}

      <Historico itens={p.historico} />

      {recusa !== null && (
        <Modal title={`Recusar ${p.codigo}`} onClose={() => setRecusa(null)}
          footer={<><Button variant="outline" onClick={() => setRecusa(null)}>Voltar</Button><Button variant="danger" onClick={recusar} disabled={busy || !recusa.trim()}>Recusar</Button></>}>
          <p className="vg-m0">O solicitante recebe o motivo por e-mail e pode corrigir e reenviar.</p>
          <Field label="Motivo *"><textarea rows={3} autoFocus value={recusa} onChange={(e) => setRecusa(e.target.value)} /></Field>
        </Modal>
      )}
    </>
  );
}

// =========================================================================== configurações
function Config({ api }) {
  const [bus, setBus] = useState(null);
  const [nova, setNova] = useState('');
  const [run, busy] = useAction();
  const load = () => api.get('/central/bus').then(setBus);
  useEffect(() => { load(); }, []);
  const adicionar = async () => { if (await run(() => api.post('/central/bus', { nome: nova }), 'BU adicionada')) { setNova(''); load(); } };
  const alternar = async (b) => { if (await run(() => api.put(`/central/bus/${b.id}`, { ativo: !b.ativo }))) load(); };
  return (
    <>
      <PageHeader title="Configurações" subtitle="BUs que aparecem no pedido de viagem" />
      <Card>
        <div className="form-grid">
          <div className="vg-busca-top">
            <input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Nome da BU, ex.: Consumer Products (CP)" onKeyDown={(e) => e.key === 'Enter' && nova.trim() && adicionar()} />
            <Button onClick={adicionar} disabled={busy || !nova.trim()}><Plus size={15} /> Adicionar</Button>
          </div>
          {bus === null ? <Empty>Carregando…</Empty> : (
            <ul className="vg-bus">
              {bus.map((b) => (
                <li key={b.id}>
                  <span className={b.ativo ? '' : 'muted'}>{b.nome}</span>
                  {!b.ativo && <Badge tone="muted">Inativa</Badge>}
                  <span style={{ flex: 1 }} />
                  <Button variant="outline" className="btn-sm" onClick={() => alternar(b)} disabled={busy}>{b.ativo ? 'Desativar' : 'Ativar'}</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </>
  );
}

export default function Central(props) {
  return (
    <Routes>
      <Route index element={<Pedidos {...props} />} />
      <Route path="pedido/:id" element={<Detalhe {...props} />} />
      <Route path="config" element={<Config {...props} />} />
    </Routes>
  );
}
