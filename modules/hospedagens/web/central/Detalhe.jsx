import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Send, Pencil, Trash2, LogOut, Check, X, RotateCcw, CheckCheck, Search } from 'lucide-react';
import { Alert, Badge, Button, Card, Empty, Field, PageHeader, useConfirm, usePrompt } from '@hub';
import { AJUSTE, Modal, PedidoBadge, SituacaoBadge, fmtDate, fmtShort, money, useAction } from '../shared.jsx';
import { Historico } from '../Solicitante.jsx';

// ------------------------------------------------------------------ busca de hotel
function HotelPicker({ api, value, cidade, onChange }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState([]);
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => api.get(`/central/hoteis/busca?q=${encodeURIComponent(q)}&cidade=${encodeURIComponent(cidade)}`).then(setRes).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    const out = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, []);

  return (
    <div className="hs-combo" ref={ref}>
      <div className="hs-hotel-input" onClick={() => setOpen(true)}>
        <Search size={14} />
        <input
          value={open ? q : value?.nome || ''}
          placeholder={value?.nome || 'Buscar hotel…'}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { setOpen(true); setQ(''); }}
        />
      </div>
      {open && (
        <ul className="hs-sugest">
          {res.map((h) => (
            <li key={h.id} onMouseDown={() => { onChange(h); setOpen(false); }}>
              <b>{h.nome}</b> <span className="muted small">{h.cidade} - {h.uf} · S {money(h.valor_s)} · D {money(h.valor_d)}</span>
            </li>
          ))}
          {!res.length && <li className="muted small">Nenhum hotel. Cadastre em “Hotéis”.</li>}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ edição de quarto (linha)
function QuartoEditor({ api, pedido, quarto, onCancel, onSaved }) {
  const ids = quarto.ocupantes.map((o) => o.id);
  const [slots, setSlots] = useState([0, 1, 2, 3].map((i) => ids[i] || ''));
  const [hotel, setHotel] = useState(quarto.hotel_id ? { id: quarto.hotel_id, nome: quarto.hotel_nome } : null);
  const [din, setDin] = useState(quarto.data_in || pedido.data_inicio);
  const [dout, setDout] = useState(quarto.data_out || pedido.data_fim);
  const [diaria, setDiaria] = useState(quarto.diaria_manual ? String(quarto.diaria) : '');
  const [obs, setObs] = useState(quarto.obs || '');
  const [run, busy] = useAction();

  const livres = pedido.hospedes.filter((h) => h.status === 'ativo' && (!h.quarto_id || h.quarto_id === quarto.id));
  const escolhidos = slots.filter(Boolean).map(Number);
  const n = escolhidos.length;
  const auto = hotel ? [0, hotel.valor_s, hotel.valor_d, hotel.valor_t, hotel.valor_q][n] ?? null : null;

  const salvar = async () => {
    const r = await run(() => api.put(`/central/quartos/${quarto.id}`, {
      hospedes: escolhidos, hotel_id: hotel?.id || null, data_in: din, data_out: dout, diaria: diaria === '' ? null : diaria, obs,
    }), 'Quarto salvo');
    if (r) onSaved();
  };

  return (
    <tr className="hs-edit-row">
      <td className="cell-strong">{quarto.codigo}</td>
      <td colSpan={2}>
        <div className="hs-slots">
          {slots.map((v, i) => (
            <select key={i} value={v} onChange={(e) => setSlots(slots.map((s, j) => (j === i ? e.target.value : s)))} aria-label={`Hóspede ${i + 1}`}>
              <option value="">Hóspede {i + 1} —</option>
              {livres.filter((h) => !escolhidos.includes(h.id) || String(h.id) === String(v)).map((h) => <option key={h.id} value={h.id}>{h.nome}</option>)}
            </select>
          ))}
        </div>
      </td>
      <td><HotelPicker api={api} value={hotel} cidade={pedido.cidade} onChange={setHotel} /></td>
      <td><input type="date" value={din} onChange={(e) => setDin(e.target.value)} /></td>
      <td><input type="date" value={dout} min={din} onChange={(e) => setDout(e.target.value)} /></td>
      <td>
        <input className="hs-num" inputMode="decimal" value={diaria} onChange={(e) => setDiaria(e.target.value)}
          placeholder={auto !== null ? String(hotel ? (auto || hotel.valor_s || 0) : '') : 'auto'} title="Vazio = valor do cadastro do hotel" />
      </td>
      <td colSpan={2}><input placeholder="Observação" value={obs} onChange={(e) => setObs(e.target.value)} /></td>
      <td className="row-actions">
        <div className="hs-acts">
          <Button className="btn-sm" onClick={salvar} disabled={busy}><Check size={14} /> Salvar</Button>
          <Button className="btn-sm" variant="outline" onClick={onCancel}>Cancelar</Button>
        </div>
      </td>
    </tr>
  );
}

// ------------------------------------------------------------------ check-out pela central
function CheckoutDialog({ api, quarto, onClose, onDone }) {
  const [sel, setSel] = useState(quarto.ocupantes.map((o) => o.id));
  const [data, setData] = useState(quarto.data_out);
  const [run, busy] = useAction();
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const ok = async () => {
    const r = await run(() => api.post(`/central/quartos/${quarto.id}/checkout`, { hospedes: sel, data }),
      (x) => `${x.nomes} fez check-out${x.ficam ? ' · quarto continua com quem ficou' : ' · quarto finalizado'}`);
    if (r) onDone();
  };
  return (
    <Modal title={`Check-out · ${quarto.codigo}`} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Voltar</Button><Button onClick={ok} disabled={busy || !sel.length}>Confirmar check-out</Button></>}>
      <p className="muted small hs-m0">{quarto.hotel_nome} · {fmtDate(quarto.data_in)} → {fmtDate(quarto.data_out)}</p>
      <div className="checks">
        {quarto.ocupantes.map((o) => (
          <label key={o.id} className="check"><input type="checkbox" checked={sel.includes(o.id)} onChange={() => toggle(o.id)} /> {o.nome}</label>
        ))}
      </div>
      <Field label="Data do check-out" hint="Quem ficar continua num novo trecho do mesmo quarto, com a diária recalculada.">
        <input type="date" value={data} min={quarto.data_in} max={quarto.data_out} onChange={(e) => setData(e.target.value)} />
      </Field>
    </Modal>
  );
}

// ------------------------------------------------------------------ página
export default function DetalheCentral({ module, api }) {
  const base = `/m/${module.key}/central`;
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [erro, setErro] = useState('');
  const [edit, setEdit] = useState(null);
  const [out, setOut] = useState(null);
  const [run, busy] = useAction();
  const perguntarSimNao = useConfirm();
  const perguntar = usePrompt();

  const load = () => api.get(`/central/pedidos/${id}`).then(setP).catch((e) => setErro(e.message));
  useEffect(() => { load(); }, [id]);

  if (erro) return <><PageHeader title="Pedido" back={base} /><Alert>{erro}</Alert></>;
  if (!p) return <Empty>Carregando…</Empty>;

  const encerrado = ['finalizado', 'cancelado'].includes(p.status);
  const abertas = p.solicitacoes.filter((s) => s.status === 'aberta');
  const ativos = p.hospedes.filter((h) => h.status === 'ativo');
  const semQuarto = ativos.filter((h) => !h.quarto_id);
  const aEnviar = p.quartos.filter((q) => !q.enviado || q.situacao === 'alterado');
  const motivoFin = abertas.length ? 'Há ajustes pendentes' : aEnviar.length ? 'Há quartos não enviados' : !p.quartos.length ? 'Sem quartos' : '';
  const emailMsg = (x) => (x.email ? `E-mail enviado para ${p.solicitante_email}` : 'O pedido não tem e-mail do solicitante');

  const novoQuarto = async () => {
    const r = await run(() => api.post(`/central/pedidos/${p.id}/quartos`));
    if (r) { await load(); setEdit(r.id); }
  };
  const enviar = async (q) => { if (await run(() => api.post(`/central/quartos/${q.id}/enviar`), (x) => `${q.codigo} enviado. ${emailMsg(x)}`)) load(); };
  const apagar = async (q) => {
    if (!await perguntarSimNao({ titulo: `Apagar o quarto ${q.codigo}?`, mensagem: q.enviado ? 'Este quarto já foi enviado ao solicitante.' : 'Os hóspedes voltam para "sem quarto".', confirmar: 'Apagar', perigo: true })) return;
    if (await run(() => api.del(`/central/quartos/${q.id}`), `${q.codigo} apagado`)) load();
  };
  const enviarTudo = async () => { if (await run(() => api.post(`/central/pedidos/${p.id}/enviar-tudo`), (x) => `${x.enviados} quarto(s) enviado(s). ${emailMsg(x)}`)) load(); };
  const finalizar = async () => {
    if (!await perguntarSimNao({ titulo: `Finalizar o pedido ${p.codigo}?`, mensagem: 'O pedido vai para Finalizado. Dá para reabrir depois.', confirmar: 'Finalizar' })) return;
    if (await run(() => api.post(`/central/pedidos/${p.id}/finalizar`), 'Pedido finalizado')) load();
  };
  const reabrir = async () => { if (await run(() => api.post(`/central/pedidos/${p.id}/reabrir`), 'Pedido reaberto')) load(); };
  const confirmar = async (s) => { if (await run(() => api.post(`/central/solicitacoes/${s.id}/confirmar`), (x) => `Confirmado · ${x.mensagem}`)) load(); };
  const recusar = async (s) => {
    const resposta = await perguntar({ titulo: `Desconsiderar o ajuste de ${s.hospede_nome || 'hóspede'}?`, mensagem: 'O quarto permanece como está. O motivo é enviado ao solicitante.', label: 'Motivo', confirmar: 'Desconsiderar' });
    if (resposta === null) return;
    if (await run(() => api.post(`/central/solicitacoes/${s.id}/recusar`, { resposta }), 'Ajuste desconsiderado. O quarto permanece como está.')) load();
  };

  return (
    <>
      <PageHeader
        title={`${p.codigo} · detalhe`}
        subtitle={`${p.solicitante_nome} · ${p.cidade} - ${p.uf} · ${fmtDate(p.data_inicio)} → ${fmtDate(p.data_fim)} · ${p.projeto || 'sem projeto'}`}
        back={base}
        actions={<div className="tags">
          <PedidoBadge s={p.status} />
          {!encerrado && <Button variant="outline" onClick={finalizar} disabled={busy || !!motivoFin} title={motivoFin}><CheckCheck size={16} /> Finalizar pedido</Button>}
          {!encerrado && <Button variant="brand" onClick={enviarTudo} disabled={busy || !aEnviar.length}><Send size={16} /> Enviar tudo{aEnviar.length ? ` (${aEnviar.length})` : ''}</Button>}
          {p.status === 'finalizado' && <Button variant="outline" onClick={reabrir} disabled={busy}><RotateCcw size={16} /> Reabrir</Button>}
        </div>}
      />

      {abertas.length > 0 && (
        <Card className="hs-aviso">
          <h3>Ajustes pedidos pelo solicitante</h3>
          <table className="table hs-table">
            <thead><tr><th>Tipo</th><th>Hóspede</th><th>Quarto</th><th>Data pedida</th><th>Observação</th><th /></tr></thead>
            <tbody>
              {abertas.map((s) => (
                <tr key={s.id}>
                  <td><Badge tone="brand">{AJUSTE[s.tipo]}</Badge></td>
                  <td className="cell-strong">{s.hospede_nome || '—'}</td>
                  <td>{s.quarto_codigo || '—'}</td>
                  <td>{s.data ? fmtDate(s.data) : '—'}</td>
                  <td>{s.obs || '—'}</td>
                  <td className="row-actions">
                    <div className="hs-acts">
                      <Button className="btn-sm" onClick={() => confirmar(s)} disabled={busy}><Check size={14} /> {s.tipo === 'editar' ? 'Resolvido' : 'Confirmar'}</Button>
                      <Button className="btn-sm" variant="outline" onClick={() => recusar(s)} disabled={busy}><X size={14} /> Desconsiderar</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="hs-hosp-strip">
        <div className="hs-strip-head">
          <b>{ativos.length} hóspede(s) · {semQuarto.length} sem quarto</b>
          {p.garagem && p.garagem !== 'sem' && <Badge tone="info">Garagem {p.garagem === 'paga' ? 'paga' : 'free'}</Badge>}
        </div>
        <div className="hs-chips">
          {p.hospedes.map((h) => (
            <span key={h.id} className={`hs-hchip ${h.status !== 'ativo' ? 'off' : h.quarto_id ? 'ok' : 'pend'}`}>
              <b>{h.nome}</b><small>{h.status === 'cancelado' ? 'cancelado' : h.status === 'checkout' ? 'check-out' : h.quarto_codigo || 'sem quarto'}</small>
            </span>
          ))}
        </div>
        {p.obs && <p className="small hs-m0 hs-mt"><b>Obs. do solicitante:</b> {p.obs}</p>}
      </Card>

      <div className="hs-section-row">
        <h3 className="hs-section">Quartos</h3>
        {!encerrado && <Button onClick={novoQuarto} disabled={busy || edit !== null}><Plus size={16} /> Novo quarto</Button>}
      </div>
      <Card className="table-card">
        <table className="table hs-table hs-quartos">
          <thead>
            <tr><th>Quarto</th><th colSpan={2}>Hóspedes</th><th>Hotel</th><th>Check-in</th><th>Check-out</th><th>Diária</th><th>Tipo</th><th>Total</th><th>Ação</th></tr>
          </thead>
          <tbody>
            {p.quartos.map((q) => edit === q.id ? (
              <QuartoEditor key={q.id} api={api} pedido={p} quarto={q} onCancel={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
            ) : (
              <tr key={q.id} className={q.solicitacoes_abertas ? 'hs-row-alerta' : q.situacao === 'alterado' ? 'hs-row-warn' : q.situacao === 'finalizado' ? 'hs-row-off' : ''}>
                <td className="cell-strong">{q.codigo}</td>
                <td colSpan={2}>{q.ocupantes.length ? q.ocupantes.map((o) => o.nome).join(', ') : <span className="muted">—</span>}
                  {q.obs && <div className="muted small">{q.obs}</div>}</td>
                <td>{q.hotel_nome || <span className="muted">—</span>}</td>
                <td>{fmtShort(q.data_in)}</td>
                <td>{fmtShort(q.data_out)}</td>
                <td>{money(q.diaria)}{q.diaria_manual && <div className="muted small">manual</div>}</td>
                <td>{q.tipo}<div><SituacaoBadge s={q.situacao} /></div></td>
                <td>{money(q.total)}<div className="muted small">{q.dias} diária(s)</div></td>
                <td className="row-actions">
                  {!encerrado && (
                    <div className="hs-acts">
                      {(!q.enviado || q.situacao === 'alterado') && <Button className="btn-sm" onClick={() => enviar(q)} disabled={busy}><Send size={13} /> Enviar</Button>}
                      {q.situacao !== 'finalizado' && <button className="icon-btn" title="Editar" onClick={() => setEdit(q.id)} disabled={edit !== null}><Pencil size={15} /></button>}
                      {q.enviado && q.situacao !== 'finalizado' && q.ocupantes.length > 0 && <button className="icon-btn" title="Check-out" onClick={() => setOut(q)}><LogOut size={15} /></button>}
                      <button className="icon-btn danger" title="Apagar" onClick={() => apagar(q)}><Trash2 size={15} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!p.quartos.length && <tr><td colSpan={10} className="muted center">Nenhum quarto. Clique em “Novo quarto” para montar a hospedagem.</td></tr>}
          </tbody>
          {p.quartos.length > 0 && (
            <tfoot><tr><td colSpan={8} className="cell-strong">Total do pedido</td><td className="cell-strong">{money(p.quartos.reduce((s, q) => s + q.total, 0))}</td><td /></tr></tfoot>
          )}
        </table>
      </Card>
      <p className="muted small">Diária herdada do cadastro do hotel conforme a ocupação (simples, duplo, triplo, quádruplo). Hotel de qualquer cidade pode ser usado.</p>

      <Historico itens={p.historico} solicitacoes={p.solicitacoes} />
      {out && <CheckoutDialog api={api} quarto={out} onClose={() => setOut(null)} onDone={() => { setOut(null); load(); }} />}
    </>
  );
}
