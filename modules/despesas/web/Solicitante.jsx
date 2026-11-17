import { useEffect, useRef, useState } from 'react';
import { Route, Routes, useNavigate, useParams, Link } from 'react-router-dom';
import { Trash2, Sparkles, ChevronRight, Loader2, Info, Send, XCircle } from 'lucide-react';
import { Alert, Badge, Button, Card, Empty, Field, PageHeader, fmtDate, fmtDateTime, money, parseMoney, todayISO, useAction, useToast, useConfirm } from '@hub';
import { Alertas, BotoesFoto, Lightbox, Miniatura, NotaBadge, PedidoBadge, enviarArquivo } from './shared.jsx';

const diasAtras = (iso) => Math.round((Date.now() - Date.parse(iso + 'T12:00:00')) / 86400000);

// =========================================================================== edição de uma nota (rascunho)
export function NotaEditor({ module, api, cfg, nota, indice, onChange, onDelete, acao }) {
  const [f, setF] = useState(() => ({
    valor: nota.valor != null ? String(nota.valor).replace('.', ',') : '', data: nota.data || '', tipo: nota.tipo || '',
    centro_custo: nota.centro_custo || '', motivo: nota.motivo || '', emitente: nota.emitente || '', cnpj: nota.cnpj_fmt || '', numero_nf: nota.numero_nf || '',
  }));
  const [salvando, setSalvando] = useState(false);
  const [ver, setVer] = useState(false);
  const [nfAberto, setNfAberto] = useState(false);
  const timer = useRef();
  const toast = useToast();

  // aplica mudança externa de centro de custo ("vale para todas")
  useEffect(() => { if (nota.centro_custo && nota.centro_custo !== f.centro_custo) setF((x) => ({ ...x, centro_custo: nota.centro_custo })); }, [nota.centro_custo]);

  const set = (k, v) => {
    const novo = { ...f, [k]: v };
    if (k === 'tipo' && (!f.motivo || f.motivo.startsWith(`${f.tipo}`))) novo.motivo = `${v}${novo.emitente ? ` - ${novo.emitente}` : ''}`;
    setF(novo);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSalvando(true);
      try {
        onChange(await api.patch(`/notas/${nota.id}`, { ...novo, valor: novo.valor === '' ? null : parseMoney(novo.valor) }));
      } catch (e) { toast(e.message, 'erro'); } finally { setSalvando(false); }
    }, 500);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const ia = nota.ia_status === 'ok';
  const antiga = f.data && diasAtras(f.data) > cfg.dias_limite;
  const futura = f.data && f.data > todayISO();

  return (
    <Card className="dp-nota">
      <Miniatura module={module} nota={nota} onOpen={() => setVer(true)} />
      <div className="dp-nota-body">
        <div className="dp-nota-head">
          <div><b>Nota {indice}</b>{f.emitente && <span className="muted"> · {f.emitente}</span>} <span className="dp-id">{nota.codigo}</span></div>
          <div className="dp-nota-head-r">
            {salvando && <Loader2 size={14} className="dp-spin" />}
            {ia && <span className="dp-ia"><Sparkles size={13} /> Preenchido pela IA</span>}
            {onDelete && <button className="icon-btn danger" title="Remover nota" onClick={onDelete}><Trash2 size={16} /></button>}
          </div>
        </div>
        <div className="dp-grid4">
          <Field label="Valor (R$)" hint={ia && nota.ia_valor != null ? `Lido pela IA: ${money(nota.ia_valor)}` : null}>
            <input inputMode="decimal" value={f.valor} onChange={(e) => set('valor', e.target.value)} placeholder="0,00" />
          </Field>
          <Field label="Data da despesa" hint={ia && nota.ia_data ? `Lido pela IA: ${fmtDate(nota.ia_data)}` : null}>
            <input type="date" value={f.data} max={todayISO()} onChange={(e) => set('data', e.target.value)} />
            {antiga && <span className="dp-warn">Data antiga (há {diasAtras(f.data)} dias). A central vai validar.</span>}
            {futura && <span className="dp-err">A data não pode ser no futuro.</span>}
          </Field>
          <Field label="Tipo de despesa">
            <select value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>
              <option value="">Selecione…</option>
              {cfg.tipos.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Centro de custo">
            <select value={f.centro_custo} onChange={(e) => set('centro_custo', e.target.value)}>
              {cfg.centros.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Motivo"><input value={f.motivo} onChange={(e) => set('motivo', e.target.value)} placeholder="Ex.: Almoço da equipe em Cuiabá" /></Field>
        <Alertas itens={nota.alertas} ocultar={['data_antiga', 'data_futura', 'sem_data', 'sem_valor']} />
        <details className="dp-nf" open={nfAberto} onToggle={(e) => setNfAberto(e.target.open)}>
          <summary><ChevronRight size={14} /> Dados da nota fiscal{(f.cnpj || f.numero_nf) && <span className="muted"> · {f.cnpj && `CNPJ ${f.cnpj}`}{f.numero_nf && ` · NF ${f.numero_nf}`}</span>}</summary>
          <div className="dp-grid3">
            <Field label="Emitente"><input value={f.emitente} onChange={(e) => set('emitente', e.target.value)} /></Field>
            <Field label="CNPJ"><input value={f.cnpj} onChange={(e) => set('cnpj', e.target.value)} /></Field>
            <Field label="Número da NF"><input value={f.numero_nf} onChange={(e) => set('numero_nf', e.target.value)} /></Field>
          </div>
        </details>
        {acao}
      </div>
      {ver && <Lightbox module={module} nota={nota} onClose={() => setVer(false)} />}
    </Card>
  );
}

// =========================================================================== novo pedido
function NovoPedido({ module, user, api }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const [cfg, setCfg] = useState(null);
  const [notas, setNotas] = useState([]);
  const [enviando, setEnviando] = useState([]);
  const [reemb, setReemb] = useState({ centro_custo: '', pix_tipo: 'CPF', pix_chave: '', obs: '' });

  useEffect(() => {
    api.get('/config').then((c) => {
      setCfg(c);
      setReemb((r) => ({ ...r, centro_custo: c.perfil.centro_custo || c.centros[0], pix_tipo: c.perfil.pix_tipo || 'CPF', pix_chave: c.perfil.pix_chave || '' }));
    });
    api.get('/rascunhos').then(setNotas);
  }, []);

  const adicionar = async (files) => {
    for (const f of files) {
      const tmp = { tmp: Math.random(), nome: f.name };
      setEnviando((e) => [...e, tmp]);
      try {
        const n = await enviarArquivo(module.key, f);
        setNotas((ns) => [...ns, n]);
      } catch (e) {
        toast(e.message, 'erro');
      } finally {
        setEnviando((e) => e.filter((x) => x !== tmp));
      }
    }
  };
  const remover = async (n) => {
    if (!await confirmar({ titulo: `Remover ${n.codigo}?`, mensagem: 'A foto e os dados desta nota saem do pedido.', confirmar: 'Remover', perigo: true })) return;
    if (await run(() => api.del(`/notas/${n.id}`))) setNotas((ns) => ns.filter((x) => x.id !== n.id));
  };
  const atualizar = (n) => setNotas((ns) => ns.map((x) => (x.id === n.id ? n : x)));
  const centroTodas = async (c) => {
    setReemb((r) => ({ ...r, centro_custo: c }));
    const novas = await Promise.all(notas.map((n) => api.patch(`/notas/${n.id}`, { centro_custo: c })));
    setNotas(novas);
  };
  const enviar = async () => {
    const r = await run(() => api.post('/pedidos', { notas: notas.map((n) => n.id), ...reemb }), (x) => `Pedido ${x.codigo} enviado à central`);
    if (r) navigate(`/m/${module.key}/solicitante/pedido/${r.id}`);
  };

  if (!cfg) return <Empty>Carregando…</Empty>;
  const total = notas.reduce((s, n) => s + (n.valor || 0), 0);
  const comAlerta = notas.filter((n) => n.alertas.length).length;

  return (
    <div className="dp-novo">
      <div className="dp-novo-notas">
        <Card className="dp-captura">
          <BotoesFoto onFiles={adicionar} />
          <p className="muted small">Tire uma foto por nota ou escolha várias de uma vez. {cfg.ia.ativo
            ? 'Os campos são preenchidos automaticamente pela IA — confira antes de enviar.'
            : 'Preencha valor, data e tipo de cada nota.'}</p>
        </Card>

        {!cfg.ia.ativo && notas.length === 0 && (
          <div className="dp-info"><Info size={15} /> Leitura automática por IA ainda não está ligada neste ambiente — os campos são preenchidos manualmente.</div>
        )}

        {notas.map((n, i) => (
          <NotaEditor key={n.id} module={module} api={api} cfg={cfg} nota={n} indice={i + 1} onChange={atualizar} onDelete={() => remover(n)} />
        ))}
        {enviando.map((e) => (
          <Card key={e.tmp} className="dp-nota dp-nota-loading"><Loader2 size={20} className="dp-spin" /> Enviando {e.nome}{cfg.ia.ativo ? ' e lendo a nota com IA' : ''}…</Card>
        ))}
        {!notas.length && !enviando.length && <Empty>Nenhuma nota ainda. Tire uma foto ou escolha os arquivos acima.</Empty>}
      </div>

      <aside className="dp-novo-lado">
        <Card>
          <h3 className="dp-h3">Dados do reembolso</h3>
          <div className="form-grid">
            <Field label="Colaborador"><input value={cfg.colaborador} disabled /></Field>
            <Field label="Centro de custo (vale para todas as notas)">
              <select value={reemb.centro_custo} onChange={(e) => centroTodas(e.target.value)}>{cfg.centros.map((c) => <option key={c}>{c}</option>)}</select>
            </Field>
            <div className="dp-grid2">
              <Field label="PIX · tipo da chave">
                <select value={reemb.pix_tipo} onChange={(e) => setReemb({ ...reemb, pix_tipo: e.target.value })}>{cfg.pix_tipos.map((c) => <option key={c}>{c}</option>)}</select>
              </Field>
              <Field label="Chave PIX">
                <input value={reemb.pix_chave} onChange={(e) => setReemb({ ...reemb, pix_chave: e.target.value })}
                  placeholder={{ CPF: '000.000.000-00', CNPJ: '00.000.000/0000-00', 'E-mail': 'nome@exemplo.com', Telefone: '(00) 00000-0000' }[reemb.pix_tipo] || ''} />
              </Field>
            </div>
            <Field label="Observação para a central (opcional)"><textarea rows={2} value={reemb.obs} onChange={(e) => setReemb({ ...reemb, obs: e.target.value })} /></Field>
          </div>
        </Card>
        <Card className="dp-resumo">
          <div className="muted small">{notas.length} nota(s)</div>
          <b>{money(total)}</b>
          {comAlerta > 0 && <div className="dp-warn">{comAlerta} com alerta para a central</div>}
          <Button onClick={enviar} disabled={busy || enviando.length > 0 || !notas.length}><Send size={16} /> Enviar pedido</Button>
        </Card>
      </aside>
    </div>
  );
}

// =========================================================================== meus pedidos
function MeusPedidos({ module, api }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const navigate = useNavigate();
  useEffect(() => { api.get('/meus').then(setLista).catch((e) => setErro(e.message)); }, []);

  return (
    <>
      <PageHeader title="Meus pedidos" subtitle="Reembolsos que você enviou" back={null} />
      <Alert>{erro}</Alert>
      {lista === null ? <Empty>Carregando…</Empty> : !lista.length ? <Empty>Você ainda não enviou pedidos. Use “Novo pedido”.</Empty> : (
        <div className="dp-lista">
          {lista.map((p) => {
            const ativas = p.notas.filter((n) => ['aguardando', 'ok', 'recusada'].includes(n.status));
            const recusadas = ativas.filter((n) => n.status === 'recusada').length;
            return (
              <Card key={p.id} className="dp-pedido-card" >
                <button className="dp-pedido-btn" onClick={() => navigate(`/m/${module.key}/solicitante/pedido/${p.id}`)}>
                  <div className="dp-thumbs">
                    {ativas.slice(0, 3).map((n) => <Miniatura key={n.id} module={module} nota={n} size={44} onOpen={() => {}} />)}
                  </div>
                  <div className="dp-pc-main">
                    <div><b>{p.codigo}</b> <PedidoBadge s={p.status} /> {p.pago_em && <Badge tone="success">Pago em {fmtDate(p.pago_em)}</Badge>}</div>
                    <div className="muted small">Enviado em {fmtDateTime(p.created_at)} · {ativas.length} nota(s){recusadas ? ` · ${recusadas} recusada(s)` : ''}</div>
                    {p.obs_central && <div className="small dp-obs-mini">Central: {p.obs_central}</div>}
                  </div>
                  <div className="dp-pc-val">
                    <div className="muted small">Declarado</div><b>{money(p.total_declarado)}</b>
                  </div>
                  <div className="dp-pc-val">
                    <div className="muted small">Aprovado</div><b className="dp-verde">{p.status === 'aguardando' ? '—' : money(p.total_aprovado)}</b>
                  </div>
                  <ChevronRight size={18} className="muted" />
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

// =========================================================================== detalhe (solicitante)
function PedidoSolicitante({ module, api }) {
  const { id } = useParams();
  const toast = useToast();
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const [p, setP] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [erro, setErro] = useState('');
  const [ver, setVer] = useState(null);
  const [subindo, setSubindo] = useState(null);
  const base = `/m/${module.key}/solicitante`;

  const load = () => api.get(`/pedidos/${id}`).then(setP).catch((e) => setErro(e.message));
  useEffect(() => { load(); api.get('/config').then(setCfg); }, [id]);

  if (erro) return <><PageHeader title="Pedido" back={`${base}/pedidos`} /><Alert>{erro}</Alert></>;
  if (!p || !cfg) return <Empty>Carregando…</Empty>;

  const principais = p.notas.filter((n) => ['aguardando', 'ok', 'recusada'].includes(n.status));
  const substitutas = p.notas.filter((n) => n.status === 'rascunho' && n.substitui_id);
  const podeCancelar = p.status === 'aguardando' && principais.every((n) => n.status === 'aguardando');

  const novaFoto = async (nota, files) => {
    setSubindo(nota.id);
    try { await enviarArquivo(module.key, files[0], { substitui: nota.id }); await load(); toast('Foto nova recebida. Confira os dados e clique em Reenviar.'); }
    catch (e) { toast(e.message, 'erro'); } finally { setSubindo(null); }
  };
  const reenviar = async (n) => { if (await run(() => api.post(`/notas/${n.id}/reenviar`), `${n.codigo} reenviada para a central`)) load(); };
  const descartar = async (n) => { if (await run(() => api.del(`/notas/${n.id}`))) load(); };
  const cancelar = async () => {
    if (!await confirmar({ titulo: `Cancelar o pedido ${p.codigo}?`, mensagem: 'O pedido de reembolso deixa de ser analisado pela central.', confirmar: 'Cancelar pedido', cancelar: 'Voltar', perigo: true })) return;
    if (await run(() => api.post(`/pedidos/${p.id}/cancelar`), 'Pedido cancelado')) load();
  };

  return (
    <>
      <PageHeader title={p.codigo} back={`${base}/pedidos`}
        subtitle={`Enviado em ${fmtDateTime(p.created_at)} · PIX ${p.pix_tipo}: ${p.pix_chave}`}
        actions={<div className="tags"><PedidoBadge s={p.status} />{podeCancelar && <Button variant="danger" onClick={cancelar} disabled={busy}><XCircle size={15} /> Cancelar pedido</Button>}</div>} />

      <div className="dp-totais">
        <Card><div className="muted small">Total declarado</div><b>{money(p.total_declarado)}</b></Card>
        <Card><div className="muted small">Total aprovado</div><b className="dp-verde">{p.status === 'aguardando' && !principais.some((n) => n.status === 'ok') ? '—' : money(p.total_aprovado)}</b></Card>
        <Card><div className="muted small">Pagamento</div><b>{p.pago_em ? `Pago em ${fmtDate(p.pago_em)}` : ['aprovado', 'parcial'].includes(p.status) ? 'Aguardando pagamento' : '—'}</b></Card>
      </div>

      {p.obs_central && <div className="dp-obs-central"><b>Observação da central</b><p>{p.obs_central}</p></div>}

      <div className="dp-notas-sol">
        {principais.map((n) => {
          const sub = substitutas.find((s) => s.substitui_id === n.id);
          return (
            <div key={n.id}>
              <Card className={`dp-nota dp-nota-${n.status}`}>
                <Miniatura module={module} nota={n} onOpen={() => setVer(n)} />
                <div className="dp-nota-body">
                  <div className="dp-nota-head">
                    <div><b>{n.tipo}</b>{n.emitente && <span className="muted"> · {n.emitente}</span>} <span className="dp-id">{n.codigo}</span></div>
                    <NotaBadge s={n.status} />
                  </div>
                  <div className="small">{n.motivo}</div>
                  <div className="dp-linha-valores">
                    <span>Data: <b>{fmtDate(n.data)}</b></span>
                    <span>Valor: <b>{money(n.valor)}</b></span>
                    {n.status === 'ok' && <span>Aprovado: <b className="dp-verde">{money(n.valor_aprovado)}</b></span>}
                  </div>
                  {n.editado_central && <div className="muted small">Dados ajustados pela central.</div>}
                  {n.status === 'recusada' && (
                    <div className="dp-recusa">
                      <b>Recusada:</b> {n.motivo_recusa}
                      {!sub && (subindo === n.id
                        ? <div className="muted small"><Loader2 size={14} className="dp-spin" /> Enviando…</div>
                        : <div className="dp-recusa-acoes"><span className="small">Envie outra foto desta despesa:</span><BotoesFoto compact multiple={false} onFiles={(f) => novaFoto(n, f)} /></div>)}
                    </div>
                  )}
                </div>
              </Card>
              {sub && (
                <div className="dp-substituta">
                  <div className="dp-sub-label">Nova foto para {n.codigo}</div>
                  <NotaEditor module={module} api={api} cfg={cfg} nota={sub} indice="nova" onChange={(x) => setP({ ...p, notas: p.notas.map((y) => (y.id === x.id ? x : y)) })}
                    onDelete={() => descartar(sub)}
                    acao={<div className="dp-sub-acoes"><Button onClick={() => reenviar(sub)} disabled={busy}><Send size={15} /> Reenviar nota</Button></div>} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {p.notas.some((n) => n.status === 'substituida') && (
        <p className="muted small">Fotos substituídas: {p.notas.filter((n) => n.status === 'substituida').map((n) => n.codigo).join(', ')}</p>
      )}
      <details className="dp-hist">
        <summary>Histórico ({p.historico.length})</summary>
        {p.historico.map((h) => <div key={h.id} className="small"><span className="muted">{fmtDateTime(h.created_at)}</span> <b>{h.acao}</b>{h.detalhe ? ` · ${h.detalhe}` : ''}</div>)}
      </details>
      {ver && <Lightbox module={module} nota={ver} onClose={() => setVer(null)} />}
    </>
  );
}

export default function Solicitante(props) {
  return (
    <Routes>
      <Route index element={<NovoPedido {...props} />} />
      <Route path="pedidos" element={<MeusPedidos {...props} />} />
      <Route path="pedido/:id" element={<PedidoSolicitante {...props} />} />
    </Routes>
  );
}
