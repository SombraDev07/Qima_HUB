import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Plus, Eye, CheckCircle2, Trash2, X, Upload, UserPlus, FileSpreadsheet, ArrowUpDown, Check } from 'lucide-react';
import {
  Alert, Badge, Button, Card, CidadeInput, Empty, Field, FiltroSelect, Modal, PageHeader,
  cidadeOficial, fmtDate, fmtDateTime, norm, uniq, useAction, useToast, maskCpf, fmtCpf, cpfValido, useConfirm, usePrompt,
} from '@hub';

const Cpf = ({ v }) => (!v ? '—' : <>{fmtCpf(v)}{!cpfValido(v) && <span className="ct-cpf-bad" title="CPF inválido"> !</span>}</>);
import { Mobilidade, PessoaStatus, PESSOA_ST, Requisitos, SituacaoTag, StatusBadge, local, quando, sim, diasAte, diasDesde, textoAte, textoDesde } from './shared.jsx';

const ABERTOS = (p) => !['finalizado', 'cancelado', 'recusado'].includes(p.status);
const POR_PAGINA = 25;

// =========================================================================== anexar da base
function AnexarDialog({ api, pedido, onClose, onDone }) {
  const [base, setBase] = useState(null);
  const [f, setF] = useState({ funcao: pedido.funcao, local: '', regiao: '', nome: '', cnh: pedido.cnh, movel: pedido.movel, exp: pedido.experiencia });
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirmar = useConfirm();
  useEffect(() => { api.get('/central/banco').then(setBase); }, []);

  const disp = (base || []).filter((b) => ['livre', 'contratado'].includes(b.status)
    && (!f.funcao || b.funcao === f.funcao) && (!f.local || `${b.cidade} - ${b.uf}` === f.local) && (!f.regiao || b.regiao === f.regiao)
    && (!f.nome || norm(b.nome).includes(norm(f.nome))) && (!f.cnh || b.cnh) && (!f.movel || b.movel) && (!f.exp || b.experiencia));
  const anexar = async (ids, forcar = false) => {
    setBusy(true);
    try {
      await api.post(`/central/pedidos/${pedido.id}/anexar`, { pessoas: ids, forcar });
      toast(`Anexou ${ids.length} pessoa(s)`);
      onDone();
    } catch (e) {
      if (e.status === 409 && await confirmar({ titulo: 'Passa da quantidade da vaga', mensagem: `${e.message}\nDeseja anexar mesmo assim?`, confirmar: 'Anexar mesmo assim' })) {
        setBusy(false);
        return anexar(ids, true);
      }
      if (e.status !== 409) toast(e.message, 'erro');
    } finally { setBusy(false); }
  };
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Modal title={`Anexar da base · ${pedido.codigo}`} onClose={onClose} wide={1240}>
      <p className="muted small ct-m0">{pedido.funcao} · {local(pedido)} · {pedido.qtd_atendida}/{pedido.qtd} preenchidas. Começa com a função e os requisitos da vaga — mude os filtros para ver mais pessoas.</p>
      <div className="ct-filtros">
        <FiltroSelect label="Função" value={f.funcao} onChange={(v) => setF({ ...f, funcao: v })} options={uniq((base || []).map((b) => b.funcao))} />
        <FiltroSelect label="Local" value={f.local} onChange={(v) => setF({ ...f, local: v })} options={uniq((base || []).filter((b) => b.cidade).map((b) => `${b.cidade} - ${b.uf}`))} />
        <FiltroSelect label="Região" value={f.regiao} onChange={(v) => setF({ ...f, regiao: v })} options={uniq((base || []).map((b) => b.regiao))} />
        <label className="kit-filtro"><span>Nome</span><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Procurar por nome" /></label>
      </div>
      <div className="ct-checks">
        <label className="check"><input type="checkbox" checked={f.cnh} onChange={(e) => setF({ ...f, cnh: e.target.checked })} /> Só com CNH</label>
        <label className="check"><input type="checkbox" checked={f.movel} onChange={(e) => setF({ ...f, movel: e.target.checked })} /> Só com móvel</label>
        <label className="check"><input type="checkbox" checked={f.exp} onChange={(e) => setF({ ...f, exp: e.target.checked })} /> Só com experiência</label>
        <span className="muted small">{disp.length} disponível(is) · {sel.length} selecionada(s)</span>
        <Button className="btn-sm" onClick={() => anexar(sel)} disabled={busy || !sel.length}>Anexar selecionados</Button>
      </div>
      {base === null ? <Empty>Carregando…</Empty> : !disp.length ? <Empty>Ninguém disponível com esses filtros.</Empty> : (
        <div className="ct-scroll">
          <table className="table ct-table">
            <thead><tr><th /><th>Nome</th><th>E-mail</th><th>Local / região</th><th>Móvel</th><th>CNH</th><th>Exp.</th><th>Status</th><th /></tr></thead>
            <tbody>
              {disp.map((b) => (
                <tr key={b.id}>
                  <td><input type="checkbox" checked={sel.includes(b.id)} onChange={() => toggle(b.id)} /></td>
                  <td className="cell-strong">{b.nome}</td><td className="small">{b.email}</td>
                  <td className="small">{b.cidade ? `${b.cidade} - ${b.uf}` : '—'}{b.regiao ? ` · ${b.regiao}` : ''}</td>
                  <td>{sim(b.movel)}</td><td>{sim(b.cnh)}</td><td>{sim(b.experiencia)}</td><td><PessoaStatus s={b.status} /></td>
                  <td className="row-actions"><Button className="btn-sm" onClick={() => anexar([b.id])} disabled={busy}>Anexar</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// =========================================================================== vagas
function Kpi({ titulo, valor, on, onClick }) {
  return <button className={`ct-kpi ${on ? 'on' : ''}`} onClick={onClick}><span>{titulo}</span><b>{valor}</b></button>;
}

function Vagas({ module, api }) {
  const base = `/m/${module.key}/central`;
  const navigate = useNavigate();
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [f, setF] = useState({ distrito: '', cidade: '', funcao: '', semana: '', status: '', abertos: false });
  const [ordem, setOrdem] = useState('novo');
  const [pag, setPag] = useState(1);
  const [anexar, setAnexar] = useState(null);
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const load = () => api.get('/central/pedidos').then(setLista).catch((e) => setErro(e.message));
  useEffect(() => { load(); }, []);

  const all = lista || [];
  const soma = (xs) => `${xs.reduce((s, p) => s + p.qtd, 0)}/${xs.reduce((s, p) => s + Math.min(p.qtd_atendida, p.qtd), 0)}`;
  const k = {
    vagas: soma(all), lider: soma(all.filter((p) => p.funcao === 'Líder')), auditores: soma(all.filter((p) => p.funcao === 'Auditor')),
    sol: `${all.length}/${all.filter((p) => ['finalizado', 'cancelado'].includes(p.status)).length}`, abertos: all.filter(ABERTOS).length,
  };
  const vis = all.filter((p) => (!f.distrito || p.distrito === f.distrito) && (!f.cidade || p.cidade === f.cidade) && (!f.funcao || p.funcao === f.funcao)
    && (!f.semana || String(p.semana) === f.semana) && (!f.status || p.status === f.status) && (!f.abertos || ABERTOS(p)))
    .sort((a, b) => (ordem === 'novo' ? b.id - a.id : a.id - b.id));
  const paginas = Math.max(1, Math.ceil(vis.length / POR_PAGINA));
  const pagina = vis.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);
  const set = (key) => (v) => { setF({ ...f, [key]: v }); setPag(1); };
  const novos = all.filter((p) => p.status === 'pendente').length;

  const finalizar = async (p) => {
    if (await confirmar({ titulo: `Finalizar a chamada ${p.codigo}?`, mensagem: 'A vaga entra como Fechado e deixa de aparecer em Abertos.', confirmar: 'Finalizar' })
      && await run(() => api.post(`/central/pedidos/${p.id}/finalizar`), 'Chamada finalizada · Fechado')) load();
  };
  const excluir = async (p) => {
    if (await confirmar({ titulo: `Excluir ${p.codigo}?`, mensagem: 'O pedido e as pessoas anexadas a ele serão removidos. Não pode ser desfeito.', confirmar: 'Excluir', perigo: true })
      && await run(() => api.del(`/central/pedidos/${p.id}`), `${p.codigo} excluído`)) load();
  };

  return (
    <>
      <PageHeader title={`Vagas${novos ? ` (${novos} novo${novos > 1 ? 's' : ''})` : ''}`} subtitle="Pedidos de vaga dos solicitantes" back={null}
        actions={<a className="btn btn-outline" href={`/api/m/${module.key}/central/exportar`}><FileSpreadsheet size={16} /> Exportar Excel</a>} />
      <Alert>{erro}</Alert>
      <div className="ct-kpis">
        <Kpi titulo="Vagas (sol./at.)" valor={k.vagas} onClick={() => setF({ ...f, funcao: '' })} on={!f.funcao && !f.abertos} />
        <Kpi titulo="Líder" valor={k.lider} onClick={() => set('funcao')('Líder')} on={f.funcao === 'Líder'} />
        <Kpi titulo="Auditores" valor={k.auditores} onClick={() => set('funcao')('Auditor')} on={f.funcao === 'Auditor'} />
        <Kpi titulo="Solicitações / encerradas" valor={k.sol} />
        <Kpi titulo="Em aberto" valor={k.abertos} onClick={() => setF({ ...f, abertos: !f.abertos })} on={f.abertos} />
      </div>
      <div className="ct-filtros">
        <FiltroSelect label="Distrito" value={f.distrito} onChange={set('distrito')} options={uniq(all.map((p) => p.distrito))} />
        <FiltroSelect label="Cidade" value={f.cidade} onChange={set('cidade')} options={uniq(all.map((p) => p.cidade))} />
        <FiltroSelect label="Função" value={f.funcao} onChange={set('funcao')} options={uniq(all.map((p) => p.funcao))} />
        <FiltroSelect label="Semana" value={f.semana} onChange={set('semana')} options={uniq(all.map((p) => String(p.semana))).sort((a, b) => a - b).map((s) => ({ value: s, label: `S${s}` }))} />
        <FiltroSelect label="Status" value={f.status} onChange={set('status')} options={uniq(all.map((p) => p.status)).map((s) => ({ value: s, label: all.find((p) => p.status === s).status_label }))} />
        <button className="btn btn-outline btn-sm ct-ordem" onClick={() => setOrdem(ordem === 'novo' ? 'antigo' : 'novo')}><ArrowUpDown size={14} /> {ordem === 'novo' ? 'Mais novos' : 'Mais antigos'}</button>
      </div>
      {lista === null ? <Empty>Carregando…</Empty> : !pagina.length ? <Empty>Nenhuma vaga com esses filtros.</Empty> : (
        <Card className="table-card">
          <table className="table ct-table">
            <thead><tr><th>ID</th><th>Distrito</th><th>Cidade</th><th>Função</th><th>Móvel</th><th>Exp.</th><th>CNH</th><th>Observação</th><th>Qtd</th><th>Início</th><th>Solicitante / pedido em</th><th>Status</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>
              {pagina.map((p) => (
                <tr key={p.id} className={p.status === 'pendente' ? 'ct-row-novo' : ''}>
                  <td className="cell-strong"><button className="ct-link" onClick={() => navigate(`${base}/vaga/${p.id}`)}>{p.codigo}</button></td>
                  <td>{p.distrito}</td><td>{p.cidade ? `${p.cidade} - ${p.uf}` : '—'}</td><td>{p.funcao}</td>
                  <td>{sim(p.movel)}</td><td>{sim(p.experiencia)}</td><td>{sim(p.cnh)}</td>
                  <td className="small ct-obs">{p.observacao || <span className="muted">—</span>}</td>
                  <td className={p.qtd_atendida < p.qtd ? 'ct-pend' : 'ct-ok'}>{p.qtd}/{p.qtd_atendida}</td>
                  <td className="ct-nowrap">{quando(p)}<div className={`small ${ABERTOS(p) && diasAte(p.data_desejada) < 0 ? 'ct-pend' : 'muted'}`}>{textoAte(diasAte(p.data_desejada))}</div></td>
                  <td>{p.solicitante_nome}<div className="muted small">criado em {fmtDateTime(p.created_at)}</div><div className="muted small">{textoDesde(diasDesde(p.created_at))}</div></td>
                  <td><StatusBadge p={p} /></td>
                  <td>{ABERTOS(p) ? <SituacaoTag s={p.situacao} /> : <span className="muted">—</span>}</td>
                  <td className="row-actions">
                    <div className="ct-acts">
                      {ABERTOS(p) && <button className="icon-btn" title="Anexar da base" onClick={() => setAnexar(p)}><Plus size={17} /></button>}
                      <button className="icon-btn" title="Ver vaga e anexados" onClick={() => navigate(`${base}/vaga/${p.id}`)}><Eye size={16} /></button>
                      {ABERTOS(p) && <button className="icon-btn" title="Finalizar chamada" onClick={() => finalizar(p)} disabled={busy}><CheckCircle2 size={16} /></button>}
                      {['cancelado', 'recusado'].includes(p.status) && <button className="icon-btn danger" title="Excluir" onClick={() => excluir(p)}><Trash2 size={16} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ct-pager">
            <span>{vis.length} vaga(s)</span>
            <span><button className="ct-link" disabled={pag <= 1} onClick={() => setPag(pag - 1)}>‹ Anterior</button> Página {pag} de {paginas} <button className="ct-link" disabled={pag >= paginas} onClick={() => setPag(pag + 1)}>Próxima ›</button></span>
          </div>
        </Card>
      )}
      {anexar && <AnexarDialog api={api} pedido={anexar} onClose={() => setAnexar(null)} onDone={() => { setAnexar(null); load(); }} />}
    </>
  );
}

// =========================================================================== detalhe da vaga
function Vaga({ module, api }) {
  const { id } = useParams();
  const base = `/m/${module.key}/central`;
  const [p, setP] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [anexar, setAnexar] = useState(false);
  const [ficha, setFicha] = useState(null);
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const load = () => api.get(`/central/pedidos/${id}`).then(setP);
  useEffect(() => { load(); api.get('/config').then(setCfg); }, [id]);
  if (!p || !cfg) return <Empty>Carregando…</Empty>;
  const aberto = ABERTOS(p);

  const mudarStatus = async (st) => { if (await run(() => api.put(`/central/pedidos/${p.id}/status`, { status: st }), `Status: ${cfg.status[st]}`)) load(); };
  const remover = async (a) => {
    if (await confirmar({ titulo: `Remover ${a.nome} desta vaga?`, mensagem: 'A pessoa volta para Livre (ou Contratado) no banco.', confirmar: 'Remover', perigo: true })
      && await run(() => api.del(`/central/anexos/${a.anexo_id}`), `Removeu ${a.nome}`)) load();
  };

  return (
    <>
      <PageHeader title={`${p.codigo} · ${p.funcao}`} back={base}
        subtitle={`${local(p)} · início ${fmtDate(p.data_desejada)} (S${p.semana}) · ${p.projeto} · pedido por ${p.solicitante_nome} em ${fmtDateTime(p.created_at)}`}
        actions={<div className="tags">
          <StatusBadge p={p} />{aberto && <SituacaoTag s={p.situacao} />}
          <select value={p.status} onChange={(e) => mudarStatus(e.target.value)} disabled={busy} className="ct-st-select" title="Mudar status">
            {Object.entries(cfg.status).filter(([k2]) => k2 !== 'rascunho').map(([k2, v]) => <option key={k2} value={k2}>{v}</option>)}
          </select>
        </div>} />
      <div className="ct-vaga">
        <Card>
          <div className="ct-vaga-num"><b>{p.qtd_atendida}</b><span>de {p.qtd} preenchida(s)</span></div>
          <div className="ct-prog"><span style={{ width: `${Math.min(100, (p.qtd_atendida / p.qtd) * 100)}%` }} /></div>
          <h4 className="ct-h4">Requisitos</h4><Requisitos p={p} />
          {p.observacao && <><h4 className="ct-h4">Observação</h4><p className="ct-m0">{p.observacao}</p></>}
          <h4 className="ct-h4">Histórico</h4>
          <div className="ct-hist">{p.historico.map((h) => <div key={h.id} className="small"><span className="muted">{fmtDateTime(h.created_at)}</span> <b>{h.acao}</b>{h.detalhe ? ` · ${h.detalhe}` : ''} <span className="muted">— {h.user_nome}</span></div>)}</div>
        </Card>
        <div>
          <div className="ct-sec-row"><h3 className="ct-h3">Pessoas anexadas ({p.anexos.length})</h3>{aberto && <Button onClick={() => setAnexar(true)}><Plus size={16} /> Anexar da base</Button>}</div>
          {!p.anexos.length ? <Empty>Ninguém anexado ainda.</Empty> : (
            <Card className="table-card">
              <table className="table ct-table">
                <thead><tr><th>Pessoa</th><th>E-mail</th><th>Local</th><th>Móvel</th><th>CNH</th><th>Exp.</th><th>Desde</th><th /></tr></thead>
                <tbody>
                  {p.anexos.map((a) => (
                    <tr key={a.anexo_id}>
                      <td className="cell-strong"><button className="ct-link" onClick={() => setFicha(a)}>{a.nome}</button>{a.demissao_pendente && <div className="ct-pend small">demissão em análise</div>}</td>
                      <td className="small">{a.email}</td><td className="small">{a.cidade ? `${a.cidade} - ${a.uf}` : '—'}</td>
                      <td>{sim(a.movel)}</td><td>{sim(a.cnh)}</td><td>{sim(a.experiencia)}</td><td>{fmtDate(a.data_vinc)}</td>
                      <td className="row-actions"><button className="icon-btn danger" title="Remover da vaga" onClick={() => remover(a)} disabled={busy}><X size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
      {anexar && <AnexarDialog api={api} pedido={p} onClose={() => setAnexar(false)} onDone={() => { setAnexar(false); load(); }} />}
      {ficha && <Ficha api={api} cfg={cfg} pessoa={{ ...ficha, status: 'anexado', vaga: { codigo: p.codigo } }} onClose={() => setFicha(null)} onSaved={() => { setFicha(null); load(); }} />}
    </>
  );
}

// =========================================================================== candidatos (banco)
function Ficha({ api, cfg, pessoa, onClose, onSaved, novo }) {
  const [edit, setEdit] = useState(!!novo);
  const [f, setF] = useState(() => ({
    nome: pessoa?.nome || '', email: pessoa?.email || '', cpf: maskCpf(pessoa?.cpf || ''), nascimento: pessoa?.nascimento || '', telefone: pessoa?.telefone || '',
    funcao: pessoa?.funcao || cfg.funcoes[0], cidade: pessoa?.cidade || '', uf: pessoa?.uf || 'MT', projeto: pessoa?.projeto || 'Todos',
    cnh: !!pessoa?.cnh, movel: !!pessoa?.movel, experiencia: !!pessoa?.experiencia, contratado: !!pessoa?.contratado, obs: pessoa?.obs || '',
  }));
  const [run, busy] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const salvar = async () => {
    const body = { ...f, cidade: f.cidade ? (cidadeOficial(f.cidade, f.uf) || f.cidade) : '' };
    const r = await run(() => (novo ? api.post('/central/banco', body) : api.put(`/central/banco/${pessoa.id}`, body)), novo ? `Registrou ${f.nome}` : 'Ficha salva');
    if (r) onSaved();
  };
  const reativar = async () => { if (await run(() => api.put(`/central/banco/${pessoa.id}`, { reativar: true }), `${pessoa.nome} voltou para Livre`)) onSaved(); };
  const st = pessoa?.status;

  return (
    <Modal title={novo ? 'Novo usuário' : pessoa.nome} onClose={onClose} wide
      footer={edit ? <><Button variant="outline" onClick={novo ? onClose : () => setEdit(false)}>Cancelar</Button><Button onClick={salvar} disabled={busy}>Salvar</Button></>
        : <><Button variant="outline" onClick={onClose}>Fechar</Button>{st === 'demitido' && <Button variant="outline" onClick={reativar} disabled={busy}>Reativar (Livre)</Button>}<Button onClick={() => setEdit(true)}>Editar</Button></>}>
      {!novo && <div className="tags"><PessoaStatus s={st} />{pessoa.vaga && <Badge tone="info">Vaga {pessoa.vaga.codigo}</Badge>}</div>}
      {edit ? (
        <>
          <div className="grid-2">
            <Field label="Nome"><input value={f.nome} onChange={set('nome')} /></Field>
            <Field label="E-mail"><input type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="CPF" hint={f.cpf && f.cpf.replace(/\D/g, '').length === 11 && !cpfValido(f.cpf) ? 'CPF inválido — confira os números' : f.cpf && f.cpf.replace(/\D/g, '').length < 11 ? `${f.cpf.replace(/\D/g, '').length}/11 dígitos` : null}>
              <input value={f.cpf} inputMode="numeric" maxLength={14} placeholder="000.000.000-00"
                className={f.cpf.replace(/\D/g, '').length === 11 && !cpfValido(f.cpf) ? 'cid-invalid' : ''}
                onChange={(e) => setF({ ...f, cpf: maskCpf(e.target.value) })} />
            </Field>
            <Field label="Nascimento"><input type="date" value={f.nascimento} onChange={set('nascimento')} /></Field>
            <Field label="Telefone"><input value={f.telefone} onChange={set('telefone')} /></Field>
            <Field label="Função"><select value={f.funcao} onChange={set('funcao')}>{cfg.funcoes.map((x) => <option key={x}>{x}</option>)}<option>QIMA</option></select></Field>
          </div>
          <Field label="Local"><CidadeInput cidade={f.cidade} uf={f.uf} onChange={({ cidade, uf }) => setF({ ...f, cidade, uf })} /></Field>
          <div className="grid-2">
            <Field label="Projeto"><select value={f.projeto} onChange={set('projeto')}><option>Todos</option>{cfg.projetos.map((x) => <option key={x}>{x}</option>)}</select></Field>
            {!['anexado', 'demitido'].includes(st) && (
              <Field label="Situação"><select value={f.contratado ? 'Contratado' : 'Livre'} onChange={(e) => setF({ ...f, contratado: e.target.value === 'Contratado' })}><option>Livre</option><option>Contratado</option></select></Field>
            )}
          </div>
          <div className="ct-checks">
            <label className="check"><input type="checkbox" checked={f.cnh} onChange={set('cnh')} /> CNH</label>
            <label className="check"><input type="checkbox" checked={f.movel} onChange={set('movel')} /> Móvel</label>
            <label className="check"><input type="checkbox" checked={f.experiencia} onChange={set('experiencia')} /> Experiência</label>
          </div>
          <Field label="Observação"><textarea rows={2} value={f.obs} onChange={set('obs')} /></Field>
        </>
      ) : (
        <dl className="ct-dl">
          <dt>E-mail</dt><dd>{pessoa.email || '—'}</dd><dt>CPF</dt><dd><Cpf v={pessoa.cpf} /></dd><dt>Nascimento</dt><dd>{fmtDate(pessoa.nascimento)}</dd>
          <dt>Telefone</dt><dd>{pessoa.telefone || '—'}</dd><dt>Função</dt><dd>{pessoa.funcao || '—'}</dd>
          <dt>Local</dt><dd>{pessoa.cidade ? `${pessoa.cidade} - ${pessoa.uf}` : '—'}{pessoa.regiao ? ` · ${pessoa.regiao}` : ''}</dd>
          <dt>Projeto</dt><dd>{pessoa.projeto}</dd><dt>CNH / Móvel / Exp.</dt><dd>{sim(pessoa.cnh)} / {sim(pessoa.movel)} / {sim(pessoa.experiencia)}</dd>
          <dt>Observação</dt><dd>{pessoa.obs || '—'}</dd>
        </dl>
      )}
    </Modal>
  );
}

function ImportarDialog({ api, onClose, onDone }) {
  const [texto, setTexto] = useState('');
  const [res, setRes] = useState(null);
  const [run, busy] = useAction();
  const arquivo = (e) => { const fl = e.target.files[0]; if (fl) fl.text().then(setTexto); e.target.value = ''; };
  const importar = async () => { const r = await run(() => api.post('/central/banco/importar', { texto })); if (r) { setRes(r); onDone(); } };
  return (
    <Modal title="Importar pessoas" onClose={onClose} wide
      footer={<><Button variant="outline" onClick={onClose}>Fechar</Button><Button onClick={importar} disabled={busy || !texto.trim()}>Importar</Button></>}>
      <p className="small ct-m0">Planilha salva como <b>CSV</b> (ponto e vírgula) ou cole as linhas do Excel. Colunas, nesta ordem:</p>
      <code className="ct-cols">Nome · E-mail · Função · Cidade - UF · Projeto · CNH · Móvel · Experiência · Observação</code>
      <label className="btn btn-outline btn-sm ct-file"><Upload size={14} /> Escolher arquivo CSV<input type="file" accept=".csv,.txt,text/csv" hidden onChange={arquivo} /></label>
      <textarea rows={9} className="ct-mono" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Maria Souza;maria@exemplo.com;Auditor;Cuiabá - MT;Harvest;sim;não;sim;" />
      {res && <Alert kind={res.pulados.length ? 'error' : 'success'}>{res.importados} pessoa(s) entraram no banco · {res.pulados.length} não entraram{res.pulados.length ? `: ${res.pulados.slice(0, 6).join('; ')}` : ''}</Alert>}
    </Modal>
  );
}

function Candidatos({ api }) {
  const [lista, setLista] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [f, setF] = useState({ nome: '', funcao: '', local: '', projeto: '', cnh: '', movel: '', exp: '', status: '' });
  const [ficha, setFicha] = useState(null);
  const [imp, setImp] = useState(false);
  const load = () => api.get('/central/banco').then(setLista);
  useEffect(() => { load(); api.get('/config').then(setCfg); }, []);
  const all = lista || [];
  const yn = (v, b) => !v || (v === 'Sim') === b;
  const vis = all.filter((b) => (!f.nome || norm(`${b.nome} ${b.email} ${b.cpf}`).includes(norm(f.nome))) && (!f.funcao || b.funcao === f.funcao)
    && (!f.local || `${b.cidade} - ${b.uf}` === f.local) && (!f.projeto || b.projeto === f.projeto) && yn(f.cnh, b.cnh) && yn(f.movel, b.movel) && yn(f.exp, b.experiencia)
    && (!f.status || b.status === f.status));
  const cont = Object.keys(PESSOA_ST).map((s) => `${all.filter((b) => b.status === s).length} ${PESSOA_ST[s].toLowerCase()}`).join(' · ');
  if (!cfg) return <Empty>Carregando…</Empty>;
  return (
    <>
      <PageHeader title="Candidatos" subtitle={`Banco de pessoas · ${all.length} · ${cont}`} back={null}
        actions={<><Button variant="outline" onClick={() => setImp(true)}><Upload size={16} /> Importar</Button><Button onClick={() => setFicha({ novo: true })}><UserPlus size={16} /> Novo usuário</Button></>} />
      <div className="ct-filtros">
        <label className="kit-filtro" style={{ flex: '2 1 200px' }}><span>Pessoa</span><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Nome, e-mail ou CPF" /></label>
        <FiltroSelect label="Função" value={f.funcao} onChange={(v) => setF({ ...f, funcao: v })} options={uniq(all.map((b) => b.funcao))} />
        <FiltroSelect label="Local" value={f.local} onChange={(v) => setF({ ...f, local: v })} options={uniq(all.filter((b) => b.cidade).map((b) => `${b.cidade} - ${b.uf}`))} />
        <FiltroSelect label="Projeto" value={f.projeto} onChange={(v) => setF({ ...f, projeto: v })} options={uniq(all.map((b) => b.projeto))} />
        <FiltroSelect label="CNH" value={f.cnh} onChange={(v) => setF({ ...f, cnh: v })} options={['Sim', 'Não']} />
        <FiltroSelect label="Móvel" value={f.movel} onChange={(v) => setF({ ...f, movel: v })} options={['Sim', 'Não']} />
        <FiltroSelect label="Exp." value={f.exp} onChange={(v) => setF({ ...f, exp: v })} options={['Sim', 'Não']} />
        <FiltroSelect label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={Object.entries(PESSOA_ST).map(([value, label]) => ({ value, label }))} />
      </div>
      {lista === null ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>Nenhum candidato para este filtro.</Empty> : (
        <Card className="table-card">
          <table className="table ct-table">
            <thead><tr><th>Pessoa</th><th>E-mail</th><th>CPF</th><th>Nasc.</th><th>Telefone</th><th>Função</th><th>Local</th><th>Projeto</th><th>CNH</th><th>Móvel</th><th>Exp.</th><th>Status</th><th /></tr></thead>
            <tbody>
              {vis.map((b) => (
                <tr key={b.id}>
                  <td className="cell-strong">{b.nome}</td><td className="small">{b.email || '—'}</td><td className="small ct-nowrap"><Cpf v={b.cpf} /></td><td className="small">{fmtDate(b.nascimento)}</td>
                  <td className="small">{b.telefone || '—'}</td><td>{b.funcao || '—'}</td><td className="small">{b.cidade ? `${b.cidade} - ${b.uf}` : '—'}</td><td className="small">{b.projeto}</td>
                  <td>{sim(b.cnh)}</td><td>{sim(b.movel)}</td><td>{sim(b.experiencia)}</td>
                  <td><PessoaStatus s={b.status} />{b.vaga && <div className="muted small">{b.vaga.codigo}</div>}</td>
                  <td className="row-actions"><Button variant="outline" className="btn-sm" onClick={() => setFicha(b)}>Ver</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {ficha && <Ficha api={api} cfg={cfg} pessoa={ficha.novo ? null : ficha} novo={!!ficha.novo} onClose={() => setFicha(null)} onSaved={() => { setFicha(null); load(); }} />}
      {imp && <ImportarDialog api={api} onClose={() => setImp(false)} onDone={load} />}
    </>
  );
}

// =========================================================================== demissões
function Demissoes({ api }) {
  const [lista, setLista] = useState(null);
  const [aba, setAba] = useState('pendente');
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const perguntar = usePrompt();
  const load = () => api.get('/central/demissoes').then(setLista);
  useEffect(() => { load(); }, []);
  const vis = (lista || []).filter((d) => (aba === 'pendente' ? d.status === 'pendente' : d.status !== 'pendente'));
  const aceitar = async (d) => {
    if (await confirmar({ titulo: `Aceitar a demissão de ${d.nome}?`, mensagem: 'A pessoa sai da vaga e fica como Demitida no banco.', confirmar: 'Aceitar demissão', perigo: true })
      && await run(() => api.post(`/central/demissoes/${d.id}/aceitar`), `Demissão aceita · ${d.nome}`)) load();
  };
  const recusar = async (d) => {
    const resposta = await perguntar({ titulo: `Recusar a demissão de ${d.nome}?`, mensagem: 'O motivo é enviado ao solicitante.', label: 'Motivo', confirmar: 'Recusar demissão' });
    if (resposta !== null && await run(() => api.post(`/central/demissoes/${d.id}/recusar`, { resposta }), 'Demissão recusada')) load();
  };
  return (
    <>
      <PageHeader title="Demissões" subtitle="Pedidos de desligamento enviados pelos solicitantes" back={null} />
      <div className="tabs">
        <button className={aba === 'pendente' ? 'active' : ''} onClick={() => setAba('pendente')}>Abertos ({(lista || []).filter((d) => d.status === 'pendente').length})</button>
        <button className={aba === 'hist' ? 'active' : ''} onClick={() => setAba('hist')}>Histórico</button>
      </div>
      {lista === null ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>Nada aqui.</Empty> : (
        <div className="ct-dems">
          {vis.map((d) => (
            <Card key={d.id} className={`ct-dem ct-dem-${d.status}`}>
              <div className="ct-dem-head">
                <div><b>{d.nome}</b> <span className="muted small">{d.email}</span></div>
                <span className={`ct-pst ${d.status === 'aceita' ? 'ct-pst-demitido' : d.status === 'recusada' ? 'ct-pst-livre' : 'ct-pst-anexado'}`}>{d.status === 'pendente' ? 'Pendente' : d.status === 'aceita' ? 'Aceita' : 'Recusada'}</span>
              </div>
              <dl className="ct-dl">
                <dt>Vaga / projeto</dt><dd>{d.pedido_codigo || '—'} · {d.projeto || '—'}</dd>
                <dt>Tipo</dt><dd>{d.tipo === 'colaborador' ? 'Pedido do colaborador' : 'Iniciativa da empresa'}</dd>
                <dt>Gestor</dt><dd>{d.gestor} <span className="muted small">({d.solicitante_email})</span></dd>
                <dt>Prevista / último dia</dt><dd>{fmtDate(d.data_prevista)} · {fmtDate(d.ultimo_dia)}</dd>
                <dt>Aviso prévio</dt><dd>{d.aviso}</dd><dt>Justificativa</dt><dd>{d.justificativa}</dd>
                {d.obs && <><dt>Observação</dt><dd>{d.obs}</dd></>}
                {d.resposta && <><dt>Resposta do RH</dt><dd>{d.resposta}</dd></>}
                <dt>Enviado em</dt><dd>{fmtDateTime(d.created_at)}</dd>
              </dl>
              {d.status === 'pendente' && (
                <div className="ct-acts">
                  <Button onClick={() => aceitar(d)} disabled={busy}><Check size={15} /> Aceitar</Button>
                  <Button variant="outline" onClick={() => recusar(d)} disabled={busy}><X size={15} /> Recusar</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export default function Central(props) {
  return (
    <Routes>
      <Route index element={<Vagas {...props} />} />
      <Route path="vaga/:id" element={<Vaga {...props} />} />
      <Route path="candidatos" element={<Candidatos {...props} />} />
      <Route path="demissoes" element={<Demissoes {...props} />} />
    </Routes>
  );
}
