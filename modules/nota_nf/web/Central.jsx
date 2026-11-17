import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Check, X, Pencil, Undo2, RotateCcw, AlertTriangle, CheckCircle2, FileSpreadsheet, Download } from 'lucide-react';
import { Alert, Button, Card, Empty, Field, FiltroSelect, Modal, PageHeader, fmtDate, fmtDateTime, norm, uniq, useAction } from '@hub';
import { Alertas, FotoLupa, Lightbox, NFForm, NFResumo, StatusBadge, Totais, dec, int } from './shared.jsx';

const ABAS = [
  { key: 'aguardando', label: 'Aguardando' },
  { key: 'validada', label: 'Validadas' },
  { key: 'recusada', label: 'Recusadas' },
  { key: '', label: 'Todas' },
];
const MOTIVOS = ['Foto ilegível', 'NF duplicada', 'Não é NF de semente de soja', 'Falta página / foto cortada', 'Dados não conferem com a NF', 'Chave de acesso inválida'];

// =========================================================================== lista
function Lista({ module, api }) {
  const navigate = useNavigate();
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('aguardando');
  const [f, setF] = useState({ busca: '', emitente: '', uf: '', de: '', ate: '', alerta: '' });
  const [sel, setSel] = useState([]);
  useEffect(() => { api.get('/central/notas').then(setLista).catch((e) => setErro(e.message)); }, []);

  const all = (lista || []).filter((n) => ['aguardando', 'validada', 'recusada'].includes(n.status));
  const filtro = (n) => (!f.emitente || n.emitente_nome === f.emitente) && (!f.uf || n.uf === f.uf)
    && (!f.de || (n.data_emissao || '') >= f.de) && (!f.ate || (n.data_emissao || '') <= f.ate)
    && (!f.alerta || (f.alerta === 'com' ? n.alertas.length : !n.alertas.length))
    && (!f.busca || norm(`${n.codigo} ${n.numero_nf} ${n.produtor_nome} ${n.produtor_doc} ${n.municipio} ${n.itens.map((i) => i.cultivar).join(' ')}`).includes(norm(f.busca)));
  const filtrados = all.filter(filtro);
  const vis = filtrados.filter((n) => !aba || n.status === aba);
  const t = vis.reduce((a, n) => ({ q: a.q + n.totais.quantidade, s: a.s + n.totais.sementes, v: a.v + n.totais.viaveis, p: a.p + (n.peso_liquido || 0), ha: a.ha + (n.totais.area_potencial || 0), vol: a.vol + (n.totais.volume_potencial || 0) }), { q: 0, s: 0, v: 0, p: 0, ha: 0, vol: 0 });
  const qs = new URLSearchParams({ ...(sel.length ? { ids: sel.join(',') } : { ...(aba ? { status: aba } : {}), ...(f.de ? { de: f.de } : {}), ...(f.ate ? { ate: f.ate } : {}) }) });
  const exportIds = sel.length ? sel : vis.map((n) => n.id);
  const qsVis = new URLSearchParams({ ids: exportIds.join(',') || '0' });
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <PageHeader title="Central de NFs" subtitle="Notas fiscais de semente de soja" back={null}
        actions={<>
          <a className="btn btn-outline" href={`/api/m/${module.key}/central/exportar?${qsVis}`}><FileSpreadsheet size={16} /> Excel {sel.length ? `(${sel.length} selecionadas)` : 'da lista'}</a>
          <a className="btn btn-outline" href={`/api/m/${module.key}/central/zip?${qsVis}`}><Download size={16} /> ZIP com fotos</a>
        </>} />
      <Alert>{erro}</Alert>
      <div className="tabs">
        {ABAS.map((a) => <button key={a.key} className={aba === a.key ? 'active' : ''} onClick={() => { setAba(a.key); setSel([]); }}>{a.label} ({filtrados.filter((n) => !a.key || n.status === a.key).length})</button>)}
      </div>
      <div className="nf-filtros">
        <label className="kit-filtro" style={{ flex: '2 1 240px' }}><span>Buscar</span><input value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} placeholder="Nº NF, produtor, CPF, município, cultivar" /></label>
        <FiltroSelect label="Emitente" value={f.emitente} onChange={(v) => setF({ ...f, emitente: v })} options={uniq(all.map((n) => n.emitente_nome))} />
        <FiltroSelect label="UF" value={f.uf} onChange={(v) => setF({ ...f, uf: v })} options={uniq(all.map((n) => n.uf))} />
        <label className="kit-filtro"><span>Emissão de</span><input type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} /></label>
        <label className="kit-filtro"><span>até</span><input type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} /></label>
        <FiltroSelect label="Alertas" value={f.alerta} onChange={(v) => setF({ ...f, alerta: v })} options={[{ value: 'com', label: 'Com alerta' }, { value: 'sem', label: 'Sem alerta' }]} />
      </div>
      {lista === null ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>Nenhuma NF aqui.</Empty> : (
        <Card className="table-card">
          <table className="table nf-table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={sel.length === vis.length} onChange={(e) => setSel(e.target.checked ? vis.map((n) => n.id) : [])} title="Selecionar para exportar" /></th>
                <th>ID</th><th>Nº NF</th><th>Emissão</th><th>Produtor</th><th>Município</th><th>Distrito</th><th>Emitente</th><th>Cultivar</th>
                <th className="num">Sacos</th><th className="num">Sementes</th><th className="num">Viáveis</th><th className="num">Área (ha)</th><th className="num">Volume (kg)</th><th>Alertas</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vis.map((n) => (
                <tr key={n.id} className="nf-click" onClick={() => navigate(`/m/${module.key}/central/nf/${n.id}`)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.includes(n.id)} onChange={() => toggle(n.id)} /></td>
                  <td className="cell-strong">{n.codigo}</td>
                  <td>{n.numero_nf || '—'}</td>
                  <td>{fmtDate(n.data_emissao)}</td>
                  <td>{n.produtor_nome || '—'}<div className="muted small">{n.produtor_doc_fmt}</div></td>
                  <td>{n.municipio}{n.uf ? ` - ${n.uf}` : ''}</td>
                  <td>{n.distrito || <span className="muted">—</span>}</td>
                  <td className="small">{n.emitente_nome}</td>
                  <td className="small">{uniq(n.itens.filter((i) => i.incluido).map((i) => i.cultivar)).join(', ') || '—'}</td>
                  <td className="num">{dec(n.totais.quantidade)}</td>
                  <td className="num">{int(n.totais.sementes)}</td>
                  <td className="num cell-strong">{int(n.totais.viaveis)}</td>
                  <td className="num">{dec(n.totais.area_potencial)}</td>
                  <td className="num cell-strong">{int(n.totais.volume_potencial)}</td>
                  <td>{n.alertas.length ? <span className={`nf-alerta nf-alerta-${n.alertas.some((a) => a.nivel === 'red') ? 'red' : 'amber'}`}><AlertTriangle size={12} /> {n.alertas.length}</span> : <span className="muted">—</span>}</td>
                  <td><StatusBadge s={n.status} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={9} className="cell-strong">Totais ({vis.length} NF · {dec(t.p)} kg)</td><td className="num cell-strong">{dec(t.q)}</td><td className="num">{int(t.s)}</td><td className="num cell-strong">{int(t.v)}</td><td className="num">{dec(t.ha)}</td><td className="num cell-strong">{int(t.vol)}</td><td colSpan={2} /></tr></tfoot>
          </table>
        </Card>
      )}
    </>
  );
}

