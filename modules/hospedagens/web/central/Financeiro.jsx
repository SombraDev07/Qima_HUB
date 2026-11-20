import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Paperclip, X, FileText, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, Card, Empty, Field, PageHeader, useConfirm } from '@hub';
import { FiltroSelect, SITUACAO, SituacaoBadge, exportCsv, fmtDate, fmtShort, money, norm, uniq, useAction, useToast } from '../shared.jsx';

const EXTRATO_TONE = { 'Em Aberto': 'muted', Pendente: 'warning', 'Recebido - Parcial': 'info', Finalizado: 'success' };
const PAG_TONE = { Pendente: 'warning', 'Em andamento': 'info', Pago: 'success' };
// Status do pedido controlado pelo financeiro: Finalizado trava o solicitante (sem prorrogar, check-out etc.)
const PED_ST = { em_andamento: { label: 'Em andamento', tone: 'info' }, finalizado: { label: 'Finalizado', tone: 'success' } };
const PedStatus = ({ s }) => (PED_ST[s] ? <Badge tone={PED_ST[s].tone}>{PED_ST[s].label}</Badge> : null);

/** Finalizar / voltar para Em andamento o pedido inteiro (todos os quartos dele). */
function StatusPedido({ api, q, onChange }) {
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  if (!PED_ST[q.pedido_status]) return <span className="muted small">{q.pedido_status}</span>;
  const fin = q.pedido_status === 'finalizado';
  const trocar = async () => {
    const ok = await confirmar(fin
      ? { titulo: `Voltar ${q.pedido_codigo} para Em andamento?`, mensagem: 'O solicitante volta a poder pedir prorrogação, check-out e cancelamento. Obs.: com o extrato de todos os quartos Finalizado, o pedido finaliza de novo ao salvar o financeiro.', confirmar: 'Voltar para Em andamento' }
      : { titulo: `Finalizar o pedido ${q.pedido_codigo}?`, mensagem: 'O pedido inteiro fica Finalizado e o solicitante não consegue mais prorrogar, fazer check-out ou cancelar. Dá para voltar depois.', confirmar: 'Finalizar pedido' });
    if (!ok) return;
    if (await run(() => api.post(`/central/pedidos/${q.pedido_id}/${fin ? 'reabrir' : 'finalizar'}`), fin ? 'Pedido de volta para Em andamento' : 'Pedido finalizado')) onChange();
  };
  return (
    <div className="hs-ped-st">
      <PedStatus s={q.pedido_status} />
      <Button className="btn-sm" variant={fin ? 'outline' : 'brand'} onClick={trocar} disabled={busy}>{fin ? 'Voltar para Em andamento' : 'Finalizar pedido'}</Button>
    </div>
  );
}
const POR_PAGINA = 100;

function Anexos({ module, api, quartoId }) {
  const [lista, setLista] = useState([]);
  const [ver, setVer] = useState(null);
  const [up, setUp] = useState(false);
  const toast = useToast();
  const [run] = useAction();
  const confirmar = useConfirm();
  const load = () => api.get(`/central/quartos/${quartoId}/anexos`).then(setLista).catch(() => {});
  useEffect(() => { load(); setVer(null); }, [quartoId]);
  const url = (a) => `/api/m/${module.key}/central/anexos/${a.id}`;

  const enviar = async (files) => {
    setUp(true);
    for (const f of files) {
      if (f.size > 15 * 1024 * 1024) { toast(`${f.name}: máximo 15 MB`, 'erro'); continue; }
      const r = await fetch(`/api/m/${module.key}/central/quartos/${quartoId}/anexos?nome=${encodeURIComponent(f.name)}`, {
        method: 'POST', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f, credentials: 'same-origin',
      });
      if (!r.ok) toast(`${f.name}: ${(await r.json().catch(() => ({}))).error || 'falhou'}`, 'erro');
    }
    setUp(false);
    load();
  };
  const remover = async (a) => {
    if (!await confirmar({ titulo: 'Remover este anexo?', mensagem: a.nome, confirmar: 'Remover', perigo: true })) return;
    if (await run(() => api.del(`/central/anexos/${a.id}`), 'Anexo removido')) { if (ver?.id === a.id) setVer(null); load(); }
  };

  return (
    <div className="hs-anexos">
      {lista.map((a) => (
        <div key={a.id} className={`hs-anexo ${ver?.id === a.id ? 'on' : ''}`}>
          <button className="hs-link" onClick={() => setVer(ver?.id === a.id ? null : a)}><FileText size={15} /> {a.nome}</button>
          <span className="muted small">{Math.ceil((a.tamanho || 0) / 1024)} KB</span>
          <a className="icon-btn" href={url(a)} target="_blank" rel="noreferrer" title="Abrir"><Download size={14} /></a>
          <button className="icon-btn danger" onClick={() => remover(a)} title="Remover"><Trash2 size={14} /></button>
        </div>
      ))}
      <label className="hs-upload">
        <Paperclip size={15} /> {up ? 'Enviando…' : lista.length ? 'Anexar outro' : 'Anexar PDF ou imagem'}
        <input type="file" accept="application/pdf,image/*" multiple hidden disabled={up} onChange={(e) => { enviar([...e.target.files]); e.target.value = ''; }} />
      </label>
      {ver && (
        <div className="hs-preview">
          {ver.mime === 'application/pdf' ? <iframe src={url(ver)} title={ver.nome} /> : <img src={url(ver)} alt={ver.nome} />}
        </div>
      )}
    </div>
  );
}

