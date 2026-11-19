// Componentes e utilitários específicos do Hospedagens.
// Os genéricos (toast, modal, formatação, filtros, CSV) vêm do núcleo (@hub).
import { useEffect, useState } from 'react';
import { X, Search, UserPlus, Plus } from 'lucide-react';
import { Badge, Button, norm, useToast } from '@hub';

export {
  fmtDate, fmtShort, fmtDateTime, money, num, norm, todayISO, addDays, uniq,
  ToastProvider, useToast, useAction, Modal, FiltroSelect, exportCsv,
} from '@hub';

export const PEDIDO_STATUS = {
  rascunho: { label: 'Rascunho', tone: 'muted' },
  pendente: { label: 'Solicitado', tone: 'warning' },
  ajustado: { label: 'Ajustado', tone: 'warning' },
  em_andamento: { label: 'Em andamento', tone: 'info' },
  finalizado: { label: 'Finalizado', tone: 'success' },
  cancelado: { label: 'Cancelado', tone: 'muted' },
};
export const SITUACAO = {
  novo: { label: 'Novo', tone: 'neutral' },
  enviado: { label: 'Reservado', tone: 'info' },
  alterado: { label: 'Alterado', tone: 'warning' },
  prorrogado: { label: 'Prorrogado', tone: 'brand' },
  finalizado: { label: 'Finalizado', tone: 'success' },
};
export const AJUSTE = {
  cancelar: 'Cancelar',
  prorrogar: 'Prorrogar',
  checkout: 'Check-out',
  editar: 'Editar',
  cancelar_pedido: 'Cancelar pedido',
};

export const PedidoBadge = ({ s }) => <Badge tone={PEDIDO_STATUS[s]?.tone}>{PEDIDO_STATUS[s]?.label || s}</Badge>;
export const SituacaoBadge = ({ s }) => <Badge tone={SITUACAO[s]?.tone}>{SITUACAO[s]?.label || s}</Badge>;

// ------------------------------------------------------------------ status pelas datas (regra única em todas as telas)
// Depois que a central reserva: antes do check-in = Reservado; do check-in ao check-out = Em andamento; depois = Encerrado.
export const FASE = {
  reservado: { label: 'Reservado', tone: 'neutral' },
  em_andamento: { label: 'Em andamento', tone: 'info' },
  encerrado: { label: 'Encerrado', tone: 'success' },
};
/** Hoje no fuso do navegador (o todayISO do núcleo é UTC e vira o dia às 21h no Brasil). */
export const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function faseDatas(ini, fim, hoje = hojeLocal()) {
  if (fim && hoje > fim) return 'encerrado';
  if (ini && hoje >= ini) return 'em_andamento';
  return 'reservado';
}
/** Status exibido do pedido: antes da reserva segue o fluxo (Solicitado, Ajustado…); depois, as datas. */
export function statusPedido(p) {
  // Finalizado pelo financeiro: trava o solicitante e prevalece sobre as datas
  if (p.status === 'finalizado') return { key: 'finalizado', ...PEDIDO_STATUS.finalizado };
  if (p.status === 'em_andamento') {
    const f = faseDatas(p.data_inicio, p.data_fim);
    return { key: f, ...FASE[f] };
  }
  return { key: p.status, ...(PEDIDO_STATUS[p.status] || { label: p.status }) };
}
/** Status exibido de um quarto já enviado ao solicitante. */
export function statusQuarto(q, p) {
  if (p?.status === 'finalizado') return statusPedido(p);
  const f = q.situacao === 'finalizado' ? 'encerrado' : faseDatas(q.data_in, q.data_out);
  return { key: f, ...FASE[f] };
}
/** Status exibido de um hóspede (q = quarto dele, se houver). */
export function statusHospede(h, q, p) {
  if (h.status === 'cancelado') return { key: 'cancelado', label: 'Cancelado', tone: 'muted' };
  if (h.status === 'checkout') return { key: 'encerrado', label: 'Encerrado', tone: 'success' };
  if (p.status === 'finalizado') return statusPedido(p);
  if (q?.enviado) return statusQuarto(q);
  return statusPedido(p);
}
export const StatusBadge = ({ st }) => <Badge tone={st.tone}>{st.label}</Badge>;
export const StatusPedidoBadge = ({ p }) => <StatusBadge st={statusPedido(p)} />;