// =========================================================================== análise de uma NF
function RecusarDialog({ n, onClose, onConfirm, busy }) {
  const [motivo, setMotivo] = useState(n.duplicados?.length ? 'NF duplicada' : '');
  const [texto, setTexto] = useState('');
  return (
    <Modal title={`Recusar ${n.codigo}`} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Voltar</Button><Button variant="danger" disabled={busy || !(motivo || texto.trim())} onClick={() => onConfirm([motivo, texto.trim()].filter(Boolean).join(' — '))}>Recusar NF</Button></>}>
      <p className="muted small nf-m0">O solicitante verá o motivo e poderá enviar outra foto.</p>
      <div className="nf-motivos">{MOTIVOS.map((m) => <button key={m} type="button" className={`nf-chip ${motivo === m ? 'on' : ''}`} onClick={() => setMotivo(motivo === m ? '' : m)}>{m}</button>)}</div>
      <Field label="Detalhe (opcional)"><textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} /></Field>
    </Modal>
  );
}

function Analise({ module, api }) {
  const { id } = useParams();
  const [n, setN] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [erro, setErro] = useState('');
  const [full, setFull] = useState(false);
  const [editar, setEditar] = useState(false);
  const [recusar, setRecusar] = useState(false);
  const [obs, setObs] = useState('');
  const [run, busy] = useAction();
  const base = `/m/${module.key}/central`;
  const load = () => api.get(`/notas/${id}`).then((x) => { setN(x); setObs(x.obs_central || ''); }).catch((e) => setErro(e.message));
  useEffect(() => { load(); api.get('/config').then(setCfg); }, [id]);

  if (erro) return <><PageHeader title="NF" back={base} /><Alert>{erro}</Alert></>;
  if (!n || !cfg) return <Empty>Carregando…</Empty>;
  const ativa = ['aguardando', 'validada', 'recusada'].includes(n.status);

  const salvar = async (f) => { const r = await run(() => api.patch(`/central/notas/${n.id}`, f), 'Dados salvos'); if (r) { setN(r); setEditar(false); } };
  const validar = async () => { if (await run(() => api.post(`/central/notas/${n.id}/validar`), `${n.codigo} validada`)) load(); };
  const doRecusar = async (motivo) => { if (await run(() => api.post(`/central/notas/${n.id}/recusar`, { motivo }), `${n.codigo} recusada`)) { setRecusar(false); load(); } };
  const reabrir = async () => { if (await run(() => api.post(`/central/notas/${n.id}/reabrir`), 'Voltou para análise')) load(); };
  const salvarObs = async () => { if (await run(() => api.put(`/central/notas/${n.id}/obs`, { obs_central: obs }), 'Observação salva')) load(); };

  return (
    <>
      <PageHeader title="" back={base} />
      <div className="nf-analise">
        <div className="nf-analise-foto">
          <FotoLupa module={module} nota={n} onFull={() => setFull(true)} />
        </div>
        <div className="nf-analise-dados">
          <Card>
            <div className="nf-card-head">
              <h2 className="nf-h2">NF {n.numero_nf || '—'} <StatusBadge s={n.status} /></h2>
              <span className="nf-id">{n.codigo}</span>
            </div>
            <div className="muted small">Enviada por {n.dono_nome} em {fmtDateTime(n.enviado_at)}{n.editado_central ? ' · editada pela central' : ''}{n.ia_status === 'ok' ? ' · lida pela IA' : ''}</div>
            {n.status === 'recusada' && <div className="nf-recusa"><b>Recusada:</b> {n.motivo_recusa}</div>}
            <Alertas itens={n.alertas} ocultar={['duplicada']} />
            <Totais t={n.totais} />
            {ativa && (
              <div className="nf-acoes">
                {n.status === 'aguardando' ? <>
                  <Button onClick={validar} disabled={busy || editar}><Check size={16} /> Validar NF</Button>
                  <Button variant="outline" onClick={() => setRecusar(true)} disabled={busy}><X size={16} /> Recusar</Button>
                </> : <Button variant="outline" onClick={reabrir} disabled={busy}><Undo2 size={15} /> Desfazer análise</Button>}
                {!editar && <Button variant="outline" onClick={() => setEditar(true)} disabled={busy}><Pencil size={15} /> Editar dados</Button>}
              </div>
            )}
          </Card>

          <Card>
            <div className="nf-sec-head"><h4>Conferência no banco</h4><button className="nf-link" onClick={load}><RotateCcw size={13} /> Conferir de novo</button></div>
            {n.duplicados?.length ? (
              <>
                <div className="nf-dup-head">
                  <span className="nf-bad"><AlertTriangle size={15} /> {n.duplicados.length} NF parecida(s) no banco</span>
                  {ativa && n.status !== 'recusada' && <Button variant="danger" className="btn-sm" onClick={() => doRecusar('NF duplicada')} disabled={busy}>Recusar como duplicada</Button>}
                </div>
                {n.duplicados.map((d) => (
                  <div key={d.id} className="nf-dup">
                    <b>{d.motivos.join(' · ')}</b>
                    <span>{d.codigo} · NF {d.numero_nf} · {d.produtor_nome} · {fmtDate(d.data_emissao)} · enviada por {d.dono_nome}</span>
                    <StatusBadge s={d.status} />
                  </div>
                ))}
              </>
            ) : <div className="nf-ok"><CheckCircle2 size={15} /> Nenhuma NF parecida no banco</div>}
          </Card>

          <Card>{editar ? <NFForm nota={n} ufs={cfg.ufs} distritos={cfg.distritos} onSave={salvar} onCancel={() => setEditar(false)} busy={busy} /> : <NFResumo n={n} />}</Card>

          <Card>
            <Field label="Observação da central (o solicitante vê)"><textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
            <div className="nf-acoes"><Button variant="outline" className="btn-sm" onClick={salvarObs} disabled={busy || obs === (n.obs_central || '')}>Salvar observação</Button></div>
          </Card>

          <details className="nf-hist">
            <summary>Histórico ({n.historico.length})</summary>
            {n.historico.map((h) => <div key={h.id} className="small"><span className="muted">{fmtDateTime(h.created_at)}</span> <b>{h.acao}</b>{h.detalhe ? ` · ${h.detalhe}` : ''} <span className="muted">— {h.user_nome}</span></div>)}
          </details>
        </div>
      </div>
      {full && <Lightbox module={module} nota={n} onClose={() => setFull(false)} />}
      {recusar && <RecusarDialog n={n} onClose={() => setRecusar(false)} onConfirm={doRecusar} busy={busy} />}
    </>
  );
}

