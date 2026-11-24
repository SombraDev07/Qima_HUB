import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Check, X, Download, AlertTriangle, CheckCircle2, RotateCcw, Pencil, CheckCheck, Copy, FileSpreadsheet, Undo2, FileText } from 'lucide-react';
import {
  Alert, Badge, Button, Card, Empty, Field, PageHeader, FiltroSelect, Modal,
  fmtDate, fmtDateTime, money, norm, parseMoney, todayISO, uniq, useAction, useToast, useConfirm, usePrompt,
} from '@hub';
import { Alertas, FotoLupa, Lightbox, NotaBadge, PedidoBadge } from './shared.jsx';

const ABAS = [
  { key: 'aguardando', label: 'Aguardando', match: (p) => p.status === 'aguardando' },
  { key: 'concluidos', label: 'Analisados', match: (p) => ['aprovado', 'parcial', 'reprovado'].includes(p.status) },
  { key: 'cancelados', label: 'Cancelados', match: (p) => p.status === 'cancelado' },
  { key: 'todos', label: 'Todos', match: () => true },
];
const MOTIVOS_RECUSA = ['Foto ilegível', 'Nota duplicada', 'Data fora do prazo', 'Despesa não reembolsável', 'Valor divergente da nota', 'Falta nota fiscal / comprovante válido'];

