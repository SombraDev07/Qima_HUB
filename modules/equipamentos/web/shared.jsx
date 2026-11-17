// Peças usadas pelas duas áreas do sistema Equipamentos.
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button, Field, Modal, fmtDate, todayISO, useAction } from '@hub';

const COR = {
  rascunho: 'cinza', estoque: 'cinza', baixado: 'cinza', devolvido: 'cinza',
  enviado: 'azul', reservado: 'azul',
  em_uso: 'verde',
  devolucao_pendente: 'laranja',
};

export function Status({ s, label }) {
  return <span className={`eq-st eq-st-${COR[s] || 'cinza'}`}>{label || s}</span>;
}

/** Quantidade pedida de um tipo na solicitação (ou "-"). */
export const qtdTipo = (s, tipo) => s.itens.filter((i) => i.tipo === tipo).reduce((a, i) => a + Number(i.qtd), 0) || '-';
export const resumoItens = (s) => s.itens.map((i) => `${i.qtd}× ${i.tipo}`).join(', ');
export const dash = (v) => v || '-';
/** CPF com o miolo à mostra e o resto oculto: ***.123.***-** */
export const cpfMask = (c) => (c && String(c).length === 11 ? `***.${String(c).slice(3, 6)}.***-**` : '-');

/** Seleção de linhas com "marcar todos". */
export function useSelecao() {
  const [sel, setSel] = useState(() => new Set());
  const alternar = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcarTodos = (lista, on) => setSel(on ? new Set(lista) : new Set());
  const limpar = () => setSel(new Set());
  return { sel, alternar, marcarTodos, limpar };
}

export function Kpi({ rotulo, valor, ativo, onClick }) {
  const conteudo = <><div className="eq-kpi-r">{rotulo}</div><div className="eq-kpi-v">{valor}</div></>;
  return onClick
    ? <button type="button" className={`eq-kpi ${ativo ? 'on' : ''}`} onClick={onClick}>{conteudo}</button>
    : <div className="eq-kpi">{conteudo}</div>;
}

export function Barra({ n, vazio, children }) {
  return (
    <div className="eq-barra">
      <span>{n ? `${n} selecionado(s)` : vazio}</span>
      <div className="eq-barra-acoes">{children}</div>
    </div>
  );
}

/** Janela para informar o responsável (adicionar ou substituir usuário). */
export function UsuarioModal({ titulo, aviso, ok, comPeriodo = true, onClose, onSalvar }) {
  const [f, setF] = useState({ nome: '', projeto: '', superior: '', inicio: todayISO(), fim: '' });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const salvar = async () => { if (await run(() => onSalvar(f))) onClose(); };
  return (
    <Modal title={titulo} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={salvar} disabled={busy || !f.nome.trim()}>{ok}</Button></>}>
      {aviso && <p className="small muted eq-m0">{aviso}</p>}
      <div className="eq-grid2">
        <Field label="Responsável pelo equipamento"><input value={f.nome} onChange={set('nome')} placeholder="Nome completo" autoFocus maxLength={120} /></Field>
        <Field label="Projeto"><input value={f.projeto} onChange={set('projeto')} placeholder="Projeto" maxLength={80} /></Field>
        <Field label="Superior"><input value={f.superior} onChange={set('superior')} placeholder="Gestor responsável" maxLength={80} /></Field>
        {comPeriodo && <span />}
        {comPeriodo && <Field label="Data de início"><input type="date" value={f.inicio} onChange={set('inicio')} /></Field>}
        {comPeriodo && <Field label="Data de fim"><input type="date" value={f.fim} min={f.inicio} onChange={set('fim')} /></Field>}
      </div>
    </Modal>
  );
}