// =========================================================================== configurações
function Config({ api }) {
  const [cfg, setCfg] = useState(null);
  const [p, setP] = useState({});
  const [run, busy] = useAction();
  const CAMPOS = [
    ['germinacao_padrao', 'Germinação padrão (%)', 'Usada quando a NF não informa a germinação do lote'],
    ['espacamento_m', 'Espaçamento entre linhas (m)', 'Metros lineares por ha = 10.000 ÷ espaçamento'],
    ['sementes_por_metro', 'Sementes por metro linear', 'Faixa de 11 a 15; a planilha usa 13'],
    ['produtividade_sc_ha', 'Produtividade (sc/ha)', 'Volume potencial = área × produtividade × kg por saca'],
    ['kg_por_saca', 'Kg por saca de soja', 'Normalmente 60'],
    ['pms_g', 'Peso de mil sementes (g)', 'Sem sementes por unidade na NF: 1 kg = 1.000.000 ÷ PMS sementes (250 g = 4.000 por kg)'],
  ];
  const carregar = (c) => { setCfg(c); setP(Object.fromEntries(CAMPOS.map(([k]) => [k, String(c[k])]))); };
  useEffect(() => { api.get('/config').then(carregar); }, []);
  if (!cfg) return <Empty>Carregando…</Empty>;
  const sementesHa = (10000 / Number(p.espacamento_m || 1)) * Number(p.sementes_por_metro || 0) * (1 + (1 - Number(p.germinacao_padrao || 0) / 100));
  return (
    <div className="nf-config">
      <PageHeader title="Configurações" subtitle="Regras do Nota NF" back={null} />
      <Card>
        <div className="form-grid">
          {CAMPOS.map(([k, rotulo, dica]) => (
            <Field key={k} label={rotulo} hint={dica}>
              <input inputMode="decimal" value={p[k] ?? ''} onChange={(e) => setP({ ...p, [k]: e.target.value })} style={{ maxWidth: 160 }} />
            </Field>
          ))}
          <p className="small muted nf-m0">Com estes valores: <b>{int(sementesHa)}</b> sementes por hectare (já considerando a germinação padrão). O volume potencial é sempre <b>área × produtividade × kg por saca</b> (hoje 70 × 60).</p>
          <div><Button onClick={async () => { const r = await run(() => api.put('/central/config', p), 'Configuração salva'); if (r) carregar({ ...cfg, ...r }); }} disabled={busy}>Salvar</Button></div>
        </div>
      </Card>
      <Card className="nf-mt">
        <h3 className="nf-h3">Regras de leitura</h3>
        <ul className="small nf-regras">
          <li>Só entram nos totais as linhas de <b>semente de soja</b>. Linhas que não são soja ou são <b>líquidas (LT/litro, inoculantes, defensivos)</b> ficam como “ignoradas”.</li>
          <li><b>Sementes por unidade</b> vem da descrição: “160K” = 160.000; “160.000” = 160.000.</li>
          <li><b>Germinação</b> é procurada na descrição (“GERM 90%”) e nos dados adicionais da NF; sem informação, usa a germinação padrão.</li>
          <li>Chave de acesso conferida pelo dígito verificador e comparada com CNPJ do emitente, número e mês da NF.</li>
          <li><b>Área potencial (ha)</b> = sementes totais ÷ sementes por hectare, onde sementes por hectare = (10.000 ÷ espaçamento) × sementes por metro × (1 + (1 − germinação)). <b>Volume potencial</b> = área × produtividade × kg por saca.</li>
          <li>Sem sementes por unidade na NF: em <b>kg</b> usa 4.000 por kg; em <b>saco/bag</b> usa (peso líquido ÷ nº de sacos) × 4.000 por kg.</li>
          <li>O <b>distrito</b> (Maringá, Londrina, Cornélio Procópio ou Campo Mourão) é escolhido pelo solicitante e é obrigatório para enviar a NF.</li>
        </ul>
      </Card>
      <Card className="nf-mt">
        <h3 className="nf-h3">Leitura automática (IA)</h3>
        {cfg.ia.ativo ? <p className="nf-m0"><CheckCircle2 size={15} className="nf-ok" /> Ativa · provedor <b>{cfg.ia.provedor}</b></p>
          : <p className="nf-m0 muted">Não configurada — os dados são preenchidos manualmente.</p>}
      </Card>
    </div>
  );
}

export default function Central(props) {
  return (
    <Routes>
      <Route index element={<Lista {...props} />} />
      <Route path="nf/:id" element={<Analise {...props} />} />
      <Route path="config" element={<Config {...props} />} />
    </Routes>
  );
}