// =========================================================================== lista
function Lista({ module, api }) {
  const navigate = useNavigate();
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('aguardando');
  const [f, setF] = useState({ busca: '', colaborador: '', alerta: '' });
  useEffect(() => { api.get('/central/pedidos').then(setLista).catch((e) => setErro(e.message)); }, []);

  const all = lista || [];
  const filtro = (p) => (!f.colaborador || p.solicitante_nome === f.colaborador) && (!f.alerta || (f.alerta === 'com' ? p.n_alertas > 0 : !p.n_alertas))
    && (!f.busca || norm(`${p.codigo} ${p.solicitante_nome} ${p.tipos}`).includes(norm(f.busca)));
  const filtrados = all.filter(filtro);
  const vis = filtrados.filter(ABAS.find((a) => a.key === aba).match);
  const totalAg = all.filter((p) => p.status === 'aguardando').reduce((s, p) => s + p.total_declarado, 0);

  return (
    <>
      <PageHeader title="Central de despesas" subtitle={`${all.filter((p) => p.status === 'aguardando').length} pedido(s) aguardando · ${money(totalAg)}`} back={null} />
      <Alert>{erro}</Alert>
      <div className="tabs">
        {ABAS.map((a) => <button key={a.key} className={aba === a.key ? 'active' : ''} onClick={() => setAba(a.key)}>{a.label} ({filtrados.filter(a.match).length})</button>)}
      </div>
      <div className="dp-filtros">
        <label className="kit-filtro" style={{ flex: '2 1 240px' }}><span>Buscar</span><input value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} placeholder="Pedido, colaborador ou tipo" /></label>
        <FiltroSelect label="Colaborador" value={f.colaborador} onChange={(v) => setF({ ...f, colaborador: v })} options={uniq(all.map((p) => p.solicitante_nome))} />
        <FiltroSelect label="Alertas" value={f.alerta} onChange={(v) => setF({ ...f, alerta: v })} options={[{ value: 'com', label: 'Com alerta' }, { value: 'sem', label: 'Sem alerta' }]} />
      </div>
      {lista === null ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>Nenhum pedido aqui.</Empty> : (
        <Card className="table-card">
          <table className="table dp-table">
            <thead><tr><th>Pedido</th><th>Colaborador</th><th>Enviado em</th><th>Tipos</th><th>Notas</th><th>Alertas</th><th className="num">Declarado</th><th className="num">Aprovado</th><th>Status</th><th /></tr></thead>
            <tbody>
              {vis.map((p) => (
                <tr key={p.id} className="dp-click" onClick={() => navigate(`/m/${module.key}/central/pedido/${p.id}`)}>
                  <td className="cell-strong">{p.codigo}</td>
                  <td>{p.solicitante_nome}</td>
                  <td>{fmtDateTime(p.created_at)}</td>
                  <td className="small">{p.tipos || '—'}</td>
                  <td>{p.n_ok + p.n_recusadas}/{p.n_notas} <span className="muted small">analisadas</span></td>
                  <td>{p.n_alertas ? <span className="dp-alerta dp-alerta-amber"><AlertTriangle size={12} /> {p.n_alertas}</span> : <span className="muted">—</span>}</td>
                  <td className="num">{money(p.total_declarado)}</td>
                  <td className="num cell-strong">{p.status === 'aguardando' && !p.n_ok ? '—' : money(p.total_aprovado)}</td>
                  <td><div className="tags"><PedidoBadge s={p.status} />{p.pago_em && <Badge tone="success">Pago</Badge>}</div></td>
                  <td className="row-actions"><Button className="btn-sm">Abrir</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

// =========================================================================== análise de uma nota
function RecusarDialog({ nota, onClose, onConfirm, busy }) {
  const [motivo, setMotivo] = useState(nota.duplicados?.length ? 'Nota duplicada' : '');
  const [texto, setTexto] = useState('');
  return (
    <Modal title={`Recusar ${nota.codigo}`} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Voltar</Button><Button variant="danger" disabled={busy || !(motivo || texto.trim())} onClick={() => onConfirm([motivo, texto.trim()].filter(Boolean).join(' — '))}>Recusar nota</Button></>}>
      <p className="muted small dp-m0">O colaborador verá o motivo e poderá enviar outra foto.</p>
      <div className="dp-motivos">
        {MOTIVOS_RECUSA.map((m) => <button key={m} type="button" className={`dp-chip ${motivo === m ? 'on' : ''}`} onClick={() => setMotivo(motivo === m ? '' : m)}>{m}</button>)}
      </div>
      <Field label="Detalhe (opcional)"><textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} /></Field>
    </Modal>
  );
}

function EditarDados({ nota, cfg, onSave, onCancel, busy }) {
  const [f, setF] = useState({
    valor: String(nota.valor ?? '').replace('.', ','), data: nota.data || '', tipo: nota.tipo || '', centro_custo: nota.centro_custo || '', motivo: nota.motivo || '',
    emitente: nota.emitente || '', cnpj: nota.cnpj_fmt || '', numero_nf: nota.numero_nf || '', chave_acesso: nota.chave_acesso || '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="dp-editar">
      <div className="dp-grid2">
        <Field label="Valor (R$)"><input inputMode="decimal" value={f.valor} onChange={set('valor')} /></Field>
        <Field label="Data"><input type="date" value={f.data} onChange={set('data')} /></Field>
        <Field label="Tipo"><select value={f.tipo} onChange={set('tipo')}>{cfg.tipos.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Centro de custo"><select value={f.centro_custo} onChange={set('centro_custo')}>{cfg.centros.map((t) => <option key={t}>{t}</option>)}</select></Field>
      </div>
      <Field label="Motivo"><input value={f.motivo} onChange={set('motivo')} /></Field>
      <div className="dp-grid2">
        <Field label="Emitente"><input value={f.emitente} onChange={set('emitente')} /></Field>
        <Field label="CNPJ"><input value={f.cnpj} onChange={set('cnpj')} /></Field>
        <Field label="Número NF"><input value={f.numero_nf} onChange={set('numero_nf')} /></Field>
        <Field label="Chave de acesso"><input value={f.chave_acesso} onChange={set('chave_acesso')} /></Field>
      </div>
      <div className="dp-acoes">
        <Button onClick={() => onSave({ ...f, valor: parseMoney(f.valor) })} disabled={busy}><Check size={15} /> Salvar alterações</Button>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

function NotaAnalise({ module, api, cfg, nota, indice, aberto, onReload }) {
  const [run, busy] = useAction();
  const [full, setFull] = useState(false);
  const [editar, setEditar] = useState(false);
  const [recusar, setRecusar] = useState(false);
  const [n, setN] = useState(nota);
  useEffect(() => setN(nota), [nota]);
  const pode = aberto && ['aguardando', 'ok', 'recusada'].includes(n.status);
  const ia = n.ia_status === 'ok';

  const salvar = async (campos) => { const r = await run(() => api.patch(`/central/notas/${n.id}`, campos), `${n.codigo} atualizada`); if (r) { setEditar(false); onReload(); } };
  const ok = async () => { if (await run(() => api.post(`/central/notas/${n.id}/ok`), `${n.codigo} aprovada`)) onReload(); };
  const doRecusar = async (motivo) => { if (await run(() => api.post(`/central/notas/${n.id}/recusar`, { motivo }), `${n.codigo} recusada`)) { setRecusar(false); onReload(); } };
  const reabrir = async () => { if (await run(() => api.post(`/central/notas/${n.id}/reabrir`), `${n.codigo} voltou para análise`)) onReload(); };
  const conferir = async () => { const r = await run(() => api.get(`/pedidos/${n.pedido_id}`)); if (r) setN(r.notas.find((x) => x.id === n.id) || n); };

  return (
    <Card className={`dp-analise dp-analise-${n.status}`}>
      <FotoLupa module={module} nota={n} onFull={() => setFull(true)} />
      <div className="dp-analise-dados">
        <div className="dp-nota-head">
          <h3>Nota {indice} · {n.emitente || n.tipo || n.codigo}</h3>
          <NotaBadge s={n.status} />
        </div>
        <div className="muted small">{n.codigo} · {n.tipo || 'sem tipo'} · {n.centro_custo || 'sem centro'}{n.editado_central && ' · editada pela central'}</div>
        <div className="small">{n.motivo}</div>
        <Alertas itens={n.alertas} ocultar={['duplicada']} />
        {n.ia_obs && <div className="dp-info small">IA: {n.ia_obs}</div>}

        {editar ? <EditarDados nota={n} cfg={cfg} onSave={salvar} onCancel={() => setEditar(false)} busy={busy} /> : (
          <>
            <section className="dp-sec">
              <h4>Valor e data</h4>
              <div className="dp-vd">
                <div><div className="muted small">Valor</div><b className="dp-grande">{money(n.valor)}</b> <span className="muted small">{ia && Math.abs((n.ia_valor ?? -1) - n.valor) < 0.01 ? 'lido pela IA' : 'informado'}</span>
                  {n.status === 'ok' && n.valor_aprovado !== n.valor && <div className="dp-verde small">Aprovado: {money(n.valor_aprovado)}</div>}</div>
                <div><div className="muted small">Data</div><b className="dp-grande">{fmtDate(n.data)}</b> <span className="muted small">{ia && n.ia_data === n.data ? 'lida pela IA' : 'informada'}</span></div>
              </div>
            </section>

            <section className="dp-sec">
              <div className="dp-sec-head">
                <h4>Conferência no banco</h4>
                <button className="dp-link" onClick={conferir} disabled={busy}><RotateCcw size={13} /> Conferir de novo</button>
              </div>
              {n.duplicados?.length ? (
                <>
                  <div className="dp-dup-head">
                    <span className="dp-err"><AlertTriangle size={15} /> {n.duplicados.length} nota(s) parecida(s) no banco</span>
                    {pode && n.status !== 'recusada' && <Button variant="danger" className="btn-sm" onClick={() => doRecusar('Nota duplicada')} disabled={busy}>Recusar como duplicada</Button>}
                  </div>
                  {n.duplicados.map((d) => (
                    <div key={d.id} className="dp-dup">
                      <b>{d.motivos.join(' · ')}</b>
                      <span>{d.pedido_codigo || 'rascunho'} · {d.codigo} · {d.solicitante_nome || 'mesmo colaborador'} · {money(d.valor)} · {fmtDate(d.data)}</span>
                      <NotaBadge s={d.status} />
                    </div>
                  ))}
                </>
              ) : <div className="dp-ok"><CheckCircle2 size={15} /> Nenhuma nota parecida no banco</div>}
            </section>

            <section className="dp-sec">
              <h4>Nota fiscal</h4>
              <dl className="dp-dl">
                <dt>Emitente</dt><dd>{n.emitente || '—'}</dd>
                <dt>CNPJ</dt><dd>{n.cnpj_fmt || '—'}</dd>
                <dt>Número</dt><dd>{n.numero_nf || '—'}</dd>
                {n.chave_acesso && <><dt>Chave</dt><dd className="dp-mono">{n.chave_acesso}</dd></>}
              </dl>
            </section>

            {n.status === 'recusada' && <div className="dp-recusa"><b>Recusada:</b> {n.motivo_recusa}</div>}

            {pode && (
              <div className="dp-acoes">
                {n.status === 'aguardando' ? (
                  <>
                    <Button onClick={ok} disabled={busy}><Check size={16} /> OK</Button>
                    <Button variant="outline" onClick={() => setRecusar(true)} disabled={busy}><X size={16} /> Recusar</Button>
                  </>
                ) : <Button variant="outline" onClick={reabrir} disabled={busy}><Undo2 size={15} /> Desfazer análise</Button>}
                <Button variant="outline" onClick={() => setEditar(true)} disabled={busy}><Pencil size={15} /> Editar dados</Button>
              </div>
            )}
          </>
        )}
      </div>
      {full && <Lightbox module={module} nota={n} onClose={() => setFull(false)} />}
      {recusar && <RecusarDialog nota={n} onClose={() => setRecusar(false)} onConfirm={doRecusar} busy={busy} />}
    </Card>
  );
}

/** Taxa digitada ("2,50", "1.234,56" ou vazio = 0). Devolve null quando não é um valor válido. */
function valorTaxa(s) {
  const t = String(s || '').trim().replace(/^R\$\s*/i, '');
  if (!t) return 0;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(t)) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : null;
}

// =========================================================================== pedido (análise)
function PedidoCentral({ module, api }) {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [erro, setErro] = useState('');
  const [obs, setObs] = useState('');
  const [pago, setPago] = useState(todayISO());
  const [taxa, setTaxa] = useState('');
  const [taxaObs, setTaxaObs] = useState('');
  const [run, busy] = useAction();
  const toast = useToast();
  const confirmar = useConfirm();
  const perguntar = usePrompt();
  const base = `/m/${module.key}/central`;

  const load = () => api.get(`/pedidos/${id}`).then((x) => { setP(x); setObs(x.obs_central || ''); }).catch((e) => setErro(e.message));
  useEffect(() => { load(); api.get('/config').then(setCfg); }, [id]);

  if (erro) return <><PageHeader title="Pedido" back={base} /><Alert>{erro}</Alert></>;
  if (!p || !cfg) return <Empty>Carregando…</Empty>;

  const ativas = p.notas.filter((n) => ['aguardando', 'ok', 'recusada'].includes(n.status));
  const analisadas = ativas.filter((n) => n.status !== 'aguardando').length;
  const nOk = ativas.filter((n) => n.status === 'ok').length;
  const aberto = p.status !== 'cancelado';

  const aprovarTudo = async () => {
    if (await confirmar({ titulo: 'Aprovar todas as notas pendentes?', mensagem: `As notas que estão aguardando em ${p.codigo} serão aprovadas pelo valor informado.`, confirmar: 'Aprovar todas' })
      && await run(() => api.post(`/central/pedidos/${p.id}/aprovar-tudo`), 'Notas aprovadas')) load();
  };
  const reprovarTudo = async () => {
    const motivo = await perguntar({ titulo: 'Recusar todas as notas pendentes?', mensagem: 'O colaborador verá o motivo e poderá enviar outras fotos.', label: 'Motivo', obrigatorio: true, confirmar: 'Recusar todas', perigo: true });
    if (motivo && await run(() => api.post(`/central/pedidos/${p.id}/reprovar-tudo`, { motivo }), 'Notas recusadas')) load();
  };
  const salvarObs = async () => { if (await run(() => api.put(`/central/pedidos/${p.id}/obs`, { obs_central: obs }), 'Observação salva (o colaborador vê no pedido)')) load(); };
  const taxaNum = valorTaxa(taxa);
  const pagar = async (data) => {
    if (data && taxaNum === null) { toast('Taxa inválida. Use só números, ex.: 2,50'); return; }
    const corpo = data ? { pago_em: data, taxa: taxaNum, taxa_obs: taxaObs } : { pago_em: null };
    if (await run(() => api.post(`/central/pedidos/${p.id}/pagamento`, corpo), data ? 'Pagamento registrado' : 'Pagamento desfeito')) { setTaxa(''); setTaxaObs(''); load(); }
  };

  return (
    <>
      <PageHeader title="" back={base} />
      <Card className="dp-cab">
        <div className="dp-cab-top">
          <div>
            <h2>{p.codigo} <PedidoBadge s={p.status} /> {p.pago_em && <Badge tone="success">Pago em {fmtDate(p.pago_em)}</Badge>}</h2>
            <div className="cell-strong">{p.solicitante_nome}</div>
            <div className="muted small">{p.solicitante_email} · enviado em {fmtDateTime(p.created_at)} · PIX {p.pix_tipo}: <b>{p.pix_chave}</b>
              <button className="dp-link" title="Copiar chave PIX" onClick={() => { navigator.clipboard?.writeText(p.pix_chave); toast('Chave PIX copiada'); }}><Copy size={12} /></button></div>
          </div>
          <div className="dp-cab-tot">
            <div><div className="muted small">Total declarado</div><b>{money(p.total_declarado)}</b></div>
            <div><div className="muted small">Total aprovado (OK)</div><b className="dp-verde">{money(p.total_aprovado)}</b></div>
          </div>
        </div>
        <div className="dp-prog"><span style={{ width: `${ativas.length ? (analisadas / ativas.length) * 100 : 0}%` }} /></div>
        <div className="dp-cab-foot">
          <span className="muted small">{analisadas} de {ativas.length} notas analisadas · {nOk} OK · {analisadas - nOk} recusada(s)</span>
          <div className="dp-acoes">
            {aberto && ativas.some((n) => n.status === 'aguardando') && <>
              <Button variant="outline" className="btn-sm" onClick={reprovarTudo} disabled={busy}><X size={14} /> Recusar pendentes</Button>
              <Button className="btn-sm" onClick={aprovarTudo} disabled={busy}><CheckCheck size={14} /> Aprovar pendentes</Button>
            </>}
            <a className="btn btn-outline btn-sm" href={`/api/m/${module.key}/central/pedidos/${p.id}/zip`}><Download size={14} /> Baixar pedido (ZIP)</a>
            <a className="btn btn-outline btn-sm" href={`/api/m/${module.key}/central/pedidos/${p.id}/pdf`} title="Todas as fotos e notas do pedido num PDF só"><FileText size={14} /> Baixar PDF</a>
          </div>
        </div>
        {p.obs_solicitante && <div className="dp-info small"><b>Obs. do colaborador:</b> {p.obs_solicitante}</div>}
        <div className="dp-obs-edit">
          <Field label="Observação da central (o colaborador vê)"><textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} disabled={!aberto} /></Field>
          {aberto && <Button variant="outline" className="btn-sm" onClick={salvarObs} disabled={busy || obs === (p.obs_central || '')}>Salvar observação</Button>}
        </div>
        {['aprovado', 'parcial'].includes(p.status) && (
          <div className="dp-pag">
            {p.pago_em ? <><CheckCircle2 size={16} className="dp-verde" /> Pago em <b>{fmtDate(p.pago_em)}</b>
              {p.pagamento_taxa > 0 && <span>· {money(p.total_aprovado)} + taxa <b>{money(p.pagamento_taxa)}</b>{p.pagamento_taxa_obs ? ` (${p.pagamento_taxa_obs})` : ''}</span>}
              <span>· Total pago <b>{money(p.total_aprovado + (p.pagamento_taxa || 0))}</b></span>
              <button className="dp-link" onClick={() => pagar(null)}>desfazer</button></> : <>
              <span>Pagamento de <b>{money(p.total_aprovado)}</b> via PIX</span>
              <input type="date" value={pago} onChange={(e) => setPago(e.target.value)} />
              <label className="dp-taxa">Taxa R$ <input inputMode="decimal" placeholder="0,00" value={taxa} onChange={(e) => setTaxa(e.target.value)}
                className={taxaNum === null ? 'dp-invalido' : ''} /></label>
              {taxaNum > 0 && <input className="dp-taxa-obs" placeholder="Motivo da taxa (opcional)" value={taxaObs} maxLength={200} onChange={(e) => setTaxaObs(e.target.value)} />}
              {taxaNum > 0 && <span>Total <b>{money(p.total_aprovado + taxaNum)}</b></span>}
              <Button className="btn-sm" onClick={() => pagar(pago)} disabled={busy}>Registrar pagamento</Button>
            </>}
          </div>
        )}
      </Card>

      {ativas.map((n, i) => <NotaAnalise key={n.id} module={module} api={api} cfg={cfg} nota={n} indice={i + 1} aberto={aberto} onReload={load} />)}
      {p.notas.some((n) => n.status === 'substituida') && (
        <p className="muted small">Fotos substituídas pelo colaborador: {p.notas.filter((n) => n.status === 'substituida').map((n) => `${n.codigo} (${n.motivo_recusa || 'recusada'})`).join(' · ')}</p>
      )}
      <details className="dp-hist">
        <summary>Histórico ({p.historico.length})</summary>
        {p.historico.map((h) => <div key={h.id} className="small"><span className="muted">{fmtDateTime(h.created_at)}</span> <b>{h.acao}</b>{h.detalhe ? ` · ${h.detalhe}` : ''} <span className="muted">— {h.user_nome}</span></div>)}
      </details>
    </>
  );
}

// =========================================================================== financeiro
function Financeiro({ module, api }) {
  const navigate = useNavigate();
  const [lista, setLista] = useState(null);
  const [aba, setAba] = useState('a_pagar');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [run, busy] = useAction();
  const toast = useToast();
  const load = () => api.get('/central/pedidos').then(setLista);
  useEffect(() => { load(); }, []);

  const pagaveis = (lista || []).filter((p) => ['aprovado', 'parcial'].includes(p.status));
  const vis = pagaveis.filter((p) => (aba === 'a_pagar' ? !p.pago_em : !!p.pago_em)
    && (!de || p.created_at.slice(0, 10) >= de) && (!ate || p.created_at.slice(0, 10) <= ate));
  const total = vis.reduce((s, p) => s + p.total_aprovado, 0);
  const pagos = aba === 'pagos';
  const totalTaxa = vis.reduce((s, p) => s + (p.pagamento_taxa || 0), 0);
  const pagar = async (p) => { if (await run(() => api.post(`/central/pedidos/${p.id}/pagamento`, { pago_em: todayISO() }), `${p.codigo} marcado como pago`)) load(); };
  const exportUrl = `/api/m/${module.key}/central/exportar?${new URLSearchParams({ status: aba, ...(de ? { de } : {}), ...(ate ? { ate } : {}) })}`;

  return (
    <>
      <PageHeader title="Financeiro" subtitle="Reembolsos aprovados para pagamento via PIX" back={null}
        actions={<>
          <a className="btn btn-outline" href={exportUrl}><FileSpreadsheet size={16} /> Excel desta lista</a>
          <a className="btn btn-outline" href={`/api/m/${module.key}/central/exportar`}><FileSpreadsheet size={16} /> Excel de tudo</a>
        </>} />
      <div className="tabs">
        <button className={aba === 'a_pagar' ? 'active' : ''} onClick={() => setAba('a_pagar')}>A pagar ({pagaveis.filter((p) => !p.pago_em).length})</button>
        <button className={aba === 'pagos' ? 'active' : ''} onClick={() => setAba('pagos')}>Pagos ({pagaveis.filter((p) => p.pago_em).length})</button>
      </div>
      <div className="dp-filtros">
        <label className="kit-filtro"><span>Enviado de</span><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
        <label className="kit-filtro"><span>até</span><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
      </div>
      {lista === null ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>Nada aqui.</Empty> : (
        <Card className="table-card">
          <table className="table dp-table">
            <thead><tr><th>Pedido</th><th>Colaborador</th><th>PIX</th><th>Analisado em</th><th>Notas</th><th className="num">Aprovado</th>{pagos && <><th className="num">Taxa</th><th className="num">Total pago</th></>}<th>{pagos ? 'Pago em' : ''}</th><th /></tr></thead>
            <tbody>
              {vis.map((p) => (
                <tr key={p.id}>
                  <td className="cell-strong"><button className="dp-link" onClick={() => navigate(`/m/${module.key}/central/pedido/${p.id}`)}>{p.codigo}</button></td>
                  <td>{p.solicitante_nome}</td>
                  <td className="small">{p.pix_tipo}: <b>{p.pix_chave}</b> <button className="dp-link" title="Copiar" onClick={() => { navigator.clipboard?.writeText(p.pix_chave); toast('Chave PIX copiada'); }}><Copy size={12} /></button></td>
                  <td>{fmtDateTime(p.analisado_at)}</td>
                  <td>{p.n_ok}/{p.n_notas} <PedidoBadge s={p.status} /></td>
                  <td className="num cell-strong">{money(p.total_aprovado)}</td>
                  {pagos && <><td className="num" title={p.pagamento_taxa_obs || ''}>{p.pagamento_taxa ? money(p.pagamento_taxa) : '—'}</td>
                    <td className="num cell-strong">{money(p.total_aprovado + (p.pagamento_taxa || 0))}</td></>}
                  <td>{p.pago_em ? fmtDate(p.pago_em) : ''}</td>
                  <td className="row-actions">
                    {!p.pago_em && <Button className="btn-sm" onClick={() => pagar(p)} disabled={busy}><Check size={14} /> Marcar pago hoje</Button>}
                    <a className="icon-btn" title="Baixar ZIP" href={`/api/m/${module.key}/central/pedidos/${p.id}/zip`}><Download size={15} /></a>
                    <a className="icon-btn" title="Baixar PDF com todas as fotos" href={`/api/m/${module.key}/central/pedidos/${p.id}/pdf`}><FileText size={15} /></a>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={5} className="cell-strong">Total ({vis.length})</td><td className="num cell-strong">{money(total)}</td>
              {pagos && <><td className="num cell-strong">{money(totalTaxa)}</td><td className="num cell-strong">{money(total + totalTaxa)}</td></>}<td colSpan={2} /></tr></tfoot>
          </table>
        </Card>
      )}
    </>
  );
}

// =========================================================================== configurações
function Config({ api }) {
  const [cfg, setCfg] = useState(null);
  const [f, setF] = useState(null);
  const [run, busy] = useAction();
  useEffect(() => { api.get('/config').then((c) => { setCfg(c); setF({ tipos: c.tipos.join('\n'), centros: c.centros.join('\n'), dias_limite: c.dias_limite }); }); }, []);
  if (!f) return <Empty>Carregando…</Empty>;
  const salvar = async () => { const r = await run(() => api.put('/central/config', f), 'Configurações salvas'); if (r) setCfg({ ...cfg, ...r }); };
  return (
    <div className="dp-config">
      <PageHeader title="Configurações" subtitle="Listas e regras do Despesas" back={null} />
      <Card>
        <div className="form-grid">
          <div className="grid-2">
            <Field label="Tipos de despesa" hint="Um por linha"><textarea rows={9} value={f.tipos} onChange={(e) => setF({ ...f, tipos: e.target.value })} /></Field>
            <Field label="Centros de custo" hint="Um por linha"><textarea rows={9} value={f.centros} onChange={(e) => setF({ ...f, centros: e.target.value })} /></Field>
          </div>
          <Field label="Alerta de data antiga (dias)" hint="Notas mais antigas que isso aparecem com alerta para a central">
            <input type="number" min={1} value={f.dias_limite} onChange={(e) => setF({ ...f, dias_limite: e.target.value })} style={{ maxWidth: 140 }} />
          </Field>
          <div><Button onClick={salvar} disabled={busy}>Salvar</Button></div>
        </div>
      </Card>
      <Card className="dp-mt">
        <h3 className="dp-h3">Leitura automática (IA)</h3>
        {cfg.ia.ativo
          ? <p className="dp-m0"><CheckCircle2 size={15} className="dp-verde" /> Ativa · provedor <b>{cfg.ia.provedor}</b></p>
          : <p className="dp-m0 muted">Não configurada — os colaboradores preenchem os campos manualmente.{cfg.ia.erro ? ` Erro: ${cfg.ia.erro}` : ''} Para ligar, crie um conector em <code>core/server/ai-providers/</code> e inicie o servidor com <code>QIMA_AI_PROVIDER</code>.</p>}
      </Card>
    </div>
  );
}

export default function Central(props) {
  return (
    <Routes>
      <Route index element={<Lista {...props} />} />
      <Route path="pedido/:id" element={<PedidoCentral {...props} />} />
      <Route path="financeiro" element={<Financeiro {...props} />} />
      <Route path="config" element={<Config {...props} />} />
    </Routes>
  );
}
