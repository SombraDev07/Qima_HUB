// Componentes compartilhados do Nota NF.
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Sparkles, Loader2 } from 'lucide-react';
import {
  Badge, Field, FotoLupa as HubFotoLupa, Lightbox as HubLightbox, Miniatura as HubMiniatura, uploadArquivo, fmtDate, useToast,
} from '@hub';

export const STATUS = {
  rascunho: { label: 'Rascunho', tone: 'muted' },
  aguardando: { label: 'Aguardando central', tone: 'warning' },
  validada: { label: 'Validada', tone: 'success' },
  recusada: { label: 'Recusada', tone: 'brand' },
  substituida: { label: 'Substituída', tone: 'muted' },
  cancelada: { label: 'Cancelada', tone: 'muted' },
};
export const StatusBadge = ({ s }) => <Badge tone={STATUS[s]?.tone}>{STATUS[s]?.label || s}</Badge>;

export const int = (n) => Math.round(Number(n) || 0).toLocaleString('pt-BR');
export const dec = (n, d = 2) => (n == null || n === '' ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d }));
export const arquivoUrl = (key, n, download) => `/api/m/${key}/arquivo/${n.id}?v=${n.hash?.slice(0, 8) || ''}${download ? '&download=1' : ''}`;
const isPdf = (n) => n.mime === 'application/pdf';
export const enviarNF = (key, file, params = {}) => uploadArquivo(`/api/m/${key}/notas`, file, params);
export const Miniatura = ({ module, nota, onOpen, size }) => <HubMiniatura src={arquivoUrl(module.key, nota)} pdf={isPdf(nota)} alt={nota.codigo} onOpen={onOpen} size={size} />;
export const FotoLupa = ({ module, nota, onFull }) => <HubFotoLupa src={arquivoUrl(module.key, nota)} downloadUrl={arquivoUrl(module.key, nota, true)} pdf={isPdf(nota)} alt={nota.codigo} onFull={onFull} />;
export const Lightbox = ({ module, nota, onClose }) => (
  <HubLightbox src={arquivoUrl(module.key, nota)} downloadUrl={arquivoUrl(module.key, nota, true)} pdf={isPdf(nota)}
    titulo={`${nota.codigo}${nota.numero_nf ? ` · NF ${nota.numero_nf}` : ''}`} subtitulo={nota.produtor_nome} onClose={onClose} />
);

export function Alertas({ itens, ocultar = [] }) {
  const l = (itens || []).filter((a) => !ocultar.includes(a.tipo));
  if (!l.length) return null;
  return <div className="nf-alertas">{l.map((a) => <span key={a.tipo} className={`nf-alerta nf-alerta-${a.nivel}`}>{a.texto}</span>)}</div>;
}

export function Totais({ t, compact }) {
  return (
    <div className={`nf-totais ${compact ? 'compact' : ''}`}>
      <div><span>Itens de soja</span><b>{t.itens_soja}</b>{t.itens_ignorados > 0 && <small>{t.itens_ignorados} ignorado(s)</small>}</div>
      <div><span>Quantidade</span><b>{dec(t.quantidade)}</b></div>
      <div><span>Total de sementes</span><b>{int(t.sementes)}</b></div>
      <div><span>Sementes viáveis</span><b>{int(t.viaveis)}</b></div>
    </div>
  );
}

// ------------------------------------------------------------------ editor de NF (campos + itens)
const paraForm = (n) => ({
  numero_nf: n.numero_nf || '', serie: n.serie || '', chave_acesso: n.chave_acesso || '', data_emissao: n.data_emissao || '',
  emitente_nome: n.emitente_nome || '', emitente_doc: n.emitente_doc_fmt || '', produtor_nome: n.produtor_nome || '', produtor_doc: n.produtor_doc_fmt || '',
  municipio: n.municipio || '', uf: n.uf || '', peso_liquido: n.peso_liquido != null ? dec(n.peso_liquido) : '',
  itens: (n.itens || []).map((i) => ({
    descricao: i.descricao, cultivar: i.cultivar || '', unidade: i.unidade || '', quantidade: i.quantidade != null ? dec(i.quantidade) : '',
    sementes_por_unidade: i.sementes_por_unidade || '', germinacao: i.germinacao != null ? dec(i.germinacao, 1) : '',
    germinacao_padrao: i.germinacao_padrao, incluido: !!i.incluido, motivo_exclusao: i.motivo_exclusao || '',
  })),
});

