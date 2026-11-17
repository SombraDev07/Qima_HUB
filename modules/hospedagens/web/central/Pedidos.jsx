import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Wallet, AlertTriangle } from 'lucide-react';
import { Alert, Badge, Button, Card, Empty, PageHeader } from '@hub';
import { FiltroSelect, PedidoBadge, fmtDate, norm, uniq } from '../shared.jsx';

const ABAS = [
  { key: 'novo', label: 'Pedido novo', match: (p) => ['pendente', 'ajustado'].includes(p.status) },
  { key: 'andamento', label: 'Em andamento', match: (p) => p.status === 'em_andamento' },
  { key: 'finalizado', label: 'Finalizado', match: (p) => p.status === 'finalizado' },
  { key: 'cancelado', label: 'Cancelado', match: (p) => p.status === 'cancelado' },
];
const POR_PAGINA = 50;

export default function PedidosCentral({ module, api }) {
  const base = `/m/${module.key}/central`;
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState(() => sessionStorage.getItem('hs-aba') || 'novo');
  const [f, setF] = useState({ cidade: '', solicitante: '', colaborador: '', hotel: '', projeto: '', status: '', ajuste: '', busca: '' });
  const [pag, setPag] = useState(1);

  useEffect(() => { api.get('/central/pedidos').then(setPedidos).catch((e) => setErro(e.message)); }, []);
  useEffect(() => { try { sessionStorage.setItem('hs-aba', aba); } catch {} setPag(1); }, [aba]);

  const all = pedidos || [];
  const opts = useMemo(() => ({
    cidade: uniq(all.map((p) => `${p.cidade} - ${p.uf}`)),
    solicitante: uniq(all.map((p) => p.solicitante_nome)),
    colaborador: uniq(all.flatMap((p) => (p.colaboradores || '').split('|')).filter((n) => !/^Open_\d+$/.test(n))),
    hotel: uniq(all.flatMap((p) => (p.hoteis || '').split(','))),
    projeto: uniq(all.map((p) => p.projeto)),
  }), [pedidos]);

  const filtroOk = (p) =>
    (!f.cidade || `${p.cidade} - ${p.uf}` === f.cidade) &&
    (!f.solicitante || p.solicitante_nome === f.solicitante) &&
    (!f.colaborador || (p.colaboradores || '').split('|').includes(f.colaborador)) &&
    (!f.hotel || (p.hoteis || '').split(',').includes(f.hotel)) &&
    (!f.projeto || p.projeto === f.projeto) &&
    (!f.status || p.status === f.status) &&
    (!f.ajuste || (f.ajuste === 'com' ? p.n_ajustes > 0 : p.n_ajustes === 0)) &&
    (!f.busca || norm(`${p.codigo} ${p.solicitante_nome} ${p.cidade} ${p.colaboradores}`).includes(norm(f.busca)));

  const filtrados = all.filter(filtroOk);
  const daAba = filtrados.filter(ABAS.find((a) => a.key === aba).match);
  const paginas = Math.max(1, Math.ceil(daAba.length / POR_PAGINA));
  const visiveis = daAba.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);
  const set = (k) => (v) => { setF({ ...f, [k]: v }); setPag(1); };
  const comAjuste = all.filter((p) => p.n_ajustes > 0).length;

  return (
    <>
      <PageHeader
        title="Pedidos de hospedagem"
        subtitle={`${module.title} · Central`}
        back={null}
      />
      <Alert>{erro}</Alert>
      {comAjuste > 0 && (
        <button className="hs-banner" onClick={() => { setF({ ...f, ajuste: 'com' }); setAba(ABAS.find((a) => all.some((p) => p.n_ajustes > 0 && a.match(p)))?.key || aba); }}>
          <AlertTriangle size={16} /> {comAjuste} pedido(s) com ajuste do solicitante aguardando a central — clique para filtrar
        </button>
      )}

      <div className="tabs">
        {ABAS.map((a) => (
          <button key={a.key} className={aba === a.key ? 'active' : ''} onClick={() => setAba(a.key)}>
            {a.label} ({filtrados.filter(a.match).length})
          </button>
        ))}
      </div>

      <Card className="hs-filtros-card">
        <div className="hs-filtros">
          <label className="hs-filtro hs-filtro-grow"><span>Buscar</span>
            <input value={f.busca} onChange={(e) => set('busca')(e.target.value)} placeholder="Código, nome ou cidade" />
          </label>
          <FiltroSelect label="Cidade" value={f.cidade} onChange={set('cidade')} options={opts.cidade} />
          <FiltroSelect label="Solicitante" value={f.solicitante} onChange={set('solicitante')} options={opts.solicitante} />
          <FiltroSelect label="Colaborador" value={f.colaborador} onChange={set('colaborador')} options={opts.colaborador} />
          <FiltroSelect label="Hotel" value={f.hotel} onChange={set('hotel')} options={opts.hotel} />
          <FiltroSelect label="Projeto" value={f.projeto} onChange={set('projeto')} options={opts.projeto} />
          <FiltroSelect label="Ajuste" value={f.ajuste} onChange={set('ajuste')} options={[{ value: 'com', label: 'Com ajuste pendente' }, { value: 'sem', label: 'Sem ajuste' }]} />
        </div>
      </Card>

      {pedidos === null ? <Empty>Carregando…</Empty> : !visiveis.length ? <Empty>Nenhum pedido nesta aba.</Empty> : (
        <Card className="table-card">
          <table className="table hs-table">
            <thead>
              <tr><th>Código</th><th>Solicitante</th><th>Cidade</th><th>Check-in</th><th>Check-out</th><th>Projeto</th>
                <th title="Hóspedes solicitados / já colocados em quarto">Solic./Atend.</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {visiveis.map((p) => (
                <tr key={p.id} className={`hs-click ${p.n_ajustes ? 'hs-row-alerta' : ''}`} onClick={() => navigate(`${base}/pedido/${p.id}`)}>
                  <td className="cell-strong">{p.codigo}</td>
                  <td>{p.solicitante_nome}</td>
                  <td>{p.cidade} - {p.uf}</td>
                  <td>{fmtDate(p.data_inicio)}</td>
                  <td>{fmtDate(p.data_fim)}</td>
                  <td>{p.projeto || '—'}</td>
                  <td className={p.n_alocados < p.n_hospedes ? 'hs-pend' : ''}>{p.n_hospedes}/{p.n_alocados}</td>
                  <td><div className="tags"><PedidoBadge s={p.status} />{p.n_ajustes > 0 && <Badge tone="brand">{p.n_ajustes} ajuste</Badge>}</div></td>
                  <td className="row-actions"><Button className="btn-sm">Abrir</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hs-pager">
            <span>Exibindo {visiveis.length} de {daAba.length} pedido(s)</span>
            <span>
              <button className="hs-link" disabled={pag <= 1} onClick={() => setPag(pag - 1)}>‹ Anterior</button>
              {' '}Página {pag} de {paginas}{' '}
              <button className="hs-link" disabled={pag >= paginas} onClick={() => setPag(pag + 1)}>Próxima ›</button>
            </span>
          </div>
        </Card>
      )}
    </>
  );
}
