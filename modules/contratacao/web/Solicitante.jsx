import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Plus, Send, Trash2, XCircle, Pencil, Users } from 'lucide-react';
import {
  Alert, Badge, Button, Card, CidadeInput, Empty, Field, FiltroSelect, PageHeader, cidadeOficial, fmtDate, norm, todayISO, uniq, useAction, useConfirm,
} from '@hub';
import { DemissaoDialog, Mobilidade, StatusBadge, local, quando, sim } from './shared.jsx';

// =========================================================================== meus pedidos
function MeusPedidos({ module, api }) {
  const base = `/m/${module.key}/solicitante`;
  const navigate = useNavigate();
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [f, setF] = useState({ semana: '', distrito: '', funcao: '', mob: '', status: '' });
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const load = () => api.get('/meus').then(setLista).catch((e) => setErro(e.message));
  useEffect(() => { load(); }, []);

  const all = lista || [];
  const vis = all.filter((p) => (!f.semana || String(p.semana) === f.semana) && (!f.distrito || p.distrito === f.distrito) && (!f.funcao || p.funcao === f.funcao)
    && (!f.mob || (f.mob === 'MÓVEL') === p.movel) && (!f.status || p.status === f.status));

  const cancelar = async (p) => {
    if (await confirmar({ titulo: `Cancelar o pedido ${p.codigo}?`, mensagem: 'O RH deixa de trabalhar nesta vaga.', confirmar: 'Cancelar pedido', cancelar: 'Voltar', perigo: true })
      && await run(() => api.post(`/meus/${p.id}/cancelar`), 'Pedido cancelado')) load();
  };
  const excluir = async (p) => {
    if (await confirmar({ titulo: `Excluir ${p.codigo}?`, mensagem: 'Não pode ser desfeito.', confirmar: 'Excluir', perigo: true })
      && await run(() => api.del(`/meus/${p.id}`), `${p.codigo} excluído`)) load();
  };

  return (
    <>
      <PageHeader title="Meus pedidos" subtitle="Vagas que você solicitou" back={null}
        actions={<Button onClick={() => navigate(`${base}/novo`)}><Plus size={16} /> Nova solicitação</Button>} />
      <Alert>{erro}</Alert>
      <div className="ct-filtros">
        <FiltroSelect label="Semana" value={f.semana} onChange={(v) => setF({ ...f, semana: v })} options={uniq(all.map((p) => String(p.semana))).sort((a, b) => a - b).map((s) => ({ value: s, label: `S${s}` }))} />
        <FiltroSelect label="Distrito" value={f.distrito} onChange={(v) => setF({ ...f, distrito: v })} options={uniq(all.map((p) => p.distrito))} />
        <FiltroSelect label="Função" value={f.funcao} onChange={(v) => setF({ ...f, funcao: v })} options={uniq(all.map((p) => p.funcao))} />
        <FiltroSelect label="Mobilidade" value={f.mob} onChange={(v) => setF({ ...f, mob: v })} options={['LOCAL', 'MÓVEL']} />
        <FiltroSelect label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={uniq(all.map((p) => p.status)).map((s) => ({ value: s, label: all.find((p) => p.status === s).status_label }))} />
      </div>
      {lista === null ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>Nenhum pedido. Clique em “Nova solicitação”.</Empty> : (
        <Card className="table-card">
          <table className="table ct-table">
            <thead><tr><th>ID</th><th>Para quando</th><th>Distrito / cidade</th><th>Função</th><th>Sol/At</th><th>Mobilidade</th><th>Status</th><th>Observação</th><th /></tr></thead>
            <tbody>
              {vis.map((p) => (
                <tr key={p.id}>
                  <td className="cell-strong">{p.codigo}</td>
                  <td>{quando(p)}</td>
                  <td>{local(p)}</td>
                  <td>{p.funcao}</td>
                  <td className={p.qtd_atendida < p.qtd ? 'ct-pend' : 'ct-ok'}>{p.qtd}/{p.qtd_atendida}</td>
                  <td><Mobilidade v={p.movel} /></td>
                  <td><StatusBadge p={p} /></td>
                  <td className="small ct-obs">{p.observacao || '—'}</td>
                  <td className="row-actions">
                    <div className="ct-acts">
                      {p.status === 'rascunho'
                        ? <Button className="btn-sm" onClick={() => navigate(`${base}/editar/${p.id}`)}><Pencil size={13} /> Continuar</Button>
                        : <Button className="btn-sm" onClick={() => navigate(`${base}/grupo/${p.id}`)}><Users size={13} /> Ver grupo</Button>}
                      {p.status === 'pendente' && <Button variant="danger" className="btn-sm" onClick={() => cancelar(p)} disabled={busy}>Cancelar</Button>}
                      {['rascunho', 'cancelado'].includes(p.status) && <button className="icon-btn danger" title="Excluir" onClick={() => excluir(p)}><Trash2 size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

// =========================================================================== meus colaboradores (todas as pessoas anexadas)
const situacaoPessoa = (a) => (a.demissao_pendente ? 'Demissão em análise' : 'Anexado');

/** Tabela de pessoas anexadas. comVaga = mostra a coluna do ID da vaga (lista geral). */
function TabelaPessoas({ linhas, comVaga, onDemissao, onVaga }) {
  return (
    <Card className="table-card">
      <table className="table ct-table">
        <thead><tr>{comVaga && <th>ID vaga</th>}<th>Pessoa</th><th>E-mail</th><th>Função</th><th>Mobilidade</th><th>CNH</th><th>Dt contratação</th><th>Status</th><th /></tr></thead>
        <tbody>
          {linhas.map(({ a, p }) => (
            <tr key={a.anexo_id}>
              {comVaga && <td className="cell-strong"><button className="ct-link" onClick={() => onVaga(p)}>{p.codigo}</button></td>}
              <td className="cell-strong">{a.nome}</td><td>{a.email || '—'}</td><td>{a.funcao || '—'}</td><td><Mobilidade v={a.movel} /></td>
              <td>{sim(a.cnh)}</td><td>{fmtDate(a.data_vinc)}</td>
              <td>{a.demissao_pendente ? <span className="ct-pst ct-pst-demitido">Demissão em análise</span> : <span className="ct-pst ct-pst-anexado">Anexado</span>}</td>
              <td className="row-actions">{!a.demissao_pendente && <Button variant="danger" className="btn-sm" onClick={() => onDemissao(a)}>Pedir demissão</Button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Anexados({ module, api }) {
  const navigate = useNavigate();
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [dem, setDem] = useState(null);
  const [f, setF] = useState({ vaga: '', nome: '', funcao: '', mob: '', cnh: '', data: '', status: '' });
  const load = () => api.get('/meus').then(setLista).catch((e) => setErro(e.message));
  useEffect(() => { load(); }, []);

  const todas = useMemo(() => (lista || []).flatMap((p) => (p.anexos || []).map((a) => ({ a, p }))), [lista]);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const vis = todas.filter(({ a, p }) => (!f.vaga || p.codigo === f.vaga) && (!f.nome || norm(`${a.nome} ${a.email || ''}`).includes(norm(f.nome)))
    && (!f.funcao || a.funcao === f.funcao) && (!f.mob || (f.mob === 'MÓVEL') === !!a.movel) && (!f.cnh || sim(a.cnh) === f.cnh)
    && (!f.data || a.data_vinc === f.data) && (!f.status || situacaoPessoa(a) === f.status));

  return (
    <>
      <PageHeader title="Meus Colaboradores" subtitle="Pessoas que o RH colocou nas suas vagas" back={null} />
      <Alert>{erro}</Alert>
      <div className="ct-filtros">
        <label className="kit-filtro"><span>Pessoa</span><input value={f.nome} onChange={(e) => set('nome')(e.target.value)} placeholder="Nome ou e-mail" /></label>
        <FiltroSelect label="ID vaga" value={f.vaga} onChange={set('vaga')} options={uniq(todas.map(({ p }) => p.codigo))} />
        <FiltroSelect label="Função" value={f.funcao} onChange={set('funcao')} options={uniq(todas.map(({ a }) => a.funcao).filter(Boolean))} />
        <FiltroSelect label="Mobilidade" value={f.mob} onChange={set('mob')} options={['LOCAL', 'MÓVEL']} />
        <FiltroSelect label="CNH" value={f.cnh} onChange={set('cnh')} options={['Sim', 'Não']} />
        <FiltroSelect label="Dt contratação" value={f.data} onChange={set('data')}
          options={uniq(todas.map(({ a }) => a.data_vinc).filter(Boolean)).sort().reverse().map((d) => ({ value: d, label: fmtDate(d) }))} />
        <FiltroSelect label="Status" value={f.status} onChange={set('status')} options={uniq(todas.map(({ a }) => situacaoPessoa(a)))} />
      </div>
      {lista === null ? <Empty>Carregando…</Empty> : !todas.length ? <Empty>Ainda não há pessoas anexadas nas suas vagas.</Empty>
        : !vis.length ? <Empty>Ninguém com esses filtros.</Empty> : (
          <TabelaPessoas linhas={vis} comVaga onDemissao={setDem} onVaga={(p) => navigate(`/m/${module.key}/solicitante/grupo/${p.id}`)} />
        )}
      {dem && <DemissaoDialog api={api} pessoa={dem} onClose={() => setDem(null)} onDone={() => { setDem(null); load(); }} />}
    </>
  );
}

// =========================================================================== grupo de um pedido
function Grupo({ module, api }) {
  const { id } = useParams();
  const [lista, setLista] = useState(null);
  const [dem, setDem] = useState(null);
  const load = () => api.get('/meus').then(setLista);
  useEffect(() => { load(); }, []);
  const p = (lista || []).find((x) => String(x.id) === id);
  if (!lista) return <Empty>Carregando…</Empty>;
  if (!p) return <><PageHeader title="Grupo" back={`/m/${module.key}/solicitante`} /><Alert>Pedido não encontrado.</Alert></>;
  return (
    <>
      <PageHeader title={`Grupo · ${p.codigo}`} back={`/m/${module.key}/solicitante`}
        subtitle={`${p.funcao} · ${local(p)} · início ${fmtDate(p.data_desejada)} (S${p.semana}) · ${p.projeto}`}
        actions={<div className="tags"><StatusBadge p={p} /><Badge tone="neutral">{p.qtd_atendida} de {p.qtd}</Badge></div>} />
      {p.observacao && <Card className="ct-mb"><span className="muted small">Observação do pedido: </span>{p.observacao}</Card>}
      {!p.anexos.length ? <Empty>O RH ainda não anexou pessoas a esta vaga.</Empty>
        : <TabelaPessoas linhas={p.anexos.map((a) => ({ a, p }))} onDemissao={setDem} />}
      {dem && <DemissaoDialog api={api} pessoa={dem} onClose={() => setDem(null)} onDone={() => { setDem(null); load(); }} />}
    </>
  );
}

// =========================================================================== formulário
function Formulario({ module, api }) {
  const { id } = useParams();
  const base = `/m/${module.key}/solicitante`;
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [f, setF] = useState({ projeto: '', funcao: '', cidade: '', uf: 'PR', data_desejada: todayISO(), observacao: '', experiencia: false, cnh: false, movel: false, qtd: 1 });
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.get('/config').then((c) => { setCfg(c); setF((x) => ({ ...x, projeto: x.projeto || c.projetos[0], funcao: x.funcao || c.funcoes[0] })); });
    if (id) api.get('/meus').then((l) => {
      const p = l.find((x) => String(x.id) === id);
      if (p) setF({ projeto: p.projeto, funcao: p.funcao, cidade: p.cidade || '', uf: p.uf, data_desejada: p.data_desejada, observacao: p.observacao || '', experiencia: p.experiencia, cnh: p.cnh, movel: p.movel, qtd: p.qtd });
    });
  }, [id]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const salvar = async (rascunho) => {
    setErro('');
    if (f.cidade && !cidadeOficial(f.cidade, f.uf)) return setErro(`Escolha uma cidade válida de ${f.uf} na lista (ou deixe em branco para só o estado).`);
    if (!rascunho && !await confirmar({
      titulo: 'Enviar a solicitação?',
      mensagem: `${f.qtd} vaga(s) de ${f.funcao}${f.cidade ? ` em ${f.cidade} - ${f.uf}` : ` em ${f.uf}`} vão para o RH.`,
      confirmar: 'Enviar', cancelar: 'Voltar',
    })) return;
    const body = { ...f, cidade: f.cidade ? cidadeOficial(f.cidade, f.uf) : '', rascunho };
    const r = await run(() => (id ? api.put(`/meus/${id}`, body) : api.post('/meus', body)), (x) => (rascunho ? `Rascunho salvo · ${x.codigo}` : `Solicitação enviada · ${x.codigo}`));
    if (r) navigate(base);
  };

  const cancelar = async () => {
    if (await confirmar({ titulo: 'Cancelar esta solicitação?', mensagem: 'O que foi preenchido e não salvo será perdido.', confirmar: 'Sim, cancelar', cancelar: 'Continuar editando', perigo: true })) navigate(base);
  };
  const simNao = (k) => (
    <select value={f[k] ? 'Sim' : 'Não'} onChange={(e) => setF({ ...f, [k]: e.target.value === 'Sim' })}><option>Não</option><option>Sim</option></select>
  );

  if (!cfg) return <Empty>Carregando…</Empty>;
  return (
    <div className="ct-form-wrap">
      <Card className="ct-form">
        <div className="ct-form-head">Solicitação de vagas</div>
        <div className="form-grid ct-form-body">
          <Alert>{erro}</Alert>
          <Field label="Operação / Projeto"><select value={f.projeto} onChange={set('projeto')}>{cfg.projetos.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Função"><select value={f.funcao} onChange={set('funcao')}>{cfg.funcoes.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Cidade e UF" hint="Digite a cidade — o estado entra sozinho"><CidadeInput cidade={f.cidade} uf={f.uf} onChange={({ cidade, uf }) => setF({ ...f, cidade, uf })} /></Field>
          <Field label="Data de início"><input type="date" value={f.data_desejada} onChange={set('data_desejada')} /></Field>
          <Field label="Observação (opcional)"><textarea rows={3} value={f.observacao} onChange={set('observacao')} placeholder="Observação da vaga" /></Field>
          <div className="ct-req">
            <Field label="Experiência">{simNao('experiencia')}</Field>
            <Field label="CNH">{simNao('cnh')}</Field>
            <Field label="Móvel">{simNao('movel')}</Field>
            <Field label="Quantidade"><input type="number" min={1} value={f.qtd} onChange={set('qtd')} /></Field>
          </div>
          <div className="ct-form-acoes">
            <Button onClick={() => salvar(false)} disabled={busy}><Send size={15} /> Enviar</Button>
            <Button variant="outline" onClick={() => salvar(true)} disabled={busy}>Salvar rascunho</Button>
            <Button variant="danger" onClick={cancelar} disabled={busy}><XCircle size={15} /> Cancelar</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function Solicitante(props) {
  return (
    <Routes>
      <Route index element={<MeusPedidos {...props} />} />
      <Route path="anexados" element={<Anexados {...props} />} />
      <Route path="novo" element={<Formulario {...props} />} />
      <Route path="editar/:id" element={<Formulario {...props} />} />
      <Route path="grupo/:id" element={<Grupo {...props} />} />
    </Routes>
  );
}
