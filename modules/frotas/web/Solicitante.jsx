import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Plus, Send, Save, Trash2, Camera, Wrench, RefreshCw, UserRoundCog, FileX2, CheckCircle2, X, History } from 'lucide-react';
import { Button, Card, Empty, Field, FiltroSelect, Modal, PageHeader, fmtDate, fmtDateTime, todayISO, useAction, useConfirm, useToast } from '@hub';
import { ChamadoDialog, Colaboradores, FotosCarro, Opcoes, Status, TipoChamado, TrocaForm, km, useConfig, veic } from './shared.jsx';

const EDITAVEL = (p) => ['rascunho', 'reprovado'].includes(p.status);
const CHIPS = [
  { k: '', label: 'Total', f: () => true },
  { k: 'rascunho', label: 'Rascunho', f: (p) => p.status === 'rascunho' },
  { k: 'enviadas', label: 'Enviadas', f: (p) => ['solicitado', 'aprovado'].includes(p.status) },
  { k: 'reprovado', label: 'Reprovadas', f: (p) => p.status === 'reprovado' },
  { k: 'reservado', label: 'Reservados', f: (p) => p.status === 'reservado' },
  { k: 'em_uso', label: 'Em uso', f: (p) => p.status === 'em_uso' },
  { k: 'encerrado', label: 'Encerrados', f: (p) => p.status === 'encerrado' },
];

