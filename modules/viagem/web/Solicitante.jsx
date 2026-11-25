// Telas do solicitante: minhas viagens, nova viagem (com passageiros puxados do banco de pessoas) e detalhe.
import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, XCircle, Search, UserPlus, X, Send } from 'lucide-react';
import {
  Alert, Button, Card, Empty, Field, PageHeader, CidadeInput, cidadeOficial, FiltroSelect, useAction, useConfirm, useToast,
  fmtDate, maskCpf, cpfValido, norm, money,
} from '@hub';
import { STATUS, TRANSPORTE, StatusBadge, IconeTransporte, ResumoViagem, TabelaPassageiros, Passagens, Historico, trecho } from './shared.jsx';

const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// =========================================================================== lista
function MinhasViagens({ api }) {
  const [pedidos, setPedidos] = useState(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const navigate = useNavigate();
  useEffect(() => { api.get('/meus').then(setPedidos).catch((e) => setErro(e.message)); }, []);

  const visiveis = (pedidos || []).filter((p) => (!status || p.status === status)
    && (!busca || norm(`${p.codigo} ${trecho(p)} ${p.passageiros.map((x) => x.nome).join(' ')}`).includes(norm(busca))));

  return (
    <>
      <PageHeader title="Minhas viagens" subtitle="Peça passagens de ônibus ou avião e acompanhe o agendamento"
        actions={<Button onClick={() => navigate('novo')}><Plus size={16} /> Nova viagem</Button>} />
      <Alert>{erro}</Alert>
      <div className="vg-filtros">
        <label className="vg-filtro vg-filtro-grow"><span>Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, cidade ou passageiro" />
        </label>
        <FiltroSelect label="Status" value={status} onChange={setStatus} options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      </div>
      {pedidos === null ? <Empty>Carregando…</Empty> : !visiveis.length ? <Empty>Nenhuma viagem. Clique em “Nova viagem”.</Empty> : (
        <Card className="table-card">
          <table className="table vg-table">
            <thead><tr><th>Código</th><th>Trecho</th><th>Transporte</th><th>Saída</th><th>Volta</th><th>Passageiros</th><th>Status</th><th /></tr></thead>
            <tbody>
              {visiveis.map((p) => (
                <tr key={p.id} className="vg-click" onClick={() => navigate(`pedido/${p.id}`)}>
                  <td className="cell-strong">{p.codigo}</td>
                  <td>{trecho(p)}</td>
                  <td className="vg-ico"><IconeTransporte t={p.transporte} /> {TRANSPORTE[p.transporte]}</td>
                  <td>{fmtDate(p.data_ida)} <span className="muted small">{p.horario}</span></td>
                  <td>{p.data_volta ? fmtDate(p.data_volta) : <span className="muted">Só ida</span>}</td>
                  <td>{p.passageiros.map((x) => x.nome.split(' ')[0]).join(', ')}</td>
                  <td><StatusBadge s={p.status} /></td>
                  <td className="row-actions"><Button variant="outline" className="btn-sm">Abrir</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

// =========================================================================== formulário
const DOCS = ['cpf', 'rg', 'nascimento', 'telefone'];
const vazio = () => ({ pessoa_id: null, nome: '', cpf: '', rg: '', nascimento: '', email: '', telefone: '', bu: '', poltrona: '', guardado: {}, mascara: {} });
// Pessoa do banco: os documentos já guardados não vêm para a tela (só mascarados); o servidor completa ao enviar.
const daPessoa = (p) => {
  const guardado = Object.fromEntries(DOCS.map((k) => [k, !!p[`tem_${k}`]]));
  return {
    pessoa_id: p.id || null, nome: p.nome || '', email: p.email || '', bu: p.bu || '', poltrona: '',
    cpf: '', rg: '', nascimento: '', telefone: '', guardado, mascara: { cpf: p.cpf, rg: p.rg, telefone: p.telefone },
  };
};
const maskTel = (v) => {
  const d = String(v).replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

/** Busca no banco de pessoas da Contratação; ao escolher, os dados entram preenchidos. */
function BuscaPessoa({ api, onEscolher, onFechar, jaNaLista }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return undefined; }
    const t = setTimeout(() => api.get(`/pessoas?q=${encodeURIComponent(q)}`).then(setRes).catch(() => setRes([])), 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Card className="vg-busca">
      <div className="vg-busca-top">
        <div className="search"><Search size={16} /><input autoFocus placeholder="Buscar no banco de pessoas (nome ou e-mail)" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Button type="button" variant="outline" onClick={() => onEscolher(null)}><UserPlus size={15} /> Pessoa sem cadastro</Button>
        <button type="button" className="vg-icon-btn" onClick={onFechar} aria-label="Fechar busca"><X size={17} /></button>
      </div>
      <div className="vg-pessoas">
        {res.map((p) => {
          const tem = jaNaLista(p);
          return (
            <button type="button" key={p.id} className={`vg-pessoa ${p.demitido ? 'vg-demitido' : ''}`} disabled={tem} onClick={() => onEscolher(p)}>
              <b>{p.nome}{p.demitido && <span className="vg-tag-dem">Demitido</span>}{tem && <span className="muted small"> · já na lista</span>}</b>
              <span className="muted small">{[p.cpf, p.email, p.funcao, p.cidade].filter(Boolean).join(' · ') || 'Sem detalhes'}</span>
            </button>
          );
        })}
        {q.trim().length >= 2 && !res.length && <span className="muted small">Ninguém encontrado. Use “Pessoa sem cadastro” — ela entra no banco de pessoas ao enviar.</span>}
        {q.trim().length < 2 && <span className="muted small">Digite pelo menos 2 letras.</span>}
      </div>
    </Card>
  );
}

function CartaoPassageiro({ i, x, bus, onChange, onRemover, podeRemover, eu }) {
  const set = (k, v) => onChange({ ...x, [k]: v });
  const cpfRuim = x.cpf.replace(/\D/g, '').length === 11 && !cpfValido(x.cpf);
  // documento já guardado no cadastro: mostra mascarado e não deixa trocar (correção de cadastro é com o RH)
  const noCadastro = (k) => x.guardado?.[k] && (
    <input value={x.mascara?.[k] || 'Guardado no cadastro'} disabled title="Já está no cadastro. Para corrigir, fale com o RH." />
  );
  return (
    <div className="vg-pass">
      <div className="vg-pass-head">
        <b>{i + 1}. {x.nome || 'Passageiro'}</b>
        {eu && <span className="muted small">você</span>}
        {x.pessoa_id ? <span className="vg-tag-banco">do banco de pessoas</span> : <span className="vg-tag-novo">novo cadastro</span>}
        <span style={{ flex: 1 }} />
        {podeRemover && <button type="button" className="vg-link vg-link-danger" onClick={onRemover}><X size={14} /> Remover</button>}
      </div>
      <Field label="Nome completo *"><input value={x.nome} onChange={(e) => set('nome', e.target.value)} /></Field>
      <div className="vg-grid-4">
        <Field label="CPF *" hint={cpfRuim ? <span className="vg-err">CPF inválido</span> : null}>
          {noCadastro('cpf') || <input value={x.cpf} onChange={(e) => set('cpf', maskCpf(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" className={cpfRuim ? 'vg-invalido' : ''} />}
        </Field>
        <Field label="RG *">{noCadastro('rg') || <input value={x.rg} onChange={(e) => set('rg', e.target.value)} />}</Field>
        <Field label="Data de nascimento *">{noCadastro('nascimento') || <input type="date" value={x.nascimento} max={hoje()} onChange={(e) => set('nascimento', e.target.value)} />}</Field>
        <Field label="E-mail *"><input type="email" value={x.email} onChange={(e) => set('email', e.target.value)} /></Field>
      </div>
      <div className="vg-grid-4">
        <Field label="Telefone para contato *">{noCadastro('telefone') || <input value={x.telefone} onChange={(e) => set('telefone', maskTel(e.target.value))} inputMode="tel" placeholder="(00) 00000-0000" />}</Field>
        <div className="vg-span-2">
          <Field label="BU *">
            <select value={x.bu} onChange={(e) => set('bu', e.target.value)}>
              <option value="">Selecione…</option>
              {bus.map((b) => <option key={b}>{b}</option>)}
              {x.bu && !bus.includes(x.bu) && <option value={x.bu}>{x.bu} (inativa)</option>}
            </select>
          </Field>
        </div>
        <Field label="Poltrona preferida" hint="Opcional. A central tentará atender; não é garantido.">
          <input value={x.poltrona} onChange={(e) => set('poltrona', e.target.value)} maxLength={10} />
        </Field>
      </div>
    </div>
  );
}

function PedidoForm({ module, api }) {
  const base = `/m/${module.key}/solicitante`;
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [run, busy] = useAction();
  const [bus, setBus] = useState([]);
  const [erro, setErro] = useState('');
  const [orig, setOrig] = useState(null);
  const [eu, setEu] = useState(null);
  const [busca, setBusca] = useState(false);
  const [f, setF] = useState({ origem: '', origem_uf: 'SP', destino: '', destino_uf: 'SP', transporte: 'onibus', data_ida: '', data_volta: '', horario: '', obs: '', passageiros: [] });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    api.get('/opcoes').then((o) => setBus(o.bus)).catch((e) => setErro(e.message));
    if (id) {
      api.get(`/pedidos/${id}`).then((p) => {
        setOrig(p);
        setF({
          origem: p.origem, origem_uf: p.origem_uf, destino: p.destino, destino_uf: p.destino_uf, transporte: p.transporte,
          data_ida: p.data_ida, data_volta: p.data_volta || '', horario: p.horario, obs: p.obs || '',
          passageiros: p.passageiros.map((x) => ({ ...daPessoa({ ...x, id: x.pessoa_id }), poltrona: x.poltrona || '' })),
        });
      }).catch((e) => setErro(e.message));
    } else {
      // 1º passageiro: a própria pessoa, já com os dados do banco de pessoas
      api.get('/eu').then((p) => { setEu(p); setF((x) => ({ ...x, passageiros: x.passageiros.length ? x.passageiros : [daPessoa(p)] })); }).catch(() => {});
    }
  }, [id]);

  const editavel = !id || ['pendente', 'recusado'].includes(orig?.status);
  const jaNaLista = (p) => f.passageiros.some((x) => x.pessoa_id && x.pessoa_id === p.id);
  const adicionar = (p) => {
    if (p?.demitido) toast(`${p.nome} está como demitido(a) na Contratação.`, 'erro');
    set('passageiros', [...f.passageiros, p ? daPessoa(p) : vazio()]);
    setBusca(false);
  };
  const ehEu = (x) => !!eu && ((eu.id && x.pessoa_id === eu.id) || (!eu.id && norm(x.email) === norm(eu.email)));

  const enviar = async () => {
    setErro('');
    const origem = cidadeOficial(f.origem, f.origem_uf);
    const destino = cidadeOficial(f.destino, f.destino_uf);
    if (!f.passageiros.length) return setErro('Adicione pelo menos um passageiro.');
    if (!origem) return setErro(`Cidade de saída: escolha uma cidade de ${f.origem_uf} na lista.`);
    if (!destino) return setErro(`Cidade de destino: escolha uma cidade de ${f.destino_uf} na lista.`);
    const body = { ...f, origem, destino, data_volta: f.data_volta || null };
    const r = await run(() => (id ? api.put(`/meus/${id}`, body) : api.post('/meus', body)),
      (x) => (id ? `Pedido ${x.codigo} atualizado e enviado à central` : `Pedido ${x.codigo} enviado à central`));
    if (r) navigate(`${base}/pedido/${r.id}`);
  };

  if (id && orig && !editavel) {
    return <><PageHeader title={orig.codigo} back={`${base}/pedido/${id}`} /><Alert>Este pedido está “{STATUS[orig.status]?.label}” e não pode mais ser editado.</Alert></>;
  }

  return (
    <div className="vg-form">
      <PageHeader title={id ? `${orig?.codigo || ''} · ${orig?.status === 'recusado' ? 'corrigir e reenviar' : 'editar'}` : 'Nova viagem'}
        subtitle="Campos com * são obrigatórios" back={id ? `${base}/pedido/${id}` : base} />
      {orig?.status === 'recusado' && orig.motivo_recusa && <Alert kind="warning">Recusado pela central: {orig.motivo_recusa}</Alert>}

      <Card>
        <div className="form-grid">
          <h3 className="vg-h">1. Passageiros <span className="muted small">({f.passageiros.length})</span></h3>
          <p className="muted small vg-m0">Os dados vêm do banco de pessoas da Contratação. O que você completar aqui fica salvo para a próxima viagem.</p>
          {f.passageiros.map((x, i) => (
            <CartaoPassageiro key={i} i={i} x={x} bus={bus} eu={ehEu(x)} podeRemover={f.passageiros.length > 1 || !ehEu(x)}
              onChange={(nx) => set('passageiros', f.passageiros.map((y, j) => (j === i ? nx : y)))}
              onRemover={() => set('passageiros', f.passageiros.filter((_, j) => j !== i))} />
          ))}
          {busca
            ? <BuscaPessoa api={api} onEscolher={adicionar} onFechar={() => setBusca(false)} jaNaLista={jaNaLista} />
            : <div><Button type="button" variant="outline" onClick={() => setBusca(true)}><UserPlus size={15} /> Adicionar pessoa</Button></div>}
        </div>
      </Card>

      <Card>
        <div className="form-grid">
          <h3 className="vg-h">2. Dados da viagem</h3>
          <div className="grid-2">
            <Field label="Cidade de saída *"><CidadeInput cidade={f.origem} uf={f.origem_uf} onChange={({ cidade, uf }) => setF((x) => ({ ...x, origem: cidade, origem_uf: uf }))} /></Field>
            <Field label="Cidade de destino *"><CidadeInput cidade={f.destino} uf={f.destino_uf} onChange={({ cidade, uf }) => setF((x) => ({ ...x, destino: cidade, destino_uf: uf }))} /></Field>
          </div>
          <Field label="Tipo de transporte *">
            <div className="vg-opcoes">
              {Object.entries(TRANSPORTE).map(([k, l]) => (
                <label key={k} className={`vg-opcao ${f.transporte === k ? 'on' : ''}`}>
                  <input type="radio" name="transporte" checked={f.transporte === k} onChange={() => set('transporte', k)} />
                  <IconeTransporte t={k} /> {l}
                </label>
              ))}
            </div>
          </Field>
          <div className="vg-grid-3">
            <Field label="Data em que precisa sair *"><input type="date" value={f.data_ida} min={hoje()} onChange={(e) => set('data_ida', e.target.value)} /></Field>
            <Field label="Data de volta" hint="Deixe em branco se for só ida."><input type="date" value={f.data_volta} min={f.data_ida || hoje()} onChange={(e) => set('data_volta', e.target.value)} /></Field>
            <Field label="Horário de saída *"><input type="time" value={f.horario} onChange={(e) => set('horario', e.target.value)} /></Field>
          </div>
          <Field label="Observações"><textarea rows={3} value={f.obs} onChange={(e) => set('obs', e.target.value)} placeholder="Opcional" /></Field>
        </div>
      </Card>

      <Alert>{erro}</Alert>
      <div className="vg-form-actions">
        <Button variant="outline" onClick={() => navigate(id ? `${base}/pedido/${id}` : base)}>Voltar</Button>
        <Button onClick={enviar} disabled={busy}><Send size={15} /> {busy ? 'Enviando…' : id ? 'Salvar e enviar' : 'Enviar pedido'}</Button>
      </div>
    </div>
  );
}

// =========================================================================== detalhe
function PedidoDetalhe({ module, api }) {
  const base = `/m/${module.key}/solicitante`;
  const { id } = useParams();
  const navigate = useNavigate();
  const confirmar = useConfirm();
  const [run, busy] = useAction();
  const [p, setP] = useState(null);
  const [erro, setErro] = useState('');
  const load = () => api.get(`/pedidos/${id}`).then(setP).catch((e) => setErro(e.message));
  useEffect(() => { load(); }, [id]);
  const total = useMemo(() => p?.valor_total, [p]);

  if (erro) return <><PageHeader title="Viagem" back={base} /><Alert>{erro}</Alert></>;
  if (!p) return <Empty>Carregando…</Empty>;
  const podeEditar = ['pendente', 'recusado'].includes(p.status);
  const podeCancelar = ['pendente', 'recusado', 'agendando'].includes(p.status);

  const cancelar = async () => {
    if (!await confirmar({ titulo: `Cancelar a viagem ${p.codigo}?`, mensagem: 'A central deixa de agendar as passagens.', confirmar: 'Cancelar viagem', cancelar: 'Voltar', perigo: true })) return;
    if (await run(() => api.post(`/meus/${p.id}/cancelar`), 'Viagem cancelada')) load();
  };

  return (
    <>
      <PageHeader title={p.codigo} subtitle={trecho(p)} back={base}
        actions={<div className="tags">
          <StatusBadge s={p.status} />
          {podeEditar && <Button variant="outline" onClick={() => navigate(`${base}/editar/${p.id}`)}><Pencil size={15} /> {p.status === 'recusado' ? 'Corrigir e reenviar' : 'Editar'}</Button>}
          {podeCancelar && <Button variant="danger" onClick={cancelar} disabled={busy}><XCircle size={15} /> Cancelar</Button>}
        </div>} />
      {p.status === 'recusado' && <Alert kind="warning">Recusado pela central: {p.motivo_recusa}</Alert>}
      {p.status === 'pendente' && <Alert kind="info">Aguardando a central aceitar o pedido.</Alert>}
      {p.status === 'agendando' && <Alert kind="info">A central aceitou e está agendando as passagens.</Alert>}
      {p.status === 'agendado' && <Alert kind="success">Viagem agendada{total != null ? ` · total ${money(total)}` : ''}. As passagens estão abaixo.</Alert>}

      <ResumoViagem p={p} />
      {p.status === 'agendado' && (
        <>
          <h3 className="vg-section">Passagens</h3>
          <Card><Passagens module={module} anexos={p.anexos} />{p.obs_central && <p className="vg-obs-central"><b>Observação da central:</b> {p.obs_central}</p>}</Card>
        </>
      )}
      <h3 className="vg-section">Passageiros ({p.passageiros.length})</h3>
      <TabelaPassageiros passageiros={p.passageiros} mostrarPassagem={p.status === 'agendado'} />
      <Historico itens={p.historico} />
    </>
  );
}

export default function Solicitante(props) {
  return (
    <Routes>
      <Route index element={<MinhasViagens {...props} />} />
      <Route path="novo" element={<PedidoForm {...props} />} />
      <Route path="editar/:id" element={<PedidoForm {...props} />} />
      <Route path="pedido/:id" element={<PedidoDetalhe {...props} />} />
    </Routes>
  );
}