/** Formulário de solicitação (nova ou edição de rascunho). */
export function PedidoModal({ cfg, inicial, onClose, onSalvar }) {
  const [f, setF] = useState(() => ({
    projeto: inicial?.projeto || '', base: inicial?.base || cfg.bases[0], retirada: inicial?.retirada || '', devolucao: inicial?.devolucao || '',
    obs: inicial?.obs || '', colaborador: inicial?.colaborador || '', cpf: inicial?.cpf || '',
    itens: inicial?.itens?.length ? inicial.itens.map((i) => ({ ...i })) : [{ tipo: cfg.tipos[0], qtd: 1, motivo: 'Novo' }],
  }));
  const [run, busy] = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setItem = (i, k, v) => setF((x) => ({ ...x, itens: x.itens.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const salvar = async () => { if (await run(() => onSalvar({ ...f, itens: f.itens.map((i) => ({ ...i, qtd: Number(i.qtd) || 1 })) }), inicial ? 'Rascunho atualizado' : 'Solicitação adicionada como rascunho')) onClose(); };
  return (
    <Modal title={inicial ? `Editar ${inicial.codigo}` : 'Nova solicitação'} onClose={onClose} wide
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={salvar} disabled={busy}>{inicial ? 'Salvar' : 'Adicionar à lista'}</Button></>}>
      <div className="eq-grid2">
        <Field label="Projeto"><input value={f.projeto} onChange={set('projeto')} placeholder="Projeto" maxLength={80} autoFocus /></Field>
        <Field label="Base de entrega"><select value={f.base} onChange={set('base')}>{cfg.bases.map((b) => <option key={b}>{b}</option>)}</select></Field>
        <Field label="Data de retirada"><input type="date" value={f.retirada || ''} onChange={set('retirada')} /></Field>
        <Field label="Devolução prevista"><input type="date" value={f.devolucao || ''} min={f.retirada || undefined} onChange={set('devolucao')} /></Field>
        <Field label="Colaborador (opcional)" hint="Pode ser informado depois, em Substituir usuário."><input value={f.colaborador} onChange={set('colaborador')} placeholder="Nome completo" maxLength={120} /></Field>
        <Field label="CPF do colaborador (opcional)"><input value={f.cpf || ''} onChange={set('cpf')} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} /></Field>
      </div>
      <div className="eq-label">Itens solicitados</div>
      <div className="eq-itens">
        {f.itens.map((it, i) => (
          <div key={i} className="eq-item">
            <select value={it.tipo} onChange={(e) => setItem(i, 'tipo', e.target.value)} aria-label="Tipo do item">{cfg.tipos.map((t) => <option key={t}>{t}</option>)}</select>
            <input type="number" min={1} max={50} value={it.qtd} onChange={(e) => setItem(i, 'qtd', e.target.value)} aria-label="Quantidade" />
            <select value={it.motivo || 'Novo'} onChange={(e) => setItem(i, 'motivo', e.target.value)} aria-label="Motivo">
              {['Novo', 'Troca', 'Reposição'].map((m) => <option key={m}>{m}</option>)}
            </select>
            <button type="button" className="icon-btn" disabled={f.itens.length === 1} onClick={() => setF((x) => ({ ...x, itens: x.itens.filter((_, j) => j !== i) }))} aria-label="Remover item"><X size={16} /></button>
          </div>
        ))}
      </div>
      <Button variant="outline" className="btn-sm" onClick={() => setF((x) => ({ ...x, itens: [...x.itens, { tipo: cfg.tipos[0], qtd: 1, motivo: 'Novo' }] }))}><Plus size={14} /> Adicionar item</Button>
      <Field label="Observação"><textarea rows={2} value={f.obs || ''} onChange={set('obs')} placeholder="Ex.: troca por tela quebrada" maxLength={500} /></Field>
    </Modal>
  );
}

export function DadosSolicitacao({ s }) {
  const campos = [['Código', s.codigo], ['Solicitante', s.solicitante_nome], ['Colaborador', dash(s.colaborador)], ['CPF', cpfMask(s.cpf)],
    ['Projeto', s.projeto], ['Base', s.base], ['Retirada', fmtDate(s.retirada)], ['Devolução prevista', fmtDate(s.devolucao)]];
  return (
    <div className="eq-dados">
      {campos.map(([k, v]) => <div key={k}><div className="eq-dado-k">{k}</div><b>{v}</b></div>)}
      {s.obs && <div className="eq-dado-obs"><div className="eq-dado-k">Observação</div>{s.obs}</div>}
    </div>
  );
}