/**
 * Formulário da NF. autoSave=true salva sozinho (rascunho do solicitante);
 * autoSave=false mostra o botão Salvar (edição da central).
 */
export function NFForm({ nota, ufs, onSave, autoSave, onCancel, busy }) {
  const [f, setF] = useState(() => paraForm(nota));
  const [salvando, setSalvando] = useState(false);
  const timer = useRef();
  const toast = useToast();
  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = (novo) => {
    setF(novo);
    if (!autoSave) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSalvando(true);
      try { await onSave(novo); } catch (e) { toast(e.message, 'erro'); } finally { setSalvando(false); }
    }, 600);
  };
  const set = (k) => (e) => commit({ ...f, [k]: e.target.value });
  const setItem = (idx, k, v) => commit({ ...f, itens: f.itens.map((it, i) => (i === idx ? { ...it, [k]: v, ...(k === 'germinacao' ? { germinacao_padrao: 0 } : {}) } : it)) });
  const addItem = () => commit({ ...f, itens: [...f.itens, { descricao: 'SEMENTE DE SOJA ', cultivar: '', unidade: 'SACO', quantidade: '', sementes_por_unidade: '', germinacao: '', incluido: true }] });
  const delItem = (idx) => commit({ ...f, itens: f.itens.filter((_, i) => i !== idx) });
  const ia = nota.ia_status === 'ok';

  return (
    <div className="nf-form">
      <div className="nf-form-head">
        <h4>Dados da nota</h4>
        <div className="nf-form-head-r">
          {salvando && <Loader2 size={14} className="nf-spin" />}
          {ia && <span className="nf-ia"><Sparkles size={13} /> Lido pela IA — confira</span>}
        </div>
      </div>
      <div className="nf-grid">
        <Field label="Nº NF"><input value={f.numero_nf} onChange={set('numero_nf')} /></Field>
        <Field label="Série"><input value={f.serie} onChange={set('serie')} /></Field>
        <Field label="Data de emissão"><input type="date" value={f.data_emissao} onChange={set('data_emissao')} /></Field>
        <Field label="Peso líquido (kg)"><input inputMode="decimal" value={f.peso_liquido} onChange={set('peso_liquido')} /></Field>
        <Field label="Chave de acesso" hint={f.chave_acesso && f.chave_acesso.replace(/\D/g, '').length !== 44 ? `${f.chave_acesso.replace(/\D/g, '').length}/44 dígitos` : null}>
          <input className="nf-mono" value={f.chave_acesso} onChange={set('chave_acesso')} placeholder="44 dígitos" />
        </Field>
      </div>
      <div className="nf-grid nf-grid-2">
        <fieldset><legend>Emitente</legend>
          <Field label="Nome / razão social"><input value={f.emitente_nome} onChange={set('emitente_nome')} /></Field>
          <Field label="CNPJ"><input value={f.emitente_doc} onChange={set('emitente_doc')} /></Field>
        </fieldset>
        <fieldset><legend>Produtor (destinatário)</legend>
          <Field label="Nome / razão social"><input value={f.produtor_nome} onChange={set('produtor_nome')} /></Field>
          <div className="nf-grid-doc">
            <Field label="CPF / CNPJ"><input value={f.produtor_doc} onChange={set('produtor_doc')} /></Field>
            <Field label="Município"><input value={f.municipio} onChange={set('municipio')} /></Field>
            <Field label="UF"><select value={f.uf} onChange={set('uf')}><option value="">—</option>{ufs.map((u) => <option key={u}>{u}</option>)}</select></Field>
          </div>
        </fieldset>
      </div>

      <div className="nf-form-head"><h4>Produtos</h4><button type="button" className="nf-link" onClick={addItem}><Plus size={14} /> Adicionar item</button></div>
      <div className="nf-itens-wrap">
        <table className="nf-itens">
          <thead><tr><th title="Entra nos totais (semente de soja)">Soja</th><th>Descrição do produto</th><th>Cultivar</th><th>Unid.</th><th>Qtd.</th><th title="Ex.: 160K = 160000">Sementes/unid.</th><th>Germ. %</th><th /></tr></thead>
          <tbody>
            {f.itens.map((it, i) => (
              <tr key={i} className={it.incluido ? '' : 'nf-ignorado'}>
                <td><input type="checkbox" checked={it.incluido} onChange={(e) => setItem(i, 'incluido', e.target.checked)} title={it.incluido ? 'Semente de soja' : it.motivo_exclusao || 'Ignorado'} /></td>
                <td>
                  <textarea rows={2} value={it.descricao} onChange={(e) => setItem(i, 'descricao', e.target.value)} />
                  {!it.incluido && <span className="nf-motivo">Ignorado: {it.motivo_exclusao || 'excluído'}</span>}
                </td>
                <td><input value={it.cultivar} onChange={(e) => setItem(i, 'cultivar', e.target.value)} /></td>
                <td><input value={it.unidade} onChange={(e) => setItem(i, 'unidade', e.target.value)} className="nf-w60" /></td>
                <td><input inputMode="decimal" value={it.quantidade} onChange={(e) => setItem(i, 'quantidade', e.target.value)} className="nf-w80" /></td>
                <td><input inputMode="numeric" value={it.sementes_por_unidade} onChange={(e) => setItem(i, 'sementes_por_unidade', e.target.value.replace(/\D/g, ''))} className="nf-w100" placeholder="160000" /></td>
                <td>
                  <input inputMode="decimal" value={it.germinacao} onChange={(e) => setItem(i, 'germinacao', e.target.value)} className="nf-w60" />
                  {it.germinacao_padrao ? <span className="nf-motivo">padrão</span> : null}
                </td>
                <td><button type="button" className="icon-btn danger" onClick={() => delItem(i)} title="Remover item"><Trash2 size={15} /></button></td>
              </tr>
            ))}
            {!f.itens.length && <tr><td colSpan={8} className="muted center">Nenhum item. Use “Adicionar item”.</td></tr>}
          </tbody>
        </table>
      </div>
      {!autoSave && (
        <div className="nf-acoes">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onSave(f)}>Salvar alterações</button>
          {onCancel && <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>}
        </div>
      )}
    </div>
  );
}

