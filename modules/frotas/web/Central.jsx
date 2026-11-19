import { useEffect, useMemo, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import {
  Check, X, CalendarCheck, Car, Camera, Save, RefreshCw, UserRoundCog, CircleX, FileSpreadsheet, History, Plus, Eye, EyeOff, Search, RotateCcw,
} from 'lucide-react';
import {
  Button, Card, Empty, Field, FiltroSelect, Modal, PageHeader, fmtDate, fmtDateTime, money, norm, todayISO, useAction, useConfirm, usePrompt, useToast,
} from '@hub';
import { Colaboradores, FotosCarro, Opcoes, Status, TipoChamado, TrocaForm, km, placaFmt, useConfig, veic } from './shared.jsx';

const dias = (s) => {
  const d = Math.floor((Date.now() - new Date(String(s).replace(' ', 'T') + 'Z')) / 86400000);
  return d <= 0 ? 'Hoje' : d === 1 ? '1 dia atrás' : `${d} dias atrás`;
};

// =========================================================================== aprovações
const FILTROS = [
  { k: 'novo', label: 'Novo veículo', cls: 'azul' },
  { k: 'manutencao', label: 'Manutenção', cls: 'laranja' },
  { k: 'substituicao', label: 'Substituição', cls: 'roxo' },
  { k: 'troca', label: 'Troca', cls: 'vermelho' },
  { k: 'encerramento', label: 'Encerramento', cls: 'verde' },
];

function Aprovacoes({ api }) {
  const [d, setD] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [run, busy] = useAction();
  const perguntar = usePrompt();
  const load = () => api.get('/central/aprovacoes').then(setD);
  useEffect(() => { load(); }, []);

  const qtd = (k) => (!d ? 0 : k === 'novo' ? d.lotes.reduce((s, l) => s + l.pedidos.length, 0) : d.chamados.filter((c) => c.tipo === k).length);
  const lotes = !d || (filtro && filtro !== 'novo') ? [] : d.lotes;
  const chamados = !d || filtro === 'novo' ? [] : d.chamados.filter((c) => !filtro || c.tipo === filtro);

  const aprovarLote = async (l) => { if (await run(() => api.post('/central/pedidos/aprovar', { ids: l.pedidos.map((p) => p.id) }), (r) => `${r.aprovados} pedido(s) aprovado(s)`)) load(); };
  const reprovarLote = async (l) => {
    const motivo = await perguntar({ titulo: `Reprovar ${l.pedidos.length} pedido(s)?`, mensagem: `${l.solicitante_nome} · ${l.local} · ${l.categoria} · ${fmtDate(l.data_retirada)}`, label: 'Motivo da reprovação', obrigatorio: true, confirmar: 'Reprovar', perigo: true });
    if (motivo && await run(() => api.post('/central/pedidos/reprovar', { ids: l.pedidos.map((p) => p.id), motivo }), (r) => `${r.reprovados} pedido(s) reprovado(s)`)) load();
  };
  const aprovarChamado = async (c) => { if (await run(() => api.post(`/central/chamados/${c.id}/aprovar`), c.tipo === 'substituicao' ? 'Substituição liberada para o solicitante' : 'Chamado aprovado · vá em Chamados para agendar')) load(); };
  const reprovarChamado = async (c) => {
    const motivo = await perguntar({ titulo: `Reprovar ${c.codigo}?`, mensagem: `${c.tipo_label} · ${c.modelo || ''} ${c.placa || ''}`, label: 'Motivo da reprovação', obrigatorio: true, confirmar: 'Reprovar', perigo: true });
    if (motivo && await run(() => api.post(`/central/chamados/${c.id}/reprovar`, { motivo }), 'Chamado reprovado')) load();
  };

  return (
    <>
      <PageHeader title="Aprovações" subtitle="Pedidos de veículo novo e chamados da frota esperando decisão." back="/" />
      <div className="fr-chips fr-mb">
        {FILTROS.map((f) => (
          <button key={f.k} className={`fr-chip fr-chip-${f.cls} ${filtro === f.k ? 'on' : ''}`} onClick={() => setFiltro(filtro === f.k ? '' : f.k)}>{f.label} <b>{qtd(f.k)}</b></button>
        ))}
      </div>
      {!d ? <Empty>Carregando…</Empty> : (
        <div className="fr-duas">
          <Card className="fr-coluna">
            <div className="fr-coluna-head">Novo veículo <span className="fr-bolha">{qtd('novo')}</span></div>
            {!lotes.length ? <Empty>{filtro && filtro !== 'novo' ? 'Filtro de chamados ativo.' : 'Nenhum pedido de veículo pendente.'}</Empty> : lotes.map((l) => (
              <div key={l.chave} className="fr-apcard">
                <div className="fr-apcard-top">
                  <span><b>Solicitante:</b> {l.solicitante_nome} · <b>Pedido:</b> {fmtDateTime(l.enviado_at)}</span>
                  <span className="fr-qtd">Qtde: {l.pedidos.length}</span>
                </div>
                <div className="fr-apgrid">
                  <span><b>Retirada:</b> {fmtDate(l.data_retirada)}</span>
                  <span><b>Retirada em:</b> {l.local}</span>
                  <span><b>Categoria:</b> {l.categoria}</span>
                  <span><b>Motorista:</b> {l.pedidos.map((p) => p.motorista).filter(Boolean).join(', ') || '—'}</span>
                </div>
                <div><b>Motivo:</b> {l.motivo || '—'}</div>
                <div className="small muted">{l.pedidos.map((p) => p.codigo).join(' · ')}</div>
                <div className="fr-apacoes">
                  <Button className="btn-sm" onClick={() => aprovarLote(l)} disabled={busy}><Check size={14} /> Aprovar</Button>
                  <Button className="btn-sm btn-perigo" onClick={() => reprovarLote(l)} disabled={busy}><X size={14} /> Reprovar</Button>
                </div>
              </div>
            ))}
          </Card>
          <Card className="fr-coluna">
            <div className="fr-coluna-head">Chamados frotas <span className="fr-bolha">{d.chamados.length}</span></div>
            {!chamados.length ? <Empty>Nenhum chamado de frota pendente.</Empty> : chamados.map((c) => (
              <div key={c.id} className="fr-apcard">
                <div className="fr-apcard-top"><TipoChamado c={c} /><span className="small muted">{c.codigo} · {dias(c.created_at)}</span></div>
                <div className="fr-apgrid">
                  <span><b>Veículo:</b> {c.modelo || '—'} · {c.placa || '—'}</span>
                  <span><b>Motorista atual:</b> {c.motorista || '—'}</span>
                  <span><b>Solicitante:</b> {c.solicitante_nome}</span>
                  <span><b>Reserva:</b> {c.codigo_reserva || '—'} · {c.local}</span>
                  {c.tipo === 'manutencao' && <span><b>Tipo:</b> {c.tipo_manutencao}</span>}
                  {c.tipo === 'substituicao' && <span><b>Novo condutor:</b> {c.condutor_novo}</span>}
                  {c.tipo === 'substituicao' && <span><b>Início do novo motorista:</b> {fmtDate(c.data_inicio_nova)}</span>}
                  {c.tipo === 'troca' && <span><b>Data desejada:</b> {fmtDate(c.data_inicio_nova)} · {c.local_servico}</span>}
                  {c.tipo === 'encerramento' && <span><b>Devolução:</b> {fmtDate(c.data_devolucao)} · km {km(c.km_devolucao)}</span>}
                </div>
                <div><b>Motivo:</b> {c.motivo}</div>
                <div className="fr-apacoes">
                  <Button className="btn-sm" onClick={() => aprovarChamado(c)} disabled={busy}><Check size={14} /> Aprovar</Button>
                  <Button className="btn-sm btn-perigo" onClick={() => reprovarChamado(c)} disabled={busy}><X size={14} /> Reprovar</Button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}
    </>
  );
}

// =========================================================================== reservas (novos pedidos aprovados)
function LinhaReserva({ p, cfg, api, onChange }) {
  const [e, setE] = useState({ codigo_reserva: p.codigo_reserva || '', modalidade: p.modalidade || '', valor_contrato: p.valor_contrato ?? '', data_retirada: p.data_retirada, categoria: p.categoria, motorista: p.motorista || '' });
  const [run, busy] = useAction();
  const set = (k) => (ev) => setE({ ...e, [k]: ev.target.value });
  const sujo = p.status === 'reservado' && (e.codigo_reserva !== (p.codigo_reserva || '') || e.modalidade !== (p.modalidade || '') || String(e.valor_contrato) !== String(p.valor_contrato ?? '')
    || e.data_retirada !== p.data_retirada || e.categoria !== p.categoria || e.motorista !== (p.motorista || ''));
  const pronto = e.codigo_reserva.trim() && e.modalidade && String(e.valor_contrato).trim();
  const reservar = async () => { if (await run(() => api.post(`/central/pedidos/${p.id}/reservar`, e), p.status === 'reservado' ? 'Alterações salvas' : `Reserva ${e.codigo_reserva} registrada`)) onChange(); };
  return (
    <tr className={sujo ? 'fr-sujo' : ''}>
      <td className="fr-mono">{p.codigo}<div className="small muted">{p.solicitante_nome}</div></td>
      <td><input type="date" value={e.data_retirada} onChange={set('data_retirada')} /></td>
      <td>{p.local}</td>
      <td><select value={e.categoria} onChange={set('categoria')}><Opcoes lista={cfg.categorias} /></select></td>
      <td><input list="fr-colab-res" value={e.motorista} onChange={set('motorista')} placeholder="—" /></td>
      <td><Status s={p.status} label={p.status_label} /></td>
      <td><input value={e.codigo_reserva} onChange={set('codigo_reserva')} placeholder="Código" className="fr-in-sm" /></td>
      <td><select value={e.modalidade} onChange={set('modalidade')}><Opcoes lista={cfg.modalidades} /></select></td>
      <td><input inputMode="decimal" value={e.valor_contrato} onChange={set('valor_contrato')} placeholder="0,00" className="fr-in-sm" /></td>
      <td className="fr-acts">
        {p.status === 'aprovado'
          ? <Button className="btn-sm" onClick={reservar} disabled={busy || !pronto}><Check size={14} /> Reservar</Button>
          : <Button className="btn-sm" variant="outline" onClick={reservar} disabled={busy || !sujo || !pronto}><Save size={14} /> Salvar</Button>}
      </td>
      <td className="fr-motivo small">{p.motivo || '—'}</td>
    </tr>
  );
}

function Reservas({ api }) {
  const cfg = useConfig(api);
  const [lista, setLista] = useState(null);
  const [f, setF] = useState({ local: '', status: '' });
  const load = () => api.get('/central/reservas').then(setLista);
  useEffect(() => { load(); }, []);
  const all = lista || [];
  const vis = all.filter((p) => (!f.local || p.local === f.local) && (!f.status || p.status === f.status));
  return (
    <>
      <PageHeader title="Novos pedidos" subtitle="Pedidos aprovados: registre a reserva feita com a locadora (código, modalidade e valor)." back="/" />
      <div className="fr-barra">
        <div className="fr-filtros">
          <FiltroSelect label="Local" value={f.local} onChange={(v) => setF({ ...f, local: v })} options={cfg?.locais || []} />
          <FiltroSelect label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: 'aprovado', label: 'Aprovado' }, { value: 'reservado', label: 'Reservado' }]} />
          <Button variant="outline" className="btn-sm" onClick={load}><RotateCcw size={14} /> Atualizar</Button>
        </div>
        <div className="fr-chips">
          <button className={`fr-chip fr-chip-escuro ${f.status === 'aprovado' ? 'on' : ''}`} onClick={() => setF({ ...f, status: f.status === 'aprovado' ? '' : 'aprovado' })}>Aprovadas <b>{all.filter((p) => p.status === 'aprovado').length}</b></button>
          <button className={`fr-chip ${f.status === 'reservado' ? 'on' : ''}`} onClick={() => setF({ ...f, status: f.status === 'reservado' ? '' : 'reservado' })}>Reservados <b>{all.filter((p) => p.status === 'reservado').length}</b></button>
        </div>
      </div>
      <Card className="fr-card-tabela">
        {lista === null || !cfg ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>{all.length ? 'Nenhuma solicitação com esses filtros.' : 'Nenhuma solicitação aprovada ou reservada no momento.'}</Empty> : (
          <div className="fr-scroll">
            <table className="table fr-table">
              <thead><tr><th>Pedido</th><th>Data de retirada</th><th>Local de retirada</th><th>Categoria</th><th>Motorista</th><th>Status</th><th>Código reserva</th><th>Modalidade</th><th>Valor do contrato</th><th>Ações</th><th>Motivo</th></tr></thead>
              <tbody>{vis.map((p) => <LinhaReserva key={`${p.id}-${p.updated_at}`} p={p} cfg={cfg} api={api} onChange={load} />)}</tbody>
            </table>
            <Colaboradores id="fr-colab-res" lista={cfg.colaboradores} />
          </div>
        )}
      </Card>
    </>
  );
}

// =========================================================================== ativar veículo
function LinhaAtivar({ v, api, onChange, onFotos, motoristas }) {
  const [e, setE] = useState({ data_retirada: v.data_retirada || '', modelo: v.modelo || '', placa: v.placa || '', motorista: v.motorista || '', cartao: v.cartao || '', km_retirada: v.km_retirada ?? '' });
  const [run, busy] = useAction();
  const set = (k, fn = (x) => x) => (ev) => setE({ ...e, [k]: fn(ev.target.value) });
  // o motorista tem que ser uma pessoa do banco (mesma lista da Hospedagem)
  const motoristaOk = motoristas.has(norm(e.motorista.trim()));
  const dados = e.data_retirada && e.modelo.trim() && e.placa && motoristaOk && e.cartao.trim() && String(e.km_retirada) !== '';
  const fotosOk = !v.fotos_faltando?.length;
  // fotos são opcionais: o Ativar não depende delas
  const pronto = dados;
  const dica = e.motorista.trim() && !motoristaOk ? 'Escolha o motorista na lista do banco de pessoas' : !dados ? 'Preencha modelo, placa, motorista, cartão, km e data' : '';
  const ativar = async () => { if (await run(() => api.post(`/central/veiculos/${v.id}/ativar`, e), `Veículo ${e.placa} ativado · em uso`)) onChange(); };
  const salvar = async () => { if (await run(() => api.put(`/central/veiculos/${v.id}`, e), 'Rascunho do veículo salvo')) onChange(); };
  return (
    <tr>
      <td className="fr-mono">{v.codigo_reserva}<div className="small muted">{v.responsavel_nome}</div></td>
      <td>{v.local}</td><td>{v.categoria}</td>
      <td><input type="date" value={e.data_retirada} onChange={set('data_retirada')} /></td>
      <td><input value={e.modelo} onChange={set('modelo')} placeholder="Modelo" className="fr-in-sm" /></td>
      <td><input value={e.placa} onChange={set('placa', placaFmt)} placeholder="ABC-1234" className="fr-in-placa" /></td>
      <td><input list="fr-colab-at" value={e.motorista} onChange={set('motorista')} placeholder="Buscar pessoa" className={e.motorista.trim() && !motoristaOk ? 'fr-invalido' : ''}
        title={e.motorista.trim() && !motoristaOk ? 'Não está no banco de pessoas: escolha um nome da lista' : ''} /></td>
      <td><input value={e.cartao} onChange={set('cartao')} placeholder="Cartão" className="fr-in-sm" /></td>
      <td><input inputMode="numeric" value={e.km_retirada} onChange={set('km_retirada', (x) => x.replace(/\D/g, ''))} className="fr-in-km" /></td>
      <td className="fr-acts">
        <Button className="btn-sm" onClick={ativar} disabled={busy || !pronto} title={dica}><Car size={14} /> Ativar</Button>
        <Button className="btn-sm" variant="outline" onClick={salvar} disabled={busy}><Save size={14} /></Button>
        <Button className="btn-sm" variant="outline" onClick={onFotos} title={fotosOk ? 'Todas as fotos tiradas' : `Opcional · sem foto: ${v.fotos_faltando.join(', ')}`}>
          <Camera size={14} /> Fotos {v.fotos_angulos}/{v.fotos_total}
        </Button>
      </td>
    </tr>
  );
}

function Ativar({ api }) {
  const cfg = useConfig(api);
  const [lista, setLista] = useState(null);
  const [f, setF] = useState({ local: '', placa: '' });
  const [fotos, setFotos] = useState(null);
  const load = () => api.get('/central/veiculos?status=reservado').then(setLista);
  useEffect(() => { load(); }, []);
  const motoristas = useMemo(() => new Set((cfg?.colaboradores || []).map((n) => norm(n))), [cfg]);
  const vis = (lista || []).filter((v) => (!f.local || v.local === f.local) && (!f.placa || norm(v.placa).includes(norm(f.placa)) || norm(v.codigo_reserva).includes(norm(f.placa))));
  return (
    <>
      <PageHeader title="Ativar veículo" subtitle="Veículos reservados: na retirada, informe modelo, placa, motorista (do banco de pessoas), cartão e km para liberar o Ativar. As fotos (carro, triângulo, medidor de pneu, estepe e macaco) são recomendadas, mas não obrigatórias." back="/" />
      <div className="fr-barra">
        <div className="fr-filtros">
          <FiltroSelect label="Local" value={f.local} onChange={(v) => setF({ ...f, local: v })} options={cfg?.locais || []} />
          <label className="kit-filtro"><span>Placa / reserva</span><input value={f.placa} onChange={(e) => setF({ ...f, placa: e.target.value })} placeholder="ABC-1234" /></label>
          <Button variant="outline" className="btn-sm" onClick={load}><RotateCcw size={14} /> Atualizar</Button>
        </div>
        <div className="fr-chips"><span className="fr-chip fr-chip-escuro on">Reservados <b>{(lista || []).length}</b></span></div>
      </div>
      <Card className="fr-card-tabela">
        {lista === null || !cfg ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>{lista.length ? 'Nenhum veículo corresponde aos filtros.' : 'Nenhum veículo reservado aguardando ativação.'}</Empty> : (
          <div className="fr-scroll">
            <table className="table fr-table fr-acao-fixa">
              <thead><tr><th>Cód. reserva</th><th>Local</th><th>Categoria</th><th>Data retirada</th><th>Modelo</th><th>Placa</th><th>Motorista</th><th>Cartão abastecimento</th><th>Km retirada</th><th>Ações</th></tr></thead>
              <tbody>{vis.map((v) => <LinhaAtivar key={`${v.id}-${v.updated_at}`} v={v} api={api} onChange={load} onFotos={() => setFotos(v)} motoristas={motoristas} />)}</tbody>
            </table>
            <Colaboradores id="fr-colab-at" lista={cfg.colaboradores} />
          </div>
        )}
      </Card>
      {fotos && <FotosCarro veiculo={fotos} onClose={() => setFotos(null)} onChange={load} />}
    </>
  );
}

// =========================================================================== chamados aprovados (agendar)
function AgendarDialog({ api, c, cfg, placas, onClose, onDone }) {
  const [f, setF] = useState({ data_servico: c.data_servico || c.data_inicio_nova || c.data_devolucao || todayISO(), hora_servico: c.hora_servico || '', local_servico: c.local_servico || '', placa_devolucao: c.placa_devolucao || c.placa || '' });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const titulo = { troca: 'Trocar veículo', encerramento: 'Encerrar contrato', manutencao: 'Agendar manutenção' }[c.tipo];
  const orientacao = {
    troca: 'Confirme que o contato com a locadora foi feito e informe a data e a agência para comparecer.',
    encerramento: 'Confira os dados (local de devolução, km rodado) e confirme a data, o local e a placa a devolver.',
    manutencao: 'Informe a data, a hora e o local para comparecer.',
  }[c.tipo];
  const salvar = async () => { if (await run(() => api.post(`/central/chamados/${c.id}/agendar`, f), 'Agendamento confirmado · o solicitante foi avisado')) onDone(); };
  return (
    <Modal title={titulo} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={salvar} disabled={busy}><CalendarCheck size={15} /> Confirmar</Button></>}>
      <p className="small muted fr-m0">{c.codigo} · {veic(c)} · {c.motorista} · {c.solicitante_nome}</p>
      <p className="small">{orientacao}</p>
      {c.tipo === 'encerramento' && <p className="small">Solicitante informou devolução em <b>{fmtDate(c.data_devolucao)}</b> com <b>{km(c.km_devolucao)} km</b>.</p>}
      <div className="fr-grid2">
        <Field label="Data *"><input type="date" value={f.data_servico} onChange={set('data_servico')} /></Field>
        {c.tipo === 'manutencao' && <Field label="Hora *"><select value={f.hora_servico} onChange={set('hora_servico')}><Opcoes lista={cfg.horas} /></select></Field>}
        {c.tipo === 'encerramento' && (
          <Field label="Placa a devolver *" hint={f.placa_devolucao && f.placa_devolucao !== c.placa ? 'Diferente da placa do chamado: o solicitante será orientado a devolver esta.' : ''}>
            <input list="fr-placas" value={f.placa_devolucao} onChange={(e) => setF({ ...f, placa_devolucao: placaFmt(e.target.value) })} />
            <datalist id="fr-placas">{placas.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
        )}
      </div>
      <Field label={c.tipo === 'manutencao' ? 'Local da manutenção *' : c.tipo === 'troca' ? 'Agência / local da troca *' : 'Local de devolução *'}>
        <input value={f.local_servico} onChange={set('local_servico')} />
      </Field>
    </Modal>
  );
}

function Chamados({ api }) {
  const cfg = useConfig(api);
  const [lista, setLista] = useState(null);
  const [todos, setTodos] = useState(false);
  const [placas, setPlacas] = useState([]);
  const [sel, setSel] = useState(null);
  const load = () => api.get(`/central/chamados${todos ? '?todos=1' : ''}`).then(setLista);
  useEffect(() => { load(); }, [todos]);
  useEffect(() => { api.get('/central/veiculos?status=em_uso').then((vs) => setPlacas(vs.map((v) => v.placa).filter(Boolean))); }, []);
  const aguardando = (lista || []).filter((c) => c.status === 'aprovado' && c.tipo !== 'substituicao').length;
  return (
    <>
      <PageHeader title="Chamados" subtitle="Chamados aprovados: agende com a locadora. Substituição de condutor é liberada direto na aprovação." back="/"
        actions={<Button variant="outline" onClick={() => setTodos(!todos)}>{todos ? <><EyeOff size={15} /> Só em aberto</> : <><Eye size={15} /> Ver todos</>}</Button>} />
      <div className="fr-chips fr-mb">
        <span className="fr-chip fr-chip-escuro on">Aguardando agendamento <b>{aguardando}</b></span>
        <span className="fr-chip">Agendados <b>{(lista || []).filter((c) => c.status === 'agendado').length}</b></span>
      </div>
      <Card className="fr-card-tabela">
        {lista === null || !cfg ? <Empty>Carregando…</Empty> : !lista.length ? <Empty>Nenhum chamado aprovado aguardando a central.</Empty> : (
          <div className="fr-scroll">
            <table className="table fr-table">
              <thead><tr><th>Chamado</th><th>Veículo · placa</th><th>Contrato</th><th>Solicitante</th><th>Solicitação</th><th>Detalhe</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <td className="fr-mono">{c.codigo}</td>
                    <td className="cell-strong fr-nowrap">{c.modelo || '—'} · {c.placa || '—'}<div className="small muted">{c.motorista}</div></td>
                    <td className="small fr-nowrap">Reserva {c.codigo_reserva || '—'} · {c.modalidade || '—'}<div className="muted">{c.local} · desde {fmtDate(c.inicio_contrato)}</div></td>
                    <td className="small">{c.solicitante_nome}</td>
                    <td><TipoChamado c={c} /></td>
                    <td className="small fr-motivo">
                      Motivo: {c.motivo}
                      {c.tipo_manutencao && <> · {c.tipo_manutencao}</>}
                      {c.data_inicio_nova && c.tipo === 'troca' && <> · Data: {fmtDate(c.data_inicio_nova)} · Local: {c.local_servico}</>}
                      {c.status === 'agendado' && c.data_servico && <div><b>Agendado:</b> {fmtDate(c.data_servico)}{c.hora_servico ? ` ${c.hora_servico}` : ''} · {c.local_servico}{c.placa_devolucao ? ` · devolver ${c.placa_devolucao}` : ''}</div>}
                      {c.resultado && <div><b>Resultado:</b> {c.resultado}</div>}
                    </td>
                    <td><Status s={c.status} label={c.status_label} /></td>
                    <td className="fr-acts">
                      {['aprovado', 'agendado'].includes(c.status) && c.tipo !== 'substituicao' && (
                        <Button className="btn-sm" variant={c.status === 'agendado' ? 'outline' : 'primary'} onClick={() => setSel(c)}>
                          <CalendarCheck size={14} /> {c.status === 'agendado' ? 'Reagendar' : 'Confirmar'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {sel && <AgendarDialog api={api} c={sel} cfg={cfg} placas={placas} onClose={() => setSel(null)} onDone={() => { setSel(null); load(); }} />}
    </>
  );
}

// =========================================================================== controle mestre
const CAMPOS = ['codigo_reserva', 'local', 'categoria', 'modalidade', 'valor_contrato', 'motorista', 'placa', 'modelo', 'cartao', 'data_retirada', 'km_retirada', 'data_devolucao', 'km_devolucao', 'status'];

function OperacaoDialog({ api, v, tipo, cfg, onClose, onDone }) {
  const [f, setF] = useState({ data_devolucao: todayISO(), data_inicio: todayISO(), data_saida: todayISO() });
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k, val) => setF((x) => ({ ...x, [k]: val }));
  const rota = { troca: 'troca', substituir: 'substituir', encerrar: 'encerrar' }[tipo];
  const salvar = async () => {
    setBusy(true); setErro('');
    try {
      const r = await api.post(`/central/veiculos/${v.id}/${rota}`, f);
      toast(tipo === 'troca' ? `Troca registrada: placa ${r.placa} vinculada à reserva ${v.codigo_reserva}` : tipo === 'substituir' ? `Condutor substituído: ${f.condutor_novo}` : `Contrato encerrado · placa ${v.placa}`);
      onDone();
    } catch (e) { setErro(e.message); } finally { setBusy(false); }
  };
  const titulo = { troca: 'Trocar veículo (placa)', substituir: 'Substituir condutor', encerrar: 'Fechar contrato' }[tipo];
  return (
    <Modal title={titulo} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button className={tipo === 'encerrar' ? 'btn-perigo' : ''} onClick={salvar} disabled={busy}>Confirmar</Button></>}>
      {erro && <div className="alert alert-error">{erro}</div>}
      <p className="small muted fr-m0">Reserva {v.codigo_reserva} · placa atual {v.placa || '—'} · {v.motorista || '—'}</p>
      {tipo === 'troca' && <TrocaForm v={v} f={f} set={set} comMotivo />}
      {tipo === 'substituir' && (
        <>
          <div className="fr-grid2">
            <Field label="Fim do condutor atual *"><input type="date" value={f.data_saida} onChange={(e) => set('data_saida', e.target.value)} /></Field>
            <Field label="Início do novo condutor *"><input type="date" value={f.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} /></Field>
          </div>
          <Field label="Novo condutor *"><input list="fr-colab-op" value={f.condutor_novo || ''} onChange={(e) => set('condutor_novo', e.target.value)} /></Field>
          <Colaboradores id="fr-colab-op" lista={cfg.colaboradores} />
          <Field label="Km atual" hint="Opcional — se vazio, mantém o km de retirada"><input inputMode="numeric" value={f.km_atual || ''} onChange={(e) => set('km_atual', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Motivo *"><textarea rows={2} value={f.motivo || ''} onChange={(e) => set('motivo', e.target.value)} /></Field>
        </>
      )}
      {tipo === 'encerrar' && (
        <>
          <div className="fr-grid2">
            <Field label="Km de devolução *" hint={`Retirada com ${km(v.km_retirada)} km`}><input inputMode="numeric" value={f.km_devolucao || ''} onChange={(e) => set('km_devolucao', e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label="Data de devolução *"><input type="date" value={f.data_devolucao} onChange={(e) => set('data_devolucao', e.target.value)} /></Field>
          </div>
          <Field label="Motivo *"><textarea rows={2} value={f.motivo || ''} onChange={(e) => set('motivo', e.target.value)} /></Field>
        </>
      )}
    </Modal>
  );
}

function HistoricoDialog({ api, v, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/central/veiculos/${v.id}/historico`).then(setD); }, [v.id]);
  return (
    <Modal title={`Contrato ${v.codigo_reserva || ''}`} onClose={onClose} wide>
      {!d ? <Empty>Carregando…</Empty> : (
        <>
          <h4 className="fr-h4">Placas e condutores do contrato</h4>
          <table className="table fr-table fr-table-mini">
            <thead><tr><th>Placa</th><th>Modelo</th><th>Motorista</th><th>Retirada</th><th>Km</th><th>Devolução</th><th>Km</th><th>Status</th></tr></thead>
            <tbody>{d.veiculos.map((x) => (
              <tr key={x.id} className={x.id === v.id ? 'fr-atual' : ''}><td>{x.placa || '—'}</td><td>{x.modelo || '—'}</td><td>{x.motorista || '—'}</td><td>{fmtDate(x.data_retirada)}</td><td>{km(x.km_retirada)}</td>
                <td>{fmtDate(x.data_devolucao)}</td><td>{km(x.km_devolucao)}</td><td><Status s={x.status} label={x.status_label} /></td></tr>
            ))}</tbody>
          </table>
          {d.chamados.length > 0 && <>
            <h4 className="fr-h4">Chamados</h4>
            <table className="table fr-table fr-table-mini">
              <thead><tr><th>Chamado</th><th>Tipo</th><th>Aberto</th><th>Status</th><th>Resultado</th></tr></thead>
              <tbody>{d.chamados.map((c) => <tr key={c.id}><td>{c.codigo}</td><td><TipoChamado c={c} /></td><td>{fmtDateTime(c.created_at)}</td><td><Status s={c.status} label={c.status_label} /></td><td className="small">{c.resultado || c.resposta || '—'}</td></tr>)}</tbody>
            </table>
          </>}
          <h4 className="fr-h4">Histórico</h4>
          <ul className="fr-hist">{d.historico.map((h) => <li key={h.id}><span className="muted small">{fmtDateTime(h.created_at)} · {h.autor_nome}</span><b>{h.acao}</b>{h.detalhe && <span className="small">{h.detalhe}</span>}</li>)}</ul>
        </>
      )}
    </Modal>
  );
}

function LinhaMestre({ v, cfg, statusOpcoes, edicao, onEdit, onSalvar, onOp, onFotos, onHist, busy }) {
  const x = { ...v, ...(edicao || {}) };
  const set = (k, fn = (y) => y) => (ev) => onEdit(k, fn(ev.target.value));
  const emUso = v.status === 'em_uso';
  return (
    <tr className={`${edicao ? 'fr-sujo' : ''} ${v.encerramento ? 'fr-encerrando' : ''}`}>
      <td className="fr-acts fr-ops">
        <button className="fr-op" title="Trocar veículo" disabled={!emUso || !!v.chamado} onClick={() => onOp('troca')}><RefreshCw size={16} /></button>
        <button className="fr-op" title="Substituir condutor" disabled={!emUso || !!v.chamado} onClick={() => onOp('substituir')}><UserRoundCog size={16} /></button>
        <button className="fr-op fr-op-x" title="Fechar contrato" disabled={!emUso} onClick={() => onOp('encerrar')}><CircleX size={16} /></button>
      </td>
      <td className="small">{v.superior || '—'}</td>
      <td><input list="fr-colab-cm" value={x.motorista || ''} onChange={set('motorista')} /></td>
      <td><input type="date" value={x.data_retirada || ''} onChange={set('data_retirada')} /></td>
      <td><select value={x.local || ''} onChange={set('local')}><Opcoes lista={cfg.locais} /></select></td>
      <td><input value={x.codigo_reserva || ''} onChange={set('codigo_reserva')} className="fr-in-sm" /></td>
      <td><select value={x.categoria || ''} onChange={set('categoria')}><Opcoes lista={cfg.categorias} /></select></td>
      <td><select value={x.modalidade || ''} onChange={set('modalidade')}><Opcoes lista={cfg.modalidades} /></select></td>
      <td><input inputMode="decimal" value={x.valor_contrato ?? ''} onChange={set('valor_contrato')} className="fr-in-sm" /></td>
      <td>
        <select value={x.status} onChange={set('status')}>{statusOpcoes.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {v.chamado && <div className="small fr-ch-mini">{v.chamado.tipo_label} · {v.chamado.status_label}</div>}
      </td>
      <td><input value={x.placa || ''} onChange={set('placa', placaFmt)} className="fr-in-placa" /></td>
      <td><input value={x.cartao || ''} onChange={set('cartao')} className="fr-in-sm" /></td>
      <td><input value={x.modelo || ''} onChange={set('modelo')} className="fr-in-sm" /></td>
      <td><input inputMode="numeric" value={x.km_retirada ?? ''} onChange={set('km_retirada', (y) => y.replace(/\D/g, ''))} className="fr-in-km" /></td>
      <td><input type="date" value={x.data_devolucao || ''} onChange={set('data_devolucao')} /></td>
      <td><input inputMode="numeric" value={x.km_devolucao ?? ''} onChange={set('km_devolucao', (y) => y.replace(/\D/g, ''))} className="fr-in-km" /></td>
      <td className="fr-acts">
        <Button className="btn-sm" onClick={onSalvar} disabled={busy || !edicao}><Save size={14} /></Button>
        <Button className="btn-sm" variant="outline" onClick={onFotos} title="Fotos do carro"><Camera size={14} />{v.fotos_angulos ? ` ${v.fotos_angulos}` : ''}</Button>
        <Button className="btn-sm" variant="outline" onClick={onHist} title="Histórico do contrato"><History size={14} /></Button>
      </td>
    </tr>
  );
}

function ControleMestre({ api }) {
  const cfg = useConfig(api);
  const [lista, setLista] = useState(null);
  const [f, setF] = useState({ status: 'em_uso', local: '', placa: '', motorista: '' });
  const [edits, setEdits] = useState({});
  const [op, setOp] = useState(null);
  const [fotos, setFotos] = useState(null);
  const [hist, setHist] = useState(null);
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const load = () => api.get('/central/veiculos').then((l) => { setLista(l); setEdits({}); });
  useEffect(() => { load(); }, []);

  const all = lista || [];
  const visiveis = all.filter((v) => !['substituido', 'trocado'].includes(v.status));
  const cont = (s) => (s === 'encerramento' ? all.filter((v) => v.status === 'em_uso' && v.encerramento).length : all.filter((v) => v.status === s).length);
  const vis = all.filter((v) => (!f.status ? true : f.status === 'encerramento' ? v.status === 'em_uso' && v.encerramento : v.status === f.status)
    && (!f.local || v.local === f.local) && (!f.placa || norm(v.placa).includes(norm(f.placa)))
    && (!f.motorista || norm(v.motorista).includes(norm(f.motorista))));
  const sujos = Object.keys(edits).length;
  const statusOpcoes = cfg ? Object.entries(cfg.veiculo_status) : [];

  const editar = (id, k, val) => setEdits((e) => {
    const orig = all.find((v) => v.id === id);
    const n = { ...(e[id] || {}), [k]: val };
    if (String(orig[k] ?? '') === String(val ?? '')) delete n[k];
    const out = { ...e, [id]: n };
    if (!Object.keys(n).length) delete out[id];
    return out;
  });
  const salvarUm = async (id) => { if (await run(() => api.put(`/central/veiculos/${id}`, edits[id]), 'Veículo salvo')) load(); };
  const salvarTudo = async () => {
    const ok = await run(async () => { for (const [id, e] of Object.entries(edits)) await api.put(`/central/veiculos/${id}`, e); return true; }, `${sujos} veículo(s) salvo(s)`);
    if (ok) load();
  };
  const limpar = () => setF({ status: '', local: '', placa: '', motorista: '' });
  const exportar = () => { window.location.href = '/api/m/frotas/central/exportar'; };

  // aviso ao sair com alterações não salvas
  useEffect(() => {
    if (!sujos) return undefined;
    const k = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', k);
    return () => window.removeEventListener('beforeunload', k);
  }, [sujos]);

  const CHIPS_ST = [['reservado', 'Reservado'], ['em_uso', 'Em uso'], ['encerrado', 'Encerrado'], ['substituido', 'Substituído'], ['trocado', 'Trocado']];
  return (
    <>
      <PageHeader title="Controle mestre" subtitle="Todos os veículos da frota. Edite na linha e salve; troque placa, substitua condutor ou feche o contrato." back="/"
        actions={<>
          <Button onClick={salvarTudo} disabled={busy || !sujos}><Save size={15} /> Salvar tudo{sujos ? ` (${sujos})` : ''}</Button>
          <Button variant="outline" onClick={exportar}><FileSpreadsheet size={15} /> Excel</Button>
        </>} />
      <div className="fr-chips fr-mb">
        <button className={`fr-chip fr-chip-escuro ${!f.status ? 'on' : ''}`} onClick={() => setF({ ...f, status: '' })}>Total <b>{visiveis.length}</b></button>
        {CHIPS_ST.map(([k, l]) => <button key={k} className={`fr-chip ${f.status === k ? 'on' : ''}`} onClick={() => setF({ ...f, status: f.status === k ? '' : k })}>{l} <b>{cont(k)}</b></button>)}
        <button className={`fr-chip fr-chip-laranja ${f.status === 'encerramento' ? 'on' : ''}`} onClick={() => setF({ ...f, status: f.status === 'encerramento' ? '' : 'encerramento' })}>Encerramento <b>{cont('encerramento')}</b></button>
      </div>
      <Card className="fr-card-tabela">
        <div className="fr-filtros fr-filtros-pad">
          <FiltroSelect label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[...CHIPS_ST.map(([value, label]) => ({ value, label })), { value: 'encerramento', label: 'Encerramento (chamado)' }]} />
          <FiltroSelect label="Local" value={f.local} onChange={(v) => setF({ ...f, local: v })} options={cfg?.locais || []} />
          <label className="kit-filtro"><span>Placa</span><input value={f.placa} onChange={(e) => setF({ ...f, placa: e.target.value })} /></label>
          <label className="kit-filtro"><span>Motorista</span><input value={f.motorista} onChange={(e) => setF({ ...f, motorista: e.target.value })} /></label>
          <Button variant="outline" className="btn-sm" onClick={limpar}><X size={14} /> Limpar</Button>
          <span className="muted small fr-conta">{vis.length} de {all.length} veículos</span>
        </div>
        {lista === null || !cfg ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>{all.length ? 'Nenhum veículo corresponde aos filtros.' : 'Nenhum veículo cadastrado ainda.'}</Empty> : (
          <div className="fr-scroll fr-scroll-x">
            <table className="table fr-table fr-mestre fr-acao-fixa">
              <thead><tr><th>Troca · Subst. · Fechar</th><th>Superior</th><th>Motorista</th><th>Data retirada</th><th>Local retirada</th><th>Código reserva</th><th>Categoria</th><th>Modalidade</th>
                <th>Valor contrato</th><th>Status</th><th>Placa</th><th>Cartão abastec.</th><th>Modelo</th><th>Km retirada</th><th>Data devolução</th><th>Km devolução</th><th /></tr></thead>
              <tbody>
                {vis.map((v) => (
                  <LinhaMestre key={v.id} v={v} cfg={cfg} statusOpcoes={statusOpcoes} edicao={edits[v.id]} busy={busy}
                    onEdit={(k, val) => editar(v.id, k, val)} onSalvar={() => salvarUm(v.id)}
                    onOp={async (tipo) => {
                      if (edits[v.id] && !await confirmar({ titulo: 'Há alterações não salvas nesta linha', mensagem: 'Elas serão descartadas. Continuar?', confirmar: 'Continuar' })) return;
                      setOp({ v, tipo });
                    }}
                    onFotos={() => setFotos(v)} onHist={() => setHist(v)} />
                ))}
              </tbody>
            </table>
            <Colaboradores id="fr-colab-cm" lista={cfg.colaboradores} />
          </div>
        )}
      </Card>
      {op && <OperacaoDialog api={api} v={op.v} tipo={op.tipo} cfg={cfg} onClose={() => setOp(null)} onDone={() => { setOp(null); setF((x) => ({ ...x, status: '' })); load(); }} />}
      {fotos && <FotosCarro veiculo={fotos} onClose={() => setFotos(null)} onChange={load} podeTirar={['reservado', 'em_uso'].includes(fotos.status)} />}
      {hist && <HistoricoDialog api={api} v={hist} onClose={() => setHist(null)} />}
    </>
  );
}

// =========================================================================== configurações
const LISTAS = [
  { k: 'locais', titulo: 'Locais de retirada' },
  { k: 'categorias', titulo: 'Categorias de veículo' },
  { k: 'modalidades', titulo: 'Modalidades de locação' },
  { k: 'colaboradores', titulo: 'Motoristas / colaboradores', superior: true },
];

function ListaConfig({ api, def, itens, onChange }) {
  const [novo, setNovo] = useState({ nome: '', superior: '' });
  const [busca, setBusca] = useState('');
  const [run, busy] = useAction();
  const perguntar = usePrompt();
  const add = async () => { if (await run(() => api.post(`/central/listas/${def.k}`, novo), 'Adicionado')) { setNovo({ nome: '', superior: '' }); onChange(); } };
  const alterar = async (it, body, msg) => { if (await run(() => api.put(`/central/listas/${def.k}/${it.id}`, body), msg)) onChange(); };
  const vis = itens.filter((i) => !busca || norm(i.nome).includes(norm(busca)) || norm(i.superior).includes(norm(busca)));
  return (
    <Card className="fr-cfg">
      <h3>{def.titulo}</h3>
      <div className="fr-cfg-add">
        <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder={def.superior ? 'Nome do colaborador' : 'Novo item'} onKeyDown={(e) => e.key === 'Enter' && novo.nome.trim() && add()} />
        {def.superior && <input value={novo.superior} onChange={(e) => setNovo({ ...novo, superior: e.target.value })} placeholder="Superior" />}
        <Button className="btn-sm" onClick={add} disabled={busy || !novo.nome.trim()}><Plus size={14} /> Adicionar</Button>
      </div>
      {itens.length > 8 && <label className="fr-busca"><Search size={14} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar" /></label>}
      <ul className="fr-cfg-lista">
        {vis.map((it) => (
          <li key={it.id} className={it.ativo ? '' : 'inativo'}>
            <span><b>{it.nome}</b>{def.superior && <small className="muted"> · superior: {it.superior || '—'}</small>}</span>
            <span className="fr-acts">
              {def.superior && <button className="fr-link" onClick={async () => {
                const s = await perguntar({ titulo: `Superior de ${it.nome}`, label: 'Nome do superior', confirmar: 'Salvar' });
                if (s !== null) alterar(it, { superior: s }, 'Superior atualizado');
              }} disabled={busy}>Superior</button>}
              <button className="fr-link" onClick={() => alterar(it, { ativo: !it.ativo }, it.ativo ? 'Desativado' : 'Reativado')} disabled={busy}>{it.ativo ? 'Desativar' : 'Reativar'}</button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Configuracoes({ api }) {
  const [d, setD] = useState(null);
  const load = () => api.get('/central/listas').then(setD);
  useEffect(() => { load(); }, []);
  return (
    <>
      <PageHeader title="Configurações" subtitle="Listas usadas nos pedidos e no controle da frota. Itens desativados somem das escolhas, mas ficam nos registros antigos." back="/" />
      {!d ? <Empty>Carregando…</Empty> : (
        <div className="fr-cfgs">{LISTAS.map((def) => <ListaConfig key={def.k} api={api} def={def} itens={d[def.k]} onChange={load} />)}</div>
      )}
    </>
  );
}

export default function Central(props) {
  return (
    <Routes>
      <Route index element={<Aprovacoes {...props} />} />
      <Route path="reservas" element={<Reservas {...props} />} />
      <Route path="ativar" element={<Ativar {...props} />} />
      <Route path="chamados" element={<Chamados {...props} />} />
      <Route path="controle" element={<ControleMestre {...props} />} />
      <Route path="configuracoes" element={<Configuracoes {...props} />} />
    </Routes>
  );
}
