import { useEffect, useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { Trash2, Loader2, Send, Info, ChevronDown, ChevronRight, XCircle } from 'lucide-react';
import { Alert, BotoesFoto, Button, Card, Empty, Field, PageHeader, fmtDate, fmtDateTime, useAction, useToast, useConfirm } from '@hub';
import { Alertas, Lightbox, Miniatura, NFForm, NFResumo, StatusBadge, Totais, enviarNF, int, dec } from './shared.jsx';

const somar = (ns) => ns.reduce((t, n) => ({
  itens_soja: t.itens_soja + n.totais.itens_soja, itens_ignorados: t.itens_ignorados + n.totais.itens_ignorados,
  quantidade: t.quantidade + n.totais.quantidade, sementes: t.sementes + n.totais.sementes, viaveis: t.viaveis + n.totais.viaveis,
  area_potencial: t.area_potencial + (n.totais.area_potencial || 0), volume_potencial: t.volume_potencial + (n.totais.volume_potencial || 0),
}), { itens_soja: 0, itens_ignorados: 0, quantidade: 0, sementes: 0, viaveis: 0, area_potencial: 0, volume_potencial: 0 });

/** Cartão de NF em rascunho (edição com salvamento automático). */
function NFRascunho({ module, api, cfg, nota, indice, onChange, onDelete, acao }) {
  const [ver, setVer] = useState(false);
  const salvar = async (f) => onChange(await api.patch(`/notas/${nota.id}`, f));
  return (
    <Card className="nf-card">
      <div className="nf-card-lado">
        <Miniatura module={module} nota={nota} onOpen={() => setVer(true)} size={110} />
        <span className="nf-id">{nota.codigo}</span>
      </div>
      <div className="nf-card-body">
        <div className="nf-card-head">
          <b>NF {indice}{nota.produtor_nome ? ` · ${nota.produtor_nome}` : ''}</b>
          {onDelete && <button className="icon-btn danger" title="Remover NF" onClick={onDelete}><Trash2 size={16} /></button>}
        </div>
        <Alertas itens={nota.alertas} />
        <NFForm nota={nota} ufs={cfg.ufs} distritos={cfg.distritos} autoSave onSave={salvar} />
        <Totais t={nota.totais} compact />
        {acao}
      </div>
      {ver && <Lightbox module={module} nota={nota} onClose={() => setVer(false)} />}
    </Card>
  );
}

// =========================================================================== enviar NFs
function EnviarNF({ module, api }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const [cfg, setCfg] = useState(null);
  const [notas, setNotas] = useState([]);
  const [subindo, setSubindo] = useState([]);

  useEffect(() => { api.get('/config').then(setCfg); api.get('/rascunhos').then(setNotas); }, []);

  const adicionar = async (files) => {
    for (const f of files) {
      const tmp = { k: Math.random(), nome: f.name };
      setSubindo((s) => [...s, tmp]);
      try { const n = await enviarNF(module.key, f); setNotas((ns) => [...ns, n]); }
      catch (e) { toast(e.message, 'erro'); }
      finally { setSubindo((s) => s.filter((x) => x !== tmp)); }
    }
  };
  const remover = async (n) => {
    if (await confirmar({ titulo: `Remover ${n.codigo}?`, mensagem: 'A foto e os dados desta NF saem do envio.', confirmar: 'Remover', perigo: true })
      && await run(() => api.del(`/notas/${n.id}`))) setNotas((ns) => ns.filter((x) => x.id !== n.id));
  };
  const enviar = async () => {
    const r = await run(() => api.post('/enviar', { notas: notas.map((n) => n.id) }), (x) => `${x.enviadas} NF(s) enviada(s) à central`);
    if (r) navigate(`/m/${module.key}/solicitante/minhas`);
  };

  if (!cfg) return <Empty>Carregando…</Empty>;
  const t = somar(notas);
  const comAlerta = notas.filter((n) => n.alertas.length).length;

  return (
    <div className="nf-envio">
      <div className="nf-envio-notas">
        <Card className="nf-captura">
          <BotoesFoto onFiles={adicionar} />
          <p className="muted small">Uma foto (ou PDF) por nota fiscal. {cfg.ia.ativo ? 'Os dados são lidos automaticamente — confira antes de enviar.' : 'Preencha os dados de cada NF.'} Só os itens de <b>semente de soja</b> entram nos totais.</p>
        </Card>
        {!cfg.ia.ativo && !notas.length && <div className="nf-info"><Info size={15} /> Leitura automática por IA ainda não está ligada — os campos são preenchidos manualmente.</div>}
        {notas.map((n, i) => (
          <NFRascunho key={n.id} module={module} api={api} cfg={cfg} nota={n} indice={i + 1}
            onChange={(x) => setNotas((ns) => ns.map((y) => (y.id === x.id ? x : y)))} onDelete={() => remover(n)} />
        ))}
        {subindo.map((s) => <Card key={s.k} className="nf-card nf-loading"><Loader2 size={20} className="nf-spin" /> Enviando {s.nome}{cfg.ia.ativo ? ' e lendo a NF' : ''}…</Card>)}
        {!notas.length && !subindo.length && <Empty>Nenhuma NF ainda. Tire uma foto ou escolha os arquivos acima.</Empty>}
      </div>
      <aside className="nf-envio-lado">
        <Card>
          <h3 className="nf-h3">Resumo do envio</h3>
          <div className="muted small">{notas.length} nota(s) fiscal(is)</div>
          <Totais t={t} />
          {comAlerta > 0 && <div className="nf-warn">{comAlerta} NF(s) com alerta para a central</div>}
          <Button className="nf-full" onClick={enviar} disabled={busy || !notas.length || subindo.length > 0}><Send size={16} /> Enviar para a central</Button>
          <p className="muted small nf-m0">Germinação não informada na NF usa {cfg.germinacao_padrao}%.</p>
        </Card>
      </aside>
    </div>
  );
}

// =========================================================================== minhas NFs
function MinhasNF({ module, api }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [run, busy] = useAction();
  const [lista, setLista] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [aberta, setAberta] = useState(null);
  const [ver, setVer] = useState(null);
  const [sub, setSub] = useState({});
  const [subindo, setSubindo] = useState(null);
  const [erro, setErro] = useState('');

  const load = async () => {
    try {
      const l = await api.get('/minhas');
      setLista(l);
      const subs = {};
      for (const n of l.filter((x) => x.substituta)) subs[n.id] = await api.get(`/notas/${n.substituta}`);
      setSub(subs);
    } catch (e) { setErro(e.message); }
  };
  useEffect(() => { load(); api.get('/config').then(setCfg); }, []);

  const novaFoto = async (n, files) => {
    setSubindo(n.id);
    try { const s = await enviarNF(module.key, files[0], { substitui: n.id }); setSub((x) => ({ ...x, [n.id]: s })); setAberta(n.id); toast('Foto nova recebida. Confira os dados e reenvie.'); }
    catch (e) { toast(e.message, 'erro'); } finally { setSubindo(null); }
  };
  const reenviar = async (s) => { if (await run(() => api.post('/enviar', { notas: [s.id] }), 'NF reenviada à central')) load(); };
  const descartar = async (n, s) => { if (await run(() => api.del(`/notas/${s.id}`))) setSub((x) => { const y = { ...x }; delete y[n.id]; return y; }); };
  const cancelar = async (n) => {
    if (await confirmar({ titulo: `Cancelar o envio da ${n.codigo}?`, mensagem: 'A central deixa de analisar esta NF.', confirmar: 'Cancelar envio', cancelar: 'Voltar', perigo: true })
      && await run(() => api.post(`/notas/${n.id}/cancelar`), 'NF cancelada')) load();
  };

  if (!lista || !cfg) return erro ? <Alert>{erro}</Alert> : <Empty>Carregando…</Empty>;
  const visiveis = lista.filter((n) => n.status !== 'substituida');

  return (
    <>
      <PageHeader title="Minhas NFs" subtitle="Notas fiscais que você enviou" back={null} />
      {!visiveis.length ? <Empty>Você ainda não enviou NFs.</Empty> : (
        <div className="nf-lista">
          {visiveis.map((n) => {
            const s = sub[n.id];
            const open = aberta === n.id;
            return (
              <Card key={n.id} className={`nf-item nf-item-${n.status}`}>
                <button className="nf-item-head" onClick={() => setAberta(open ? null : n.id)}>
                  <Miniatura module={module} nota={n} size={46} onOpen={() => {}} />
                  <div className="nf-item-main">
                    <div><b>NF {n.numero_nf || '—'}</b> · {n.produtor_nome || 'produtor?'} <StatusBadge s={n.status} /> <span className="nf-id">{n.codigo}</span></div>
                    <div className="muted small">{n.emitente_nome} · emissão {fmtDate(n.data_emissao)} · enviada {fmtDateTime(n.enviado_at)}</div>
                  </div>
                  <div className="nf-item-num"><span className="muted small">Sacos</span><b>{dec(n.totais.quantidade)}</b></div>
                  <div className="nf-item-num"><span className="muted small">Sementes viáveis</span><b>{int(n.totais.viaveis)}</b></div>
                  {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                {n.status === 'recusada' && (
                  <div className="nf-recusa"><b>Recusada:</b> {n.motivo_recusa}
                    {!s && (subindo === n.id ? <div className="small"><Loader2 size={14} className="nf-spin" /> Enviando…</div>
                      : <div className="nf-recusa-acoes"><span className="small">Envie outra foto desta NF:</span><BotoesFoto compact multiple={false} onFiles={(f) => novaFoto(n, f)} /></div>)}
                  </div>
                )}
                {n.obs_central && <div className="nf-obs"><b>Central:</b> {n.obs_central}</div>}
                {open && (
                  <div className="nf-item-body">
                    <button className="nf-link" onClick={() => setVer(n)}>Ver foto da NF</button>
                    <NFResumo n={n} />
                    {n.status === 'aguardando' && <div className="nf-acoes"><Button variant="danger" className="btn-sm" onClick={() => cancelar(n)} disabled={busy}><XCircle size={14} /> Cancelar envio</Button></div>}
                  </div>
                )}
                {s && (
                  <div className="nf-sub">
                    <div className="nf-sub-label">Nova foto para {n.codigo}</div>
                    <NFRascunho module={module} api={api} cfg={cfg} nota={s} indice="nova" onChange={(x) => setSub((y) => ({ ...y, [n.id]: x }))}
                      onDelete={() => descartar(n, s)}
                      acao={<div className="nf-acoes nf-right"><Button onClick={() => reenviar(s)} disabled={busy}><Send size={15} /> Reenviar NF</Button></div>} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {ver && <Lightbox module={module} nota={ver} onClose={() => setVer(null)} />}
    </>
  );
}

export default function Solicitante(props) {
  return (
    <Routes>
      <Route index element={<EnviarNF {...props} />} />
      <Route path="minhas" element={<MinhasNF {...props} />} />
    </Routes>
  );
}
