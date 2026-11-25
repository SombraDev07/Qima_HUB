// Componentes compartilhados das telas do Viagem.
import { useState } from 'react';
import { Bus, Plane, FileText, Download, Trash2 } from 'lucide-react';
import { Badge, Card, fmtDate, fmtDateTime, fmtCpf, money } from '@hub';

export const STATUS = {
  pendente: { label: 'Aguardando central', tone: 'warning' },
  agendando: { label: 'Em agendamento', tone: 'info' },
  agendado: { label: 'Agendado', tone: 'success' },
  recusado: { label: 'Recusado', tone: 'brand' },
  cancelado: { label: 'Cancelado', tone: 'muted' },
};
export const TRANSPORTE = { onibus: 'Ônibus', aviao: 'Avião' };
export const StatusBadge = ({ s }) => <Badge tone={STATUS[s]?.tone}>{STATUS[s]?.label || s}</Badge>;
export const IconeTransporte = ({ t, size = 15 }) => (t === 'aviao' ? <Plane size={size} /> : <Bus size={size} />);
export const trecho = (p) => `${p.origem}/${p.origem_uf} → ${p.destino}/${p.destino_uf}`;
export const fmtTel = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
};
export const anexoUrl = (key, a, download) => `/api/m/${key}/anexos/${a.id}${download ? '?download=1' : ''}`;

/** Resumo da viagem (trecho, transporte, datas). */
export function ResumoViagem({ p }) {
  return (
    <Card className="vg-resumo">
      <div><span className="muted small">Trecho</span><b>{trecho(p)}</b></div>
      <div><span className="muted small">Transporte</span><b className="vg-ico"><IconeTransporte t={p.transporte} /> {TRANSPORTE[p.transporte]}</b></div>
      <div><span className="muted small">Saída</span><b>{fmtDate(p.data_ida)} às {p.horario}</b></div>
      <div><span className="muted small">Volta</span><b>{p.data_volta ? fmtDate(p.data_volta) : 'Só ida'}</b></div>
      <div><span className="muted small">Solicitante</span><b>{p.solicitante_nome}</b></div>
      <div><span className="muted small">Enviado em</span><b>{fmtDateTime(p.created_at)}</b></div>
      {p.obs && <div className="vg-resumo-obs"><span className="muted small">Observações</span><span>{p.obs}</span></div>}
    </Card>
  );
}

/** Tabela dos passageiros. editavel = a central digita localizador e valor (valores em "edits"). */
export function TabelaPassageiros({ passageiros, editavel, edits, onEdit, mostrarPassagem }) {
  return (
    <Card className="table-card">
      <table className="table vg-table">
        <thead>
          <tr>
            <th>Passageiro</th><th>CPF</th><th>RG</th><th>Nascimento</th><th>Contato</th><th>BU</th><th>Poltrona</th>
            {(editavel || mostrarPassagem) && <><th>Localizador</th><th>Valor</th></>}
          </tr>
        </thead>
        <tbody>
          {passageiros.map((x) => {
            const e = edits?.[x.id] || {};
            return (
              <tr key={x.id}>
                <td className="cell-strong">{x.nome}</td>
                <td className="vg-nowrap">{fmtCpf(x.cpf)}</td>
                <td>{x.rg}</td>
                <td>{fmtDate(x.nascimento)}</td>
                <td>{x.email}<div className="muted small">{fmtTel(x.telefone)}</div></td>
                <td>{x.bu}</td>
                <td>{x.poltrona || <span className="muted">—</span>}</td>
                {editavel ? (
                  <>
                    <td><input className="vg-in" value={e.localizador ?? ''} onChange={(ev) => onEdit(x.id, { localizador: ev.target.value })} placeholder="Ex.: ABC123" /></td>
                    <td><input className="vg-in vg-in-valor" value={e.valor ?? ''} onChange={(ev) => onEdit(x.id, { valor: ev.target.value })} placeholder="0,00" inputMode="decimal" /></td>
                  </>
                ) : mostrarPassagem && (
                  <>
                    <td>{x.localizador || <span className="muted">—</span>}</td>
                    <td>{x.valor != null ? money(x.valor) : <span className="muted">—</span>}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

/** Lista de passagens anexadas (abrir, baixar e, para a central, remover). */
export function Passagens({ module, anexos, onRemover, busy }) {
  if (!anexos.length) return <p className="muted small vg-m0">Nenhuma passagem anexada ainda.</p>;
  return (
    <ul className="vg-anexos">
      {anexos.map((a) => (
        <li key={a.id}>
          <FileText size={16} />
          <a href={anexoUrl(module.key, a)} target="_blank" rel="noreferrer">{a.nome}</a>
          <span className="muted small">{Math.max(1, Math.round(a.tamanho / 1024))} KB</span>
          <a className="vg-icon-btn" href={anexoUrl(module.key, a, true)} title="Baixar"><Download size={15} /></a>
          {onRemover && <button type="button" className="vg-icon-btn" onClick={() => onRemover(a)} disabled={busy} title="Remover"><Trash2 size={15} /></button>}
        </li>
      ))}
    </ul>
  );
}

export function Historico({ itens = [] }) {
  const [open, setOpen] = useState(false);
  if (!itens.length) return null;
  return (
    <>
      <h3 className="vg-section"><button type="button" className="vg-link" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} Histórico ({itens.length})</button></h3>
      {open && (
        <Card>
          {itens.map((h) => (
            <div key={h.id} className="vg-hist">
              <span className="muted small">{fmtDateTime(h.created_at)}</span> <b>{h.acao}</b>{h.detalhe ? ` · ${h.detalhe}` : ''} <span className="muted small">— {h.user_nome}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