// =========================================================================== nova solicitação (lote)
function NovaDialog({ api, cfg, onClose, onDone }) {
  const [f, setF] = useState({ qtd: '1', data_retirada: '', local: '', categoria: '', motivo: '', motorista: '' });
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const salvar = async (enviar) => {
    setErro('');
    const q = Number(f.qtd);
    if (!/^\d+$/.test(f.qtd) || q < 1 || q > 30) return setErro('Quantidade inválida: digite apenas um número de 1 a 30.');
    setBusy(true);
    try {
      const r = await api.post('/meus/pedidos', { ...f, qtd: q, enviar });
      toast(enviar ? `${r.enviados} pedido(s) enviado(s) para a central` : `${r.criados} rascunho(s) criado(s)`);
      window.dispatchEvent(new Event('qh:atualizar'));
      onDone();
    } catch (e) { setErro(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Solicitação de veículos" onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button variant="outline" onClick={() => salvar(false)} disabled={busy}><Save size={15} /> Salvar rascunho</Button>
        <Button onClick={() => salvar(true)} disabled={busy}><Send size={15} /> Enviar</Button>
      </>}>
      {erro && <div className="alert alert-error">{erro}</div>}
      <div className="fr-grid2">
        <Field label="Quantidade de veículos *" hint="De 1 a 30 — cria uma linha por veículo">
          <input inputMode="numeric" value={f.qtd} onChange={(e) => setF({ ...f, qtd: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
        </Field>
        <Field label="Data de retirada *"><input type="date" min={todayISO()} value={f.data_retirada} onChange={set('data_retirada')} /></Field>
        <Field label="Local de retirada *"><select value={f.local} onChange={set('local')}><Opcoes lista={cfg.locais} /></select></Field>
        <Field label="Categoria do veículo *"><select value={f.categoria} onChange={set('categoria')}><Opcoes lista={cfg.categorias} /></select></Field>
      </div>
      <Field label="Motorista" hint="Pode deixar em branco e informar depois">
        <input list="fr-colab-novo" value={f.motorista} onChange={set('motorista')} placeholder="Nome do colaborador" />
      </Field>
      <Colaboradores id="fr-colab-novo" lista={cfg.colaboradores} />
      <Field label="Motivo da solicitação"><textarea rows={3} value={f.motivo} onChange={set('motivo')} /></Field>
    </Modal>
  );
}

// =========================================================================== meus pedidos
function Linha({ p, cfg, api, onChange }) {
  const [e, setE] = useState(null); // edição local
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const v = { ...p, ...(e || {}) };
  const set = (k) => (ev) => setE({ ...(e || {}), [k]: ev.target.value });
  const editavel = EDITAVEL(p);
  const salvar = async () => { if (await run(() => api.put(`/meus/pedidos/${p.id}`, e), 'Linha salva')) { setE(null); onChange(); } };
  const enviar = async () => {
    const ok = await run(async () => { if (e) await api.put(`/meus/pedidos/${p.id}`, e); return api.post(`/meus/pedidos/${p.id}/enviar`); }, 'Solicitação enviada');
    if (ok) { setE(null); onChange(); }
  };
  const excluir = async () => {
    if (await confirmar({ titulo: `Excluir ${p.codigo}?`, mensagem: 'A linha será removida. Não pode ser desfeito.', confirmar: 'Excluir', perigo: true })
      && await run(() => api.del(`/meus/pedidos/${p.id}`), 'Linha excluída')) onChange();
  };
  const completo = v.data_retirada && v.local && v.categoria;
  return (
    <tr className={e ? 'fr-sujo' : ''}>
      <td className="fr-mono">{p.codigo}<div className="small muted">{fmtDate(p.created_at)}</div></td>
      <td>{editavel ? <input type="date" value={v.data_retirada || ''} onChange={set('data_retirada')} /> : fmtDate(p.data_retirada)}</td>
      <td>{editavel ? <select value={v.local || ''} onChange={set('local')}><Opcoes lista={cfg.locais} /></select> : p.local}</td>
      <td>{editavel ? <select value={v.categoria || ''} onChange={set('categoria')}><Opcoes lista={cfg.categorias} /></select> : p.categoria}</td>
      <td className="fr-motivo">{editavel ? <input value={v.motivo || ''} onChange={set('motivo')} /> : (p.motivo || '—')}</td>
      <td>{editavel ? <input list="fr-colab-lin" value={v.motorista || ''} onChange={set('motorista')} placeholder="—" /> : (p.motorista || '—')}</td>
      <td>
        <Status s={p.status} label={p.status_label} />
        {p.status === 'reprovado' && p.resposta && <div className="small fr-resp">{p.resposta}</div>}
      </td>
      <td className="fr-acts">
        {editavel && <Button className="btn-sm" variant="outline" onClick={salvar} disabled={busy || !e}><Save size={14} /> Salvar</Button>}
        {editavel && <Button className="btn-sm" onClick={enviar} disabled={busy || !completo}><Send size={14} /> Enviar</Button>}
        {['rascunho', 'solicitado', 'reprovado'].includes(p.status) && <button className="fr-x" onClick={excluir} disabled={busy} title="Excluir"><Trash2 size={15} /></button>}
      </td>
    </tr>
  );
}

function MeusPedidos({ api }) {
  const cfg = useConfig(api);
  const [lista, setLista] = useState(null);
  const [chip, setChip] = useState('');
  const [local, setLocal] = useState('');
  const [nova, setNova] = useState(false);
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const load = () => api.get('/meus/pedidos').then(setLista);
  useEffect(() => { load(); }, []);

  const all = lista || [];
  const prontos = all.filter((p) => p.status === 'rascunho' && p.completo).length;
  const reprovados = all.filter((p) => p.status === 'reprovado').length;
  const filtro = CHIPS.find((c) => c.k === chip).f;
  const vis = all.filter((p) => filtro(p) && (!local || p.local === local));
  const enviarTudo = async () => {
    if (await confirmar({ titulo: `Enviar ${prontos} solicitação(ões)?`, mensagem: 'Todos os rascunhos completos (data, local e categoria) vão para a central aprovar.', confirmar: 'Enviar tudo' })
      && await run(() => api.post('/meus/pedidos/enviar-todos'), (r) => `${r.enviados} solicitação(ões) enviada(s)`)) load();
  };
  const excluirReprovadas = async () => {
    if (await confirmar({ titulo: 'Excluir reprovadas?', mensagem: `Você está prestes a excluir ${reprovados} solicitação(ões) reprovada(s). Esta ação não pode ser desfeita.`, confirmar: 'Excluir', perigo: true })
      && await run(() => api.del('/meus/pedidos/reprovados'), (r) => `${r.excluidos} excluída(s)`)) load();
  };

  return (
    <>
      <PageHeader title="Meus pedidos de veículo" subtitle="Monte as linhas, salve como rascunho e envie para a central aprovar." back="/"
        actions={<>
          <Button onClick={() => setNova(true)} disabled={!cfg}><Plus size={16} /> Nova solicitação</Button>
          <Button variant="outline" onClick={enviarTudo} disabled={busy || !prontos}><Send size={15} /> Enviar tudo{prontos ? ` (${prontos})` : ''}</Button>
          <Button variant="outline" onClick={excluirReprovadas} disabled={busy || !reprovados}><Trash2 size={15} /> Reprovadas</Button>
        </>} />
      <div className="fr-barra">
        <div className="fr-chips">
          {CHIPS.map((c) => (
            <button key={c.k} className={`fr-chip ${chip === c.k ? 'on' : ''}`} onClick={() => setChip(c.k)}>{c.label} <b>{all.filter(c.f).length}</b></button>
          ))}
        </div>
        <FiltroSelect label="Local" value={local} onChange={setLocal} options={cfg?.locais || []} />
      </div>
      <Card className="fr-card-tabela">
        {lista === null || !cfg ? <Empty>Carregando…</Empty> : !vis.length ? (
          <Empty>{all.length ? 'Nenhum pedido com esses filtros.' : 'Você ainda não pediu veículos. Clique em "Nova solicitação".'}</Empty>
        ) : (
          <div className="fr-scroll">
            <table className="table fr-table">
              <thead><tr><th>Pedido</th><th>Data de retirada</th><th>Local de retirada</th><th>Categoria</th><th>Motivo</th><th>Motorista</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>{vis.map((p) => <Linha key={`${p.id}-${p.updated_at}`} p={p} cfg={cfg} api={api} onChange={load} />)}</tbody>
            </table>
            <Colaboradores id="fr-colab-lin" lista={cfg.colaboradores} />
          </div>
        )}
      </Card>
      {nova && <NovaDialog api={api} cfg={cfg} onClose={() => setNova(false)} onDone={() => { setNova(false); setChip(''); load(); }} />}
    </>
  );
}

// =========================================================================== meus veículos (ativos)
function FinalizarDialog({ api, v, onClose, onDone }) {
  const c = v.chamado;
  const [f, setF] = useState({ km_devolucao: c.km_devolucao ?? '', data_devolucao: c.data_servico || c.data_devolucao || todayISO(), data_inicio: c.data_servico || todayISO() });
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirmar = useConfirm();
  const set = (k, val) => setF((x) => ({ ...x, [k]: val }));
  const naoPermitida = c.tipo === 'encerramento' && c.placa_devolucao && c.placa_devolucao !== v.placa;
  const finalizar = async () => {
    setBusy(true); setErro('');
    try {
      const r = await api.post(`/meus/chamados/${c.id}/finalizar`, f);
      toast(r.resultado, r.aviso ? 'erro' : 'ok');
      window.dispatchEvent(new Event('qh:atualizar'));
      onDone();
    } catch (e) { setErro(e.message); } finally { setBusy(false); }
  };
  const cancelar = async () => {
    if (!await confirmar({ titulo: 'Cancelar a solicitação?', mensagem: `O chamado de ${c.tipo_label.toLowerCase()} será cancelado.`, confirmar: 'Cancelar solicitação', cancelar: 'Voltar', perigo: true })) return;
    setBusy(true);
    try { await api.post(`/meus/chamados/${c.id}/cancelar`); toast('Solicitação cancelada'); onDone(); } catch (e) { setErro(e.message); } finally { setBusy(false); }
  };
  const titulo = { manutencao: 'Finalizar manutenção', troca: 'Registrar a troca de veículo', substituicao: 'Confirmar substituição de condutor', encerramento: naoPermitida ? 'Devolução não permitida!' : 'Confirmar devolução do veículo' }[c.tipo];
  return (
    <Modal title={c.status === 'reprovado' ? 'Chamado reprovado' : titulo} onClose={onClose}
      footer={<>
        {c.status === 'agendado' && c.tipo === 'substituicao' && <Button variant="outline" onClick={cancelar} disabled={busy}>Cancelar substituição</Button>}
        <Button variant="outline" onClick={onClose}>Voltar</Button>
        <Button className={naoPermitida ? 'btn-perigo' : ''} onClick={finalizar} disabled={busy}>
          {c.status === 'reprovado' ? 'Ciente' : naoPermitida ? 'Encerrar chamado' : c.tipo === 'encerramento' ? 'Confirmar devolução' : c.tipo === 'troca' ? 'Confirmar troca' : 'Finalizar'}
        </Button>
      </>}>
      {erro && <div className="alert alert-error">{erro}</div>}
      <p className="small muted fr-m0">{veic(v)} · {c.codigo}</p>
      {c.status === 'reprovado' && <p>A central reprovou o pedido de <b>{c.tipo_label.toLowerCase()}</b>.{c.resposta && <><br />Motivo: {c.resposta}</>}</p>}
      {c.status === 'agendado' && c.tipo === 'manutencao' && <p>Manutenção ({c.tipo_manutencao}) agendada em <b>{c.local_servico}</b> no dia <b>{fmtDate(c.data_servico)}</b>{c.hora_servico ? ` às ${c.hora_servico}` : ''}. Confirme que o serviço foi feito.</p>}
      {c.status === 'agendado' && c.tipo === 'substituicao' && <p>Novo condutor: <b>{c.condutor_novo}</b>, a partir de <b>{fmtDate(c.data_inicio_nova)}</b>.<br />{v.motorista} sai em {fmtDate(c.data_saida_condutor)}. Faça a passagem do veículo e confirme.</p>}
      {c.status === 'agendado' && c.tipo === 'encerramento' && (naoPermitida
        ? <div className="alert alert-error">Por motivos administrativos devolva o outro veículo.<br />Placa indicada para devolução: <b>{c.placa_devolucao}</b>. Este chamado será encerrado.</div>
        : <>
          <p>Local de devolução: <b>{c.local_servico}</b> · {fmtDate(c.data_servico)}</p>
          <div className="fr-grid2">
            <Field label="Km de devolução" hint={`Retirada com ${km(v.km_retirada)} km`}><input inputMode="numeric" value={f.km_devolucao} onChange={(e) => set('km_devolucao', e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label="Data da devolução"><input type="date" value={f.data_devolucao} onChange={(e) => set('data_devolucao', e.target.value)} /></Field>
          </div>
        </>)}
      {c.status === 'agendado' && c.tipo === 'troca' && (
        <>
          <p className="small">Troca agendada em <b>{c.local_servico}</b> · {fmtDate(c.data_servico)}. Informe os dados do veículo devolvido e do novo.</p>
          <TrocaForm v={v} f={f} set={set} />
        </>
      )}
    </Modal>
  );
}

const ACOES = [
  { tipo: 'troca', label: 'Trocar', icon: RefreshCw },
  { tipo: 'substituicao', label: 'Substituir condutor', icon: UserRoundCog },
  { tipo: 'manutencao', label: 'Manutenção', icon: Wrench },
  { tipo: 'encerramento', label: 'Encerrar', icon: FileX2 },
];

function MeusVeiculos({ api }) {
  const cfg = useConfig(api);
  const [lista, setLista] = useState(null);
  const [chamados, setChamados] = useState([]);
  const [abrir, setAbrir] = useState(null);   // { v, tipo }
  const [fim, setFim] = useState(null);       // veículo com chamado para finalizar
  const [fotos, setFotos] = useState(null);
  const [hist, setHist] = useState(false);
  const confirmar = useConfirm();
  const [run] = useAction();
  const load = () => { api.get('/meus/veiculos').then(setLista); api.get('/meus/chamados').then(setChamados); };
  useEffect(() => { load(); }, []);

  const emUso = (lista || []).filter((v) => v.status === 'em_uso');
  const reservados = (lista || []).filter((v) => v.status === 'reservado');
  const cancelar = async (v) => {
    if (await confirmar({ titulo: 'Cancelar a solicitação?', mensagem: `O chamado de ${v.chamado.tipo_label.toLowerCase()} ainda não foi analisado e será cancelado.`, confirmar: 'Cancelar solicitação', cancelar: 'Voltar', perigo: true })
      && await run(() => api.post(`/meus/chamados/${v.chamado.id}/cancelar`), 'Solicitação cancelada')) load();
  };

  return (
    <>
      <PageHeader title="Meus veículos" subtitle="Veículos em uso dos seus pedidos: peça troca, manutenção, substituição de condutor ou encerramento." back="/"
        actions={<Button variant="outline" onClick={() => setHist(true)}><History size={15} /> Meus chamados</Button>} />
      <div className="fr-barra">
        <div className="fr-chips">
          <span className="fr-chip on">Veículos ativos <b>{emUso.length}</b></span>
          <span className="fr-chip">Solicitações pendentes <b>{emUso.filter((v) => v.chamado).length}</b></span>
          {reservados.length > 0 && <span className="fr-chip">Reservados <b>{reservados.length}</b></span>}
        </div>
      </div>
      {lista === null || !cfg ? <Empty>Carregando…</Empty> : !lista.length ? <Card><Empty>Nenhum veículo em uso no seu nome.</Empty></Card> : (
        <div className="fr-cards">
          {[...emUso, ...reservados].map((v) => (
            <Card key={v.id} className={`fr-vcard ${v.chamado ? 'com-chamado' : ''}`}>
              <div className="fr-vcard-top">
                <div>
                  <div className="fr-placa">{v.placa || 'Sem placa'}</div>
                  <b>{v.modelo || v.categoria}</b>
                  <div className="small muted">Reserva {v.codigo_reserva} · {v.local} · categoria {v.categoria}</div>
                </div>
                <Status s={v.status} label={v.status_label} />
              </div>
              <div className="fr-vdados">
                <span><small>Motorista</small>{v.motorista || '—'}</span>
                <span><small>Início do contrato</small>{fmtDate(v.inicio_contrato)}</span>
                <span><small>Retirada</small>{fmtDate(v.data_retirada)}</span>
                <span><small>Km retirada</small>{km(v.km_retirada)}</span>
                <span><small>Modalidade</small>{v.modalidade || '—'}</span>
                <span><small>Fotos</small>{v.fotos_angulos}/{v.fotos_total}</span>
              </div>
              {v.status === 'reservado' && <div className="fr-aviso">Reservado — aguardando a central ativar o veículo com placa e motorista.</div>}
              {v.chamado && (
                <div className={`fr-aviso fr-aviso-${v.chamado.status}`}>
                  <TipoChamado c={v.chamado} /> <span>{v.situacao}</span>
                </div>
              )}
              {v.status === 'em_uso' && (
                <div className="fr-vacoes">
                  {ACOES.map(({ tipo, label, icon: I }) => (
                    <Button key={tipo} variant="outline" className="btn-sm" disabled={!!v.chamado} onClick={() => setAbrir({ v, tipo })}><I size={14} /> {label}</Button>
                  ))}
                  <Button variant="outline" className="btn-sm" onClick={() => setFotos(v)}><Camera size={14} /> Fotos</Button>
                  {v.chamado && ['agendado', 'reprovado'].includes(v.chamado.status) && (
                    <Button className="btn-sm" onClick={() => setFim(v)}><CheckCircle2 size={14} /> Finalizar</Button>
                  )}
                  {v.chamado?.status === 'pendente' && <Button variant="outline" className="btn-sm" onClick={() => cancelar(v)}><X size={14} /> Cancelar pedido</Button>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {abrir && <ChamadoDialog api={api} veiculo={abrir.v} tipo={abrir.tipo} cfg={cfg} onClose={() => setAbrir(null)} onDone={() => { setAbrir(null); load(); }} />}
      {fim && <FinalizarDialog api={api} v={fim} onClose={() => setFim(null)} onDone={() => { setFim(null); load(); }} />}
      {fotos && <FotosCarro veiculo={fotos} onClose={() => setFotos(null)} onChange={load} />}
      {hist && (
        <Modal title="Meus chamados" onClose={() => setHist(false)} wide>
          {!chamados.length ? <Empty>Nenhum chamado ainda.</Empty> : (
            <div className="fr-scroll">
              <table className="table fr-table">
                <thead><tr><th>Chamado</th><th>Tipo</th><th>Veículo</th><th>Aberto em</th><th>Status</th><th>Resultado</th></tr></thead>
                <tbody>
                  {chamados.map((c) => (
                    <tr key={c.id}>
                      <td className="fr-mono">{c.codigo}</td><td><TipoChamado c={c} /></td><td>{[c.modelo, c.placa].filter(Boolean).join(' · ')}</td>
                      <td className="small">{fmtDateTime(c.created_at)}</td><td><Status s={c.status} label={c.status_label} /></td>
                      <td className="small">{c.resultado || c.resposta || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

export default function Solicitante(props) {
  return (
    <Routes>
      <Route index element={<MeusPedidos {...props} />} />
      <Route path="veiculos" element={<MeusVeiculos {...props} />} />
    </Routes>
  );
}