/** Resumo só leitura da NF. */
export function NFResumo({ n }) {
  return (
    <div className="nf-resumo">
      <dl>
        <dt>Nº NF / série</dt><dd><b>{n.numero_nf || '—'}</b>{n.serie ? ` · série ${n.serie}` : ''}</dd>
        <dt>Emissão</dt><dd>{fmtDate(n.data_emissao)}</dd>
        <dt>Emitente</dt><dd>{n.emitente_nome || '—'}<div className="muted small">{n.emitente_doc_fmt}</div></dd>
        <dt>Produtor</dt><dd><b>{n.produtor_nome || '—'}</b><div className="muted small">{n.produtor_doc_fmt}</div></dd>
        <dt>Município</dt><dd>{n.municipio || '—'}{n.uf ? ` - ${n.uf}` : ''}</dd>
        <dt>Peso líquido</dt><dd>{n.peso_liquido != null ? `${dec(n.peso_liquido)} kg` : '—'}</dd>
        <dt>Chave</dt><dd className="nf-mono">{n.chave_acesso || '—'} {n.chave_acesso && <span className={n.chave_ok ? 'nf-ok' : 'nf-bad'}>{n.chave_ok ? '✓ válida' : '✗ inválida'}</span>}</dd>
      </dl>
      <table className="nf-itens nf-itens-ro">
        <thead><tr><th>Descrição do produto</th><th>Cultivar</th><th>Unid.</th><th className="num">Qtd.</th><th className="num">Sementes/unid.</th><th className="num">Germ.</th><th className="num">Total sementes</th><th className="num">Viáveis</th></tr></thead>
        <tbody>
          {n.itens.filter((i) => i.incluido).map((i) => (
            <tr key={i.id}>
              <td className="small">{i.descricao}</td><td>{i.cultivar || '—'}</td><td>{i.unidade}</td><td className="num">{dec(i.quantidade)}</td>
              <td className="num">{i.sementes_por_unidade ? int(i.sementes_por_unidade) : <span className="nf-bad">—</span>}</td>
              <td className="num">{dec(i.germinacao, 1)}%{i.germinacao_padrao ? <div className="nf-motivo">padrão</div> : null}</td>
              <td className="num">{int(i.total_sementes)}</td><td className="num"><b>{int(i.viaveis)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      {n.itens.some((i) => !i.incluido) && (
        <details className="nf-ign"><summary>{n.itens.filter((i) => !i.incluido).length} item(ns) ignorado(s) — não são semente de soja</summary>
          {n.itens.filter((i) => !i.incluido).map((i) => <div key={i.id} className="small">{i.descricao} · {dec(i.quantidade)} {i.unidade} — <b>{i.motivo_exclusao}</b></div>)}
        </details>
      )}
    </div>
  );
}
