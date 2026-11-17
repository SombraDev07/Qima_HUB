import { useEffect, useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Plus, MessageSquare, Pencil, X, ArrowLeft } from 'lucide-react';
import { Button, Card, Empty, PageHeader, fmtDate, useAction, useConfirm } from '@hub';
import { Conversa, DadosPedido, FormPedido, Status } from './shared.jsx';

const ABAS = [
  { k: 'pendente', label: 'Pendente', f: (p) => p.status === 'pendente' },
  { k: 'correcao', label: 'Para corrigir', f: (p) => p.status === 'correcao' },
  { k: 'analise', label: 'Em análise', f: (p) => p.status === 'analise' },
  { k: 'final', label: 'Finalizado', f: (p) => ['feito', 'cancelado'].includes(p.status) },
];

function useCfg(api) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api.get('/config').then(setCfg); }, []);
  return cfg;
}

function Lista({ module, api }) {
  const base = `/m/${module.key}/solicitante`;
  const navigate = useNavigate();
  const [lista, setLista] = useState(null);
  const [aba, setAba] = useState(null);
  useEffect(() => { api.get('/meus').then((l) => { setLista(l); setAba((a) => a || (l.some((p) => p.status === 'correcao') ? 'correcao' : 'pendente')); }); }, []);
  const all = lista || [];
  const vis = all.filter(ABAS.find((a) => a.k === (aba || 'pendente')).f);
  return (
    <>
      <PageHeader title="Minhas solicitações" subtitle="Peça exclusão de carga, inserção de dados ou acumulado. Se a central encontrar erro, a solicitação volta para você corrigir." back="/"
        actions={<Button onClick={() => navigate(`${base}/nova`)}><Plus size={16} /> Nova solicitação</Button>} />
      <div className="sl-abas">
        {ABAS.map((a) => {
          const n = all.filter(a.f).length;
          return <button key={a.k} className={`${aba === a.k ? 'on' : ''} ${a.k === 'correcao' && n ? 'alerta' : ''}`} onClick={() => setAba(a.k)}>{a.label} ({n})</button>;
        })}
      </div>
      <Card className="sl-card-tabela">
        {lista === null ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>Nada aqui.</Empty> : (
          <table className="table sl-table-lista">
            <thead><tr><th>ID</th><th>Data</th><th>Tipo</th><th>Detalhe</th><th>Status</th><th>Observação da central</th><th /></tr></thead>
            <tbody>
              {vis.map((p) => (
                <tr key={p.id} className="sl-clicavel" onClick={() => navigate(`${base}/ver/${p.id}`)}>
                  <td className="cell-strong">{p.codigo}</td>
                  <td>{fmtDate(p.created_at)}</td>
                  <td>{p.tipo_label}</td>
                  <td className="small muted">{p.cod_visita || p.titulo || (p.linhas_qtd ? `${p.linhas_qtd} linha(s)` : '')}</td>
                  <td><Status p={p} /></td>
                  <td className="small sl-obs">{p.obs_central || ''}</td>
                  <td className="sl-acoes-lin">
                    {p.msgs_central > 0 && <span className="sl-nova-msg" title="Mensagem nova da central"><MessageSquare size={13} /> {p.msgs_central}</span>}
                    <Button className="btn-sm">Abrir</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function Nova({ module, api }) {
  const cfg = useCfg(api);
  const navigate = useNavigate();
  const base = `/m/${module.key}/solicitante`;
  if (!cfg) return <Empty>Carregando…</Empty>;
  return <FormPedido api={api} cfg={cfg} onSalvo={(r) => navigate(`${base}/ver/${r.id}`, { replace: true })} onCancelar={() => navigate(base)} />;
}

function Editar({ module, api }) {
  const { id } = useParams();
  const cfg = useCfg(api);
  const [p, setP] = useState(null);
  const navigate = useNavigate();
  const base = `/m/${module.key}/solicitante`;
  useEffect(() => { api.get(`/pedidos/${id}`).then(setP); }, [id]);
  if (!cfg || !p) return <Empty>Carregando…</Empty>;
  return <FormPedido api={api} cfg={cfg} pedido={p} onSalvo={() => navigate(`${base}/ver/${id}`, { replace: true })} onCancelar={() => navigate(`${base}/ver/${id}`)} />;
}

function Ver({ module, api }) {
  const { id } = useParams();
  const base = `/m/${module.key}/solicitante`;
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [erro, setErro] = useState('');
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const load = () => api.get(`/pedidos/${id}`).then((x) => { setP(x); window.dispatchEvent(new Event('qh:atualizar')); }).catch((e) => setErro(e.message));
  useEffect(() => { load(); }, [id]);
  if (erro) return <Empty>{erro}</Empty>;
  if (!p) return <Empty>Carregando…</Empty>;
  const editavel = ['pendente', 'correcao'].includes(p.status);
  const cancelar = async () => {
    if (await confirmar({ titulo: `Cancelar ${p.codigo}?`, mensagem: 'A central não vai mais atender esta solicitação.', confirmar: 'Cancelar solicitação', cancelar: 'Voltar', perigo: true })
      && await run(() => api.post(`/meus/${p.id}/cancelar`), 'Solicitação cancelada')) load();
  };
  return (
    <div className="sl-ver-wrap">
      <div className="panel sl-ver">
        <div className="sl-ver-head">
          <div><h2>{p.codigo} <Status p={p} /></h2><span className="muted">{p.tipo_label}</span></div>
        </div>
        {p.status === 'correcao' && (
          <div className="alert sl-alerta-correcao"><b>A central devolveu para correção.</b> Veja a mensagem abaixo, clique em <b>Corrigir</b>, ajuste e reenvie.</div>
        )}
        <DadosPedido p={p} />
        <Conversa api={api} pedido={p} lado="solicitante" />
        <div className="sl-ver-rodape">
          <Button variant="outline" onClick={() => navigate(base)}><ArrowLeft size={15} /> Voltar</Button>
          <Button variant={p.status === 'correcao' ? 'primary' : 'outline'} onClick={() => navigate(`${base}/editar/${p.id}`)} disabled={!editavel}><Pencil size={15} /> {p.status === 'correcao' ? 'Corrigir' : 'Editar pedido'}</Button>
          <Button variant="outline" onClick={cancelar} disabled={!editavel || busy}><X size={15} /> Cancelar pedido</Button>
          {!editavel && <span className="small muted">Edição e cancelamento só enquanto a solicitação está Pendente ou devolvida para correção.</span>}
        </div>
      </div>
    </div>
  );
}

export default function Solicitante(props) {
  return (
    <Routes>
      <Route index element={<Lista {...props} />} />
      <Route path="nova" element={<Nova {...props} />} />
      <Route path="ver/:id" element={<Ver {...props} />} />
      <Route path="editar/:id" element={<Editar {...props} />} />
    </Routes>
  );
}