// ------------------------------------------------------------------ cidade (IBGE) — vem do núcleo
export { CidadeInput, cidadeValida, cidadeOficial, UFS } from '@hub';

// ------------------------------------------------------------------ seletor de hóspedes (pessoas + Open)
export function HospedesPicker({ api, value, onChange }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [novo, setNovo] = useState(null);
  const [openQtd, setOpenQtd] = useState(1);
  const toast = useToast();

  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/pessoas?q=${encodeURIComponent(q)}`).then(setRes).catch(() => setRes([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const has = (nome) => value.some((v) => norm(v.nome) === norm(nome));
  const add = (p) => {
    if (has(p.nome)) return toast(`${p.nome} já está na lista.`, 'erro');
    if (p.demitido) toast(`${p.nome} está como demitido(a) na Contratação.`, 'erro');
    onChange([...value, { pessoa_id: p.id, nome: p.nome, email: p.email, tipo: 'colaborador', demitido: !!p.demitido }]);
  };
  const addOpen = () => {
    const n = Math.min(Math.max(1, Number(openQtd) || 1), 30);
    let base = value.reduce((m, v) => Math.max(m, Number((v.nome.match(/^Open_(\d+)$/) || [])[1]) || 0), 0);
    const novos = Array.from({ length: n }, () => ({ nome: `Open_${++base}`, tipo: 'open' }));
    onChange([...value, ...novos]);
  };
  const cadastrar = async () => {
    try {
      const p = await api.post('/pessoas', novo);
      add(p);
      setNovo(null);
    } catch (e) {
      toast(e.message, 'erro');
    }
  };

  return (
    <div className="hs-picker">
      <div className="hs-chips">
        {value.map((v, i) => (
          <span key={v.nome + i} className={`hs-chip ${v.tipo === 'open' ? 'hs-chip-open' : ''} ${v.demitido ? 'hs-demitido' : ''}`} title={v.demitido ? 'Demitido(a) na Contratação' : undefined}>
            {v.nome}
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remover ${v.nome}`}><X size={13} /></button>
          </span>
        ))}
        {!value.length && <span className="muted small">Nenhuma pessoa anexada.</span>}
      </div>

      <div className="hs-picker-tools">
        <div className="search">
          <Search size={16} />
          <input placeholder="Buscar no banco de pessoas (nome, função, cidade)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="hs-open">
          <input type="number" min={1} max={30} value={openQtd} onChange={(e) => setOpenQtd(e.target.value)} aria-label="Quantidade de vagas Open" />
          <Button type="button" variant="outline" onClick={addOpen}><Plus size={15} /> Open</Button>
        </div>
        <Button type="button" variant="outline" onClick={() => setNovo({ nome: q, email: '' })}><UserPlus size={15} /> Cadastrar</Button>
      </div>

      {novo && (
        <div className="hs-novo-pessoa">
          <input placeholder="Nome completo" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          <input placeholder="E-mail (opcional)" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
          <Button type="button" onClick={cadastrar}>Salvar e anexar</Button>
          <Button type="button" variant="outline" onClick={() => setNovo(null)}>Cancelar</Button>
        </div>
      )}

      <div className="hs-pessoas">
        {res.map((p) => (
          <button type="button" key={p.id} className={`hs-pessoa ${has(p.nome) ? 'on' : ''} ${p.demitido ? 'hs-demitido' : ''}`} onClick={() => add(p)} disabled={has(p.nome)}
            title={p.demitido ? 'Demitido(a) na Contratação' : undefined}>
            <b>{p.nome}{p.demitido && <span className="hs-tag-dem">Demitido</span>}</b>
            <span className="muted small">{[p.funcao, p.cidade, p.email].filter(Boolean).join(' · ') || 'Sem detalhes'}</span>
          </button>
        ))}
        {!res.length && <span className="muted small">Nenhuma pessoa encontrada. Use “Cadastrar” ou adicione vagas “Open”.</span>}
      </div>
    </div>
  );
}
