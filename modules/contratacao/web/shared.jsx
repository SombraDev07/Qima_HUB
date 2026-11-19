// Componentes compartilhados da Contratação.
import { useState } from 'react';
import { Badge, Button, Field, Modal, fmtShort, useAction } from '@hub';

export const STATUS_TONE = {
  rascunho: 'muted', pendente: 'warning', em_recrutamento: 'info', parcial: 'roxo', atendida: 'success',
  finalizado: 'success', cancelado: 'brand', recusado: 'brand',
};
export const StatusBadge = ({ p }) => <span className={`ct-status ct-st-${STATUS_TONE[p.status]}`}>{p.status_label || p.status}</span>;
export const SituacaoTag = ({ s }) => <span className={`ct-sit ct-sit-${s.toLowerCase()}`}>{s}</span>;
export const PESSOA_ST = { livre: 'Livre', anexado: 'Anexado', contratado: 'Contratado', demitido: 'Demitido' };
export const PessoaStatus = ({ s }) => <span className={`ct-pst ct-pst-${s}`}>{PESSOA_ST[s] || s}</span>;
export const quando = (p) => `S${p.semana} · ${fmtShort(p.data_desejada)}`;
export const local = (p) => `${p.distrito || p.uf}${p.cidade ? ` · ${p.cidade} - ${p.uf}` : ''}`;
export const sim = (v) => (v ? 'Sim' : 'Não');
// ------------------------------------------------------------------ contagem de dias (pelo dia do navegador, não UTC)
const diaLocal = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
const diaISO = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
/** Dias desde um carimbo de data/hora (ex.: criado em) até hoje. */
export const diasDesde = (ts) => (ts ? Math.round((diaLocal(new Date()) - diaLocal(new Date(ts))) / 86400000) : null);
/** Dias de hoje até uma data AAAA-MM-DD (negativo = já passou). */
export const diasAte = (iso) => (iso ? Math.round((diaISO(iso) - diaLocal(new Date())) / 86400000) : null);
export const textoDesde = (n) => (n === null ? '' : n === 0 ? 'hoje' : n === 1 ? 'há 1 dia' : `há ${n} dias`);
export const textoAte = (n) => (n === null ? '' : n === 0 ? 'começa hoje' : n === 1 ? 'falta 1 dia' : n > 0 ? `faltam ${n} dias` : n === -1 ? 'começou há 1 dia' : `começou há ${-n} dias`);

export const Mobilidade =({ v }) => <span className={v ? 'ct-movel' : ''}>{v ? 'MÓVEL' : 'LOCAL'}</span>;

/** Pedido de demissão (solicitante → RH). */
export function DemissaoDialog({ api, pessoa, onClose, onDone }) {
  const [cfgAv] = useState(['Trabalhado', 'Indenizado', 'Não aplicável / validar com RH']);
  const [cfgJu] = useState(['Comportamento', 'Desempenho', 'Pedido do colaborador', 'Término de contrato', 'Redução de quadro', 'Outro']);
  const [f, setF] = useState({ tipo: 'empresa', gestor: '', data_prevista: '', ultimo_dia: '', aviso: '', justificativa: '', obs: '', confirmado: false });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const enviar = async () => { if (await run(() => api.post(`/anexos/${pessoa.anexo_id}/demissao`, f), 'Pedido de demissão enviado ao RH')) onDone(); };
  return (
    <Modal title={`Pedir demissão · ${pessoa.nome}`} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Voltar</Button><Button variant="danger" onClick={enviar} disabled={busy}>Enviar ao RH</Button></>}>
      <p className="muted small ct-m0">{pessoa.email} · {pessoa.funcao} · {pessoa.movel ? 'MÓVEL' : 'LOCAL'}</p>
      <div className="ct-seg">
        <button type="button" className={f.tipo === 'empresa' ? 'on' : ''} onClick={() => setF({ ...f, tipo: 'empresa' })}>Iniciativa da empresa</button>
        <button type="button" className={f.tipo === 'colaborador' ? 'on' : ''} onClick={() => setF({ ...f, tipo: 'colaborador' })}>Pedido do colaborador</button>
      </div>
      <Field label="Gestor responsável"><input value={f.gestor} onChange={set('gestor')} /></Field>
      <div className="grid-2">
        <Field label="Data prevista do desligamento"><input type="date" value={f.data_prevista} onChange={set('data_prevista')} /></Field>
        <Field label="Último dia trabalhado"><input type="date" value={f.ultimo_dia} onChange={set('ultimo_dia')} /></Field>
        <Field label="Aviso prévio"><select value={f.aviso} onChange={set('aviso')}><option value="">Selecione</option>{cfgAv.map((a) => <option key={a}>{a}</option>)}</select></Field>
        <Field label="Justificativa"><select value={f.justificativa} onChange={set('justificativa')}><option value="">Selecione</option>{cfgJu.map((a) => <option key={a}>{a}</option>)}</select></Field>
      </div>
      <Field label="Observação"><textarea rows={3} value={f.obs} onChange={set('obs')} /></Field>
      <label className="check"><input type="checkbox" checked={f.confirmado} onChange={set('confirmado')} /> Confirmo que este é o colaborador do desligamento</label>
    </Modal>
  );
}

export const Requisitos = ({ p }) => (
  <div className="tags">
    {p.experiencia && <Badge tone="neutral">Experiência</Badge>}
    {p.cnh && <Badge tone="neutral">CNH</Badge>}
    <Badge tone={p.movel ? 'info' : 'muted'}>{p.movel ? 'Móvel' : 'Local'}</Badge>
  </div>
);