function Painel({ module, api, q, opcoes, onClose, onSaved, onStatus }) {
  const campos = ['fin_extra', 'fin_extra_obs', 'fin_extrato_id', 'fin_extrato_status', 'fin_extrato_ini', 'fin_extrato_fim', 'fin_dt_solicitacao',
    'fin_po', 'fin_dt_abertura', 'fin_dt_nf', 'fin_nf', 'fin_vencimento', 'fin_status_pg', 'fin_obs'];
  const [f, setF] = useState(() => Object.fromEntries(campos.map((c) => [c, q[c] ?? ''])));
  const [run, busy] = useAction();
  useEffect(() => {
    setF(Object.fromEntries(campos.map((c) => [c, q[c] ?? ''])));
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [q.id]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const extra = Number(String(f.fin_extra).replace(',', '.')) || 0;
  const salvar = async () => { const r = await run(() => api.put(`/central/quartos/${q.id}/financeiro`, f), 'Financeiro do quarto salvo'); if (r) onSaved(r); };

  return (
    <div className="hs-drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="hs-drawer">
        <div className="hs-drawer-head">
          <div>
            <h3>{q.pedido_codigo} · quarto {q.codigo} · {q.hotel_nome || 'sem hotel'}</h3>
            <p className="muted small hs-m0">{fmtDate(q.data_in)} – {fmtDate(q.data_out)} · {q.dias} diária(s) · {q.tipo} · {q.ocupantes.map((o) => o.nome).join(', ')}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="hs-drawer-body">
          <section className="hs-resumo">
            <h4>Pedido</h4>
            <dl>
              <dt>Código</dt><dd><Link to={`/m/${module.key}/central/pedido/${q.pedido_id}`}>{q.pedido_codigo}</Link></dd>
              <dt>Cidade</dt><dd>{q.cidade} - {q.uf}</dd>
              <dt>Solicitante</dt><dd>{q.solicitante_nome}</dd>
              <dt>Projeto</dt><dd>{q.projeto || '—'}</dd>
              <dt>Status do pedido</dt><dd><StatusPedido api={api} q={q} onChange={onStatus} /></dd>
            </dl>
            <h4>Hospedagem</h4>
            <dl>
              <dt>Hotel</dt><dd>{q.hotel_nome || '—'}</dd>
              <dt>Quarto · tipo</dt><dd>{q.codigo} · {q.tipo}</dd>
              <dt>Situação</dt><dd><SituacaoBadge s={q.situacao} /></dd>
              <dt>Período</dt><dd>{fmtDate(q.data_in)} – {fmtDate(q.data_out)}</dd>
              <dt>Hóspedes</dt><dd>{q.ocupantes.map((o) => <div key={o.id}>{o.nome}</div>)}</dd>
            </dl>
            <h4>Valores</h4>
            <dl>
              <dt>Diária × dias</dt><dd>{money(q.diaria)} × {q.dias}</dd>
              <dt>Total</dt><dd>{money(q.total)}</dd>
              <dt>Extra</dt><dd>{money(extra)}{f.fin_extra_obs ? ` · ${f.fin_extra_obs}` : ''}</dd>
              <dt>Total com extra</dt><dd className="cell-strong">{money(q.total + extra)}</dd>
            </dl>
          </section>

          <section className="form-grid">
            <div className="grid-2">
              <Field label="Extra (R$)"><input inputMode="decimal" value={f.fin_extra} onChange={set('fin_extra')} /></Field>
              <Field label="Obs. extra"><input value={f.fin_extra_obs} onChange={set('fin_extra_obs')} /></Field>
            </div>
            <h4 className="section-title">Extrato</h4>
            <div className="grid-2">
              <Field label="Id do extrato"><input value={f.fin_extrato_id} onChange={set('fin_extrato_id')} /></Field>
              <Field label="Status do extrato">
                <select value={f.fin_extrato_status || 'Em Aberto'} onChange={set('fin_extrato_status')}>{opcoes.extratoStatus.map((s) => <option key={s}>{s}</option>)}</select>
              </Field>
            </div>
            {f.fin_extrato_status === 'Recebido - Parcial' && (
              <div className="grid-2">
                <Field label="Extrato parcial · início"><input type="date" value={f.fin_extrato_ini} onChange={set('fin_extrato_ini')} /></Field>
                <Field label="Extrato parcial · fim"><input type="date" value={f.fin_extrato_fim} onChange={set('fin_extrato_fim')} /></Field>
              </div>
            )}
            <Field label="Anexos · PDF ou imagem"><Anexos module={module} api={api} quartoId={q.id} /></Field>
            <h4 className="section-title">Faturamento</h4>
            <div className="grid-2">
              <Field label="Data solicitação"><input type="date" value={f.fin_dt_solicitacao} onChange={set('fin_dt_solicitacao')} /></Field>
              <Field label="PO"><input value={f.fin_po} onChange={set('fin_po')} /></Field>
              <Field label="Data abertura"><input type="date" value={f.fin_dt_abertura} onChange={set('fin_dt_abertura')} /></Field>
              <Field label="Data NF"><input type="date" value={f.fin_dt_nf} onChange={set('fin_dt_nf')} /></Field>
              <Field label="Nº NF"><input value={f.fin_nf} onChange={set('fin_nf')} /></Field>
              <Field label="Vencimento"><input type="date" value={f.fin_vencimento} onChange={set('fin_vencimento')} /></Field>
              <Field label="Status pagamento">
                <select value={f.fin_status_pg || 'Pendente'} onChange={set('fin_status_pg')}>{opcoes.pagamentoStatus.map((s) => <option key={s}>{s}</option>)}</select>
              </Field>
            </div>
            <Field label="Observação (faturamento)"><textarea rows={2} value={f.fin_obs} onChange={set('fin_obs')} /></Field>
          </section>
        </div>
        <div className="hs-drawer-foot">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={salvar} disabled={busy}>Salvar</Button>
        </div>
      </aside>
    </div>
  );
}

export default function Financeiro({ module, api }) {
  const base = `/m/${module.key}/central`;
  const [rows, setRows] = useState(null);
  const [opcoes, setOpcoes] = useState({ extratoStatus: [], pagamentoStatus: [] });
  const [erro, setErro] = useState('');
  const [sel, setSel] = useState(null);
  const [pag, setPag] = useState(1);
  const [f, setF] = useState({ de: '', ate: '', hotel: '', hospede: '', cidade: '', situacao: '', extrato: '', pagamento: '', pedido: '' });

  const load = () => api.get('/central/financeiro').then(setRows).catch((e) => setErro(e.message));
  useEffect(() => { load(); api.get('/opcoes').then(setOpcoes); }, []);

  const all = rows || [];
  const opts = useMemo(() => ({
    hotel: uniq(all.map((r) => r.hotel_nome)),
    cidade: uniq(all.map((r) => `${r.cidade} - ${r.uf}`)),
  }), [rows]);

  const filtrados = all.filter((r) =>
    (!f.de || (r.data_in || '') >= f.de) && (!f.ate || (r.data_in || '') <= f.ate) &&
    (!f.hotel || r.hotel_nome === f.hotel) && (!f.cidade || `${r.cidade} - ${r.uf}` === f.cidade) &&
    (!f.situacao || r.situacao === f.situacao) && (!f.extrato || r.fin_extrato_status === f.extrato) &&
    (!f.pagamento || r.fin_status_pg === f.pagamento) && (!f.pedido || r.pedido_status === f.pedido) &&
    (!f.hospede || norm(r.ocupantes.map((o) => o.nome).join(' ')).includes(norm(f.hospede))));
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const vis = filtrados.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);
  const tot = filtrados.reduce((a, r) => ({ total: a.total + r.total, extra: a.extra + (r.fin_extra || 0), dias: a.dias + r.dias }), { total: 0, extra: 0, dias: 0 });
  const set = (k) => (v) => { setF({ ...f, [k]: v }); setPag(1); };

  const exportar = () => exportCsv(`financeiro-hospedagens-${new Date().toISOString().slice(0, 10)}.csv`, [
    { label: 'Pedido', get: (r) => r.pedido_codigo }, { label: 'Status do pedido', get: (r) => PED_ST[r.pedido_status]?.label || r.pedido_status }, { label: 'Quarto', get: (r) => r.codigo }, { label: 'Cidade', get: (r) => `${r.cidade} - ${r.uf}` },
    { label: 'Projeto', get: (r) => r.projeto }, { label: 'Solicitante', get: (r) => r.solicitante_nome },
    { label: 'Check-in', get: (r) => fmtDate(r.data_in) }, { label: 'Check-out', get: (r) => fmtDate(r.data_out) },
    { label: 'Hóspedes', get: (r) => r.ocupantes.map((o) => o.nome).join(', ') }, { label: 'Hotel', get: (r) => r.hotel_nome },
    { label: 'Situação', get: (r) => SITUACAO[r.situacao]?.label }, { label: 'Tipo', get: (r) => r.tipo },
    { label: 'Diária', get: (r) => String(r.diaria).replace('.', ',') }, { label: 'Dias', get: (r) => r.dias },
    { label: 'Total', get: (r) => String(r.total).replace('.', ',') }, { label: 'Extra', get: (r) => String(r.fin_extra || 0).replace('.', ',') },
    { label: 'Obs. extra', get: (r) => r.fin_extra_obs }, { label: 'Total c/ extra', get: (r) => String(r.total_extra).replace('.', ',') },
    { label: 'Id extrato', get: (r) => r.fin_extrato_id }, { label: 'Status extrato', get: (r) => r.fin_extrato_status },
    { label: 'PO', get: (r) => r.fin_po }, { label: 'Nº NF', get: (r) => r.fin_nf }, { label: 'Data NF', get: (r) => fmtDate(r.fin_dt_nf) },
    { label: 'Vencimento', get: (r) => fmtDate(r.fin_vencimento) }, { label: 'Status pagamento', get: (r) => r.fin_status_pg },
  ], filtrados);

  return (
    <>
      <PageHeader title="Financeiro" subtitle="Cada linha é um trecho de quarto (check-outs parciais geram novos trechos). Com o extrato de todos os quartos Finalizado, o pedido finaliza sozinho." back={base}
        actions={<Button variant="outline" onClick={exportar} disabled={!filtrados.length}><Download size={16} /> Exportar Excel</Button>} />
      <Alert>{erro}</Alert>
      <Card className="hs-filtros-card">
        <div className="hs-filtros">
          <label className="hs-filtro"><span>Check-in de</span><input type="date" value={f.de} onChange={(e) => set('de')(e.target.value)} /></label>
          <label className="hs-filtro"><span>até</span><input type="date" value={f.ate} onChange={(e) => set('ate')(e.target.value)} /></label>
          <FiltroSelect label="Hotel" value={f.hotel} onChange={set('hotel')} options={opts.hotel} />
          <label className="hs-filtro"><span>Hóspede</span><input value={f.hospede} onChange={(e) => set('hospede')(e.target.value)} placeholder="Nome do hóspede" /></label>
          <FiltroSelect label="Cidade" value={f.cidade} onChange={set('cidade')} options={opts.cidade} />
          <FiltroSelect label="Situação" value={f.situacao} onChange={set('situacao')} options={Object.entries(SITUACAO).map(([value, v]) => ({ value, label: v.label }))} />
          <FiltroSelect label="Extrato" value={f.extrato} onChange={set('extrato')} options={opcoes.extratoStatus} />
          <FiltroSelect label="Pagamento" value={f.pagamento} onChange={set('pagamento')} options={opcoes.pagamentoStatus} />
          <FiltroSelect label="Status do pedido" value={f.pedido} onChange={set('pedido')} options={Object.entries(PED_ST).map(([value, v]) => ({ value, label: v.label }))} />
        </div>
      </Card>

      {rows === null ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>Nenhum registro.</Empty> : (
        <Card className="table-card">
          <table className="table hs-table hs-fin">
            <thead>
              <tr><th>Pedido</th><th>Cidade</th><th>In</th><th>Out</th><th>Quarto</th><th>Hóspedes</th><th>Hotel</th><th>Situação</th><th>Tipo</th>
                <th className="num">Diária</th><th className="num">Dias</th><th className="num">Total</th><th className="num">Extra</th><th className="num">Total c/ extra</th>
                <th>Extrato</th><th>Pagamento</th><th /></tr>
            </thead>
            <tbody>
              {vis.map((r) => (
                <tr key={r.id} className={`hs-click ${sel?.id === r.id ? 'hs-row-sel' : ''}`} onClick={() => setSel(r)}>
                  <td className="cell-strong">{r.pedido_codigo}<div><PedStatus s={r.pedido_status} /></div></td>
                  <td>{r.cidade} - {r.uf}</td>
                  <td>{fmtShort(r.data_in)}</td>
                  <td>{fmtShort(r.data_out)}</td>
                  <td>{r.codigo}</td>
                  <td className="hs-trunc" title={r.ocupantes.map((o) => o.nome).join(', ')}>{r.ocupantes.map((o) => o.nome).join(', ') || '—'}</td>
                  <td>{r.hotel_nome || '—'}</td>
                  <td><SituacaoBadge s={r.situacao} /></td>
                  <td>{r.tipo}</td>
                  <td className="num">{money(r.diaria)}</td>
                  <td className="num">{r.dias}</td>
                  <td className="num cell-strong">{money(r.total)}</td>
                  <td className="num">{r.fin_extra ? money(r.fin_extra) : '—'}</td>
                  <td className="num">{money(r.total_extra)}</td>
                  <td><Badge tone={EXTRATO_TONE[r.fin_extrato_status]}>{r.fin_extrato_status}</Badge>{r.fin_extrato_id && <div className="muted small">#{r.fin_extrato_id}</div>}</td>
                  <td><Badge tone={PAG_TONE[r.fin_status_pg]}>{r.fin_status_pg}</Badge>{r.n_anexos > 0 && <div className="muted small"><Paperclip size={11} /> {r.n_anexos}</div>}</td>
                  <td className="row-actions"><Button className="btn-sm">Editar</Button></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={10} className="cell-strong">Totais ({filtrados.length} registro(s))</td><td className="num">{tot.dias}</td>
                <td className="num cell-strong">{money(tot.total)}</td><td className="num">{money(tot.extra)}</td><td className="num cell-strong">{money(tot.total + tot.extra)}</td><td colSpan={3} /></tr>
            </tfoot>
          </table>
          <div className="hs-pager">
            <span>Exibindo {vis.length} de {filtrados.length} registro(s)</span>
            <span>
              <button className="hs-link" disabled={pag <= 1} onClick={() => setPag(pag - 1)}>‹ Anterior</button>
              {' '}Página {pag} de {paginas}{' '}
              <button className="hs-link" disabled={pag >= paginas} onClick={() => setPag(pag + 1)}>Próxima ›</button>
            </span>
          </div>
        </Card>
      )}
      {sel && <Painel module={module} api={api} q={sel} opcoes={opcoes} onClose={() => setSel(null)}
        onSaved={() => { setSel(null); load(); }}
        onStatus={async () => { const nov = await api.get('/central/financeiro'); setRows(nov); setSel(nov.find((x) => x.id === sel.id) || null); }} />}
    </>
  );
}
