// Peças comuns do sistema Solicitações: formulário, detalhe do pedido e conversa.
import { useEffect, useRef, useState } from 'react';
import { Paperclip, Download, Plus, Trash2, Send, RefreshCw, ClipboardPaste, FileSpreadsheet, MessageSquare } from 'lucide-react';
import { Button, Empty, Field, Modal, fmtDate, fmtDateTime, useConfirm, useToast } from '@hub';

export const TONS = { pendente: 'amarelo', analise: 'azul', correcao: 'laranja', feito: 'verde', cancelado: 'cinza' };
export const Status = ({ p }) => <span className={`sl-st sl-st-${TONS[p.status]}`}>{p.status_label}</span>;
export const numBr = (n) => (Number(n) || 0).toLocaleString('pt-BR');
const kb = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// ------------------------------------------------------------------ CPF / CNPJ
const so = (v) => String(v ?? '').replace(/\D/g, '');
export function mascaraDoc(v) {
  const d = so(v).slice(0, 14);
  if (d.length <= 11) return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}
function docValido(v) {
  const d = so(v);
  if (!d) return true;
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false;
    const dv = (n) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const r = p.reduce((a, x, i) => a + x * Number(d[i]), 0) % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
  }
  return false;
}

// ------------------------------------------------------------------ linhas da correção
const VALORES = [['negativa', 'Negativa'], ['declarada', 'Declarada'], ['positiva', 'Positiva'], ['participante', 'Participante']];
const linhaVazia = (data = '') => ({ k: Math.random().toString(36).slice(2), cod_visita: '', documento: '', data, negativa: 0, declarada: 0, positiva: 0, participante: 0 });
const MAX = 200_000_000;

/** "12/11/2026" ou "2026-11-12" → "2026-11-12" */
function dataIso(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}
const numero = (s) => Math.min(MAX, Number(so(s)) || 0);

function avisosLinhas(linhas) {
  const falta = []; const aviso = [];
  if (!linhas.length) falta.push('Falta incluir ao menos uma linha na tabela.');
  if (linhas.some((l) => !l.cod_visita.trim())) falta.push('Falta o código da visita em alguma linha.');
  if (linhas.some((l) => !docValido(l.documento))) falta.push('CPF/CNPJ inválido em alguma linha (CPF tem 11 dígitos, CNPJ tem 14).');
  const vals = (l) => VALORES.map(([k]) => Number(l[k]) || 0);
  if (linhas.some((l) => vals(l).some((x) => x > 50_000_000))) aviso.push('há valor acima de 50 milhões');
  const cods = linhas.map((l) => l.cod_visita.trim().toLowerCase()).filter(Boolean);
  if (new Set(cods).size !== cods.length) aviso.push('código da visita repetido');
  const ch = linhas.map((l) => vals(l).join('|'));
  if (new Set(ch).size !== ch.length) aviso.push('os valores da tecnologia se repetem em outra linha');
  if (linhas.some((l) => { const [a, b, c, d] = vals(l); return (a > 0 && (a === b || a === c || a === d)) || (b > 0 && (b === c || b === d)) || (c > 0 && c === d); })) aviso.push('valores repetidos na mesma linha');
  return { falta, aviso };
}

function ColarDialog({ onClose, onLinhas }) {
  const [t, setT] = useState('');
  const linhas = t.split(/\r?\n/).map((r) => r.split(/\t|;/)).filter((c) => c.join('').trim())
    .filter((c) => !/c[oó]digo/i.test(c[0] || ''))
    .map((c) => ({ ...linhaVazia(), cod_visita: (c[0] || '').trim(), documento: mascaraDoc(c[1]), data: dataIso(c[2]), negativa: numero(c[3]), declarada: numero(c[4]), positiva: numero(c[5]), participante: numero(c[6]) }));
  return (
    <Modal title="Colar linhas do Excel" onClose={onClose} wide
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => onLinhas(linhas)} disabled={!linhas.length}>Adicionar {linhas.length || ''} linha(s)</Button></>}>
      <p className="small muted sl-m0">Copie no Excel as colunas nesta ordem: <b>Código · CNPJ/CPF · Data · Negativa · Declarada · Positiva · Participante</b> e cole abaixo (Ctrl+V). A linha de título é ignorada.</p>
      <textarea className="sl-colar" rows={10} value={t} onChange={(e) => setT(e.target.value)} placeholder={'V-1001\t12.345.678/0001-95\t12/11/2026\t10\t250\t30\t5'} autoFocus />
    </Modal>
  );
}

function TabelaLinhas({ linhas, setLinhas }) {
  const [colar, setColar] = useState(false);
  const set = (i, k, v) => setLinhas((ls) => {
    const n = ls.map((l, j) => (j === i ? { ...l, [k]: v } : l));
    // data preenchida passa para as linhas de baixo que estão sem data (como no PowerApps)
    if (k === 'data' && v) for (let j = i + 1; j < n.length; j++) if (!n[j].data) n[j] = { ...n[j], data: v };
    return n;
  });
  const total = (k) => linhas.reduce((s, l) => s + (Number(l[k]) || 0), 0);
  return (
    <div className="sl-linhas">
      <div className="sl-scroll">
        <table className="table sl-table">
          <thead><tr><th>#</th><th>Código</th><th>CNPJ / CPF</th><th>Data</th>{VALORES.map(([, l]) => <th key={l} className="num">{l}</th>)}<th /></tr></thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={l.k}>
                <td className="muted small">{i + 1}</td>
                <td><input value={l.cod_visita} onChange={(e) => set(i, 'cod_visita', e.target.value)} placeholder="Código" /></td>
                <td><input className={docValido(l.documento) ? '' : 'sl-invalido'} value={l.documento} onChange={(e) => set(i, 'documento', mascaraDoc(e.target.value))} placeholder="CPF ou CNPJ" inputMode="numeric" /></td>
                <td><input type="date" value={l.data} onChange={(e) => set(i, 'data', e.target.value)} /></td>
                {VALORES.map(([k]) => (
                  <td key={k}><input className="num" inputMode="numeric" value={l[k] ? numBr(l[k]) : ''} placeholder="0" onChange={(e) => set(i, k, numero(e.target.value))} /></td>
                ))}
                <td><button type="button" className="sl-x" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} title="Tirar linha"><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
          {linhas.length > 1 && <tfoot><tr><td colSpan={4} className="small muted">Total ({linhas.length} linhas)</td>{VALORES.map(([k]) => <td key={k} className="num small"><b>{numBr(total(k))}</b></td>)}<td /></tr></tfoot>}
        </table>
      </div>
      <div className="sl-linhas-acoes">
        <Button type="button" className="btn-sm" onClick={() => setLinhas((ls) => [...ls, linhaVazia(ls.at(-1)?.data || '')])}><Plus size={14} /> Adicionar linha</Button>
        <Button type="button" variant="outline" className="btn-sm" onClick={() => setColar(true)}><ClipboardPaste size={14} /> Colar do Excel</Button>
      </div>
      {colar && <ColarDialog onClose={() => setColar(false)} onLinhas={(ns) => { setLinhas((ls) => [...ls.filter((l) => l.cod_visita.trim()), ...ns]); setColar(false); }} />}
    </div>
  );
}

// ------------------------------------------------------------------ anexo
function Anexo({ atual, novo, setNovo }) {
  const ref = useRef();
  const [enviando, setEnviando] = useState(false);
  const toast = useToast();
  const escolher = async (f) => {
    setEnviando(true);
    try {
      const r = await fetch(`/api/m/solicitacoes/arquivos?nome=${encodeURIComponent(f.name)}`, { method: 'POST', credentials: 'same-origin', body: f, headers: { 'Content-Type': f.type || 'application/octet-stream' } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Não foi possível anexar.');
      setNovo(d);
    } catch (e) { toast(e.message, 'erro'); } finally { setEnviando(false); }
  };
  const mostrar = novo || atual;
  return (
    <div className="sl-anexo">
      {mostrar ? (
        <span className="sl-arq"><FileSpreadsheet size={18} /> <b>{mostrar.nome}</b> <span className="muted small">{kb(mostrar.tamanho)}{novo && atual ? ' · substitui a planilha anterior' : ''}</span></span>
      ) : <span className="muted">Nenhum arquivo</span>}
      <Button type="button" variant="outline" className="btn-sm" onClick={() => ref.current.click()} disabled={enviando}>
        <Paperclip size={14} /> {enviando ? 'Enviando…' : mostrar ? 'Trocar planilha' : 'Anexar Excel'}
      </Button>
      <input ref={ref} type="file" hidden accept=".xlsx,.xls" onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) escolher(f); }} />
    </div>
  );
}

// ------------------------------------------------------------------ formulário (nova / editar)
const TIPO_BOTOES = [['exclusao', 'Exclusão de cargas'], ['insercao', 'Inserção de dados'], ['acumulado', 'Acumulado']];

export function FormPedido({ api, cfg, pedido, onSalvo, onCancelar }) {
  const editando = !!pedido;
  const [f, setF] = useState(() => ({
    projeto: pedido?.projeto || cfg.projetos[0] || '', tipo: pedido?.tipo || 'exclusao', subtipo: pedido?.subtipo || 'insercao',
    cod_visita: pedido?.cod_visita || '', id_carga: pedido?.id_carga || '', motivo: pedido?.motivo || '', titulo: pedido?.titulo || '',
    descricao: pedido?.descricao || '', data_inicial: pedido?.data_inicial || '', data_final: pedido?.data_final || '',
  }));
  const [linhas, setLinhas] = useState(() => (pedido?.linhas?.length
    ? pedido.linhas.map((l) => ({ ...linhaVazia(), ...l, documento: mascaraDoc(l.documento), data: l.data || '' }))
    : [linhaVazia(), linhaVazia()]));
  const [novoAnexo, setNovoAnexo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const confirmar = useConfirm();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const correcao = f.tipo === 'acumulado' && f.subtipo === 'correcao';
  const anexoObrig = f.tipo === 'insercao' || (f.tipo === 'acumulado' && f.subtipo === 'insercao');
  const temAnexo = !!(novoAnexo || pedido?.anexo);
  const falta = [];
  if (f.tipo === 'exclusao') {
    if (!f.cod_visita.trim()) falta.push('o código da visita'); if (!f.id_carga.trim()) falta.push('o ID da carga');
    if (!f.motivo.trim()) falta.push('o motivo'); if (!f.descricao.trim()) falta.push('a descrição');
  } else if (f.tipo === 'insercao') {
    if (!f.cod_visita.trim()) falta.push('o código da visita'); if (!temAnexo) falta.push('o anexo Excel'); if (!f.descricao.trim()) falta.push('a descrição');
  } else if (!correcao) {
    if (!f.data_inicial || !f.data_final) falta.push('o período'); if (!f.titulo.trim()) falta.push('o título');
    if (!temAnexo) falta.push('o anexo'); if (!f.descricao.trim()) falta.push('a descrição');
  }
  const av = correcao ? avisosLinhas(linhas) : { falta: [], aviso: [] };
  const faltaTxt = [falta.length ? `Falta ${falta.join(', ')}.` : '', ...av.falta].filter(Boolean).join(' ');

  const enviar = async (confirmado = false) => {
    setErro('');
    if (faltaTxt) return setErro(faltaTxt);
    const body = { ...f, subtipo: f.tipo === 'acumulado' ? f.subtipo : null, arquivo_id: novoAnexo?.id, confirmar: confirmado,
      linhas: correcao ? linhas.map(({ k, ...l }) => ({ ...l, documento: so(l.documento) })) : undefined };
    setBusy(true);
    try {
      const r = editando ? await api.put(`/meus/${pedido.id}`, body) : await api.post('/meus', body);
      window.dispatchEvent(new Event('qh:atualizar'));
      onSalvo(r);
    } catch (e) {
      if (e.status === 409 && await confirmar({ titulo: 'Confira antes de enviar', mensagem: `${e.message}\n\nEstá certo assim?`, confirmar: 'Enviar mesmo assim', cancelar: 'Revisar' })) {
        setBusy(false);
        return enviar(true);
      }
      if (e.status !== 409) setErro(e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="sl-form-wrap">
      <div className="panel sl-form">
        <div className="sl-form-head">{editando ? `${pedido.status === 'correcao' ? 'Corrigir' : 'Editar'} solicitação ${pedido.codigo}` : 'Nova solicitação'}</div>
        <div className="sl-form-body">
          {pedido?.status === 'correcao' && pedido.obs_central && <div className="alert sl-alerta-correcao"><b>A central pediu correção:</b> {pedido.obs_central}</div>}
          <Field label="Projeto"><select value={f.projeto} onChange={set('projeto')}>{cfg.projetos.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <div className="sl-seg">
            {TIPO_BOTOES.map(([k, l]) => (
              <button key={k} type="button" className={f.tipo === k ? 'on' : ''} disabled={editando} onClick={() => { setF({ ...f, tipo: k }); setErro(''); }}>{l}</button>
            ))}
          </div>
          {f.tipo === 'acumulado' && (
            <Field label="Tipo de acumulado">
              <select value={f.subtipo} onChange={set('subtipo')} disabled={editando}><option value="insercao">Inserção</option><option value="correcao">Correção</option></select>
            </Field>
          )}
          {f.tipo === 'acumulado' && f.subtipo === 'insercao' && (
            <div className="sl-grid2">
              <Field label="Data inicial"><input type="date" value={f.data_inicial} onChange={set('data_inicial')} /></Field>
              <Field label="Data final"><input type="date" value={f.data_final} min={f.data_inicial} onChange={set('data_final')} /></Field>
            </div>
          )}
          {f.tipo !== 'acumulado' && <Field label="Código da visita"><input value={f.cod_visita} onChange={set('cod_visita')} placeholder="Código da visita" /></Field>}
          {f.tipo === 'exclusao' && <>
            <Field label="ID da carga"><input value={f.id_carga} onChange={set('id_carga')} placeholder="ID da carga" /></Field>
            <Field label="Motivo"><textarea rows={2} value={f.motivo} onChange={set('motivo')} placeholder="Por que a carga deve ser excluída" /></Field>
          </>}
          {f.tipo === 'acumulado' && f.subtipo === 'insercao' && <Field label="Título"><input value={f.titulo} onChange={set('titulo')} placeholder="Título" /></Field>}
          {correcao && <>
            <div className="sl-label">Correção — uma linha por visita</div>
            <TabelaLinhas linhas={linhas} setLinhas={setLinhas} />
          </>}
          <Field label={correcao ? 'Observação (opcional)' : 'Descrição'}><textarea rows={3} value={f.descricao} onChange={set('descricao')} placeholder={correcao ? 'Observação (opcional)' : 'Descrição'} /></Field>
          {anexoObrig && <Field label="Anexo (Excel)"><Anexo atual={pedido?.anexo} novo={novoAnexo} setNovo={setNovoAnexo} /></Field>}

          {(faltaTxt || av.aviso.length > 0 || erro) && (
            <div className="sl-avisos">
              {(erro || faltaTxt) && <div className="sl-falta">{erro || faltaTxt}</div>}
              {!erro && av.aviso.length > 0 && <div className="sl-aviso">Aviso: {av.aviso.join('; ')}. Vamos pedir sua confirmação ao enviar.</div>}
            </div>
          )}
          <div className="sl-form-acoes">
            <Button onClick={() => enviar(false)} disabled={busy}><Send size={15} /> {busy ? 'Enviando…' : editando ? (pedido.status === 'correcao' ? 'Reenviar corrigida' : 'Salvar alterações') : 'Criar solicitação'}</Button>
            <Button variant="outline" onClick={onCancelar}>Cancelar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ conversa
export function Conversa({ api, pedido, lado, onNova }) {
  const [msgs, setMsgs] = useState(pedido.mensagens);
  const [t, setT] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const fim = useRef();
  useEffect(() => { setMsgs(pedido.mensagens); }, [pedido]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'nearest' }); }, [msgs.length]);
  // busca só a conversa (não o pedido inteiro) e não consulta com a aba em segundo plano
  const atualizar = () => { if (document.hidden) return; api.get(`/pedidos/${pedido.id}/mensagens${lado === 'central' ? '?lado=central' : ''}`).then((p) => setMsgs(p.mensagens)).catch(() => {}); };
  useEffect(() => { const i = setInterval(atualizar, 20000); return () => clearInterval(i); }, [pedido.id]);
  const enviar = async () => {
    if (!t.trim()) return;
    setBusy(true);
    try { const r = await api.post(`/pedidos/${pedido.id}/mensagens`, { texto: t, lado }); setMsgs(r.mensagens); setT(''); onNova?.(); } catch (e) { toast(e.message, 'erro'); } finally { setBusy(false); }
  };
  const fechado = ['cancelado'].includes(pedido.status);
  return (
    <div className="sl-chat">
      <div className="sl-chat-head"><span><MessageSquare size={15} /> Conversa {lado === 'central' ? 'com o solicitante' : 'com a central'}</span>
        <button type="button" className="sl-link" onClick={atualizar}><RefreshCw size={13} /> Atualizar</button></div>
      <div className="sl-chat-msgs">
        {!msgs.length ? <Empty>Nenhuma mensagem ainda.</Empty> : msgs.map((m) => (
          m.papel === 'sistema'
            ? <div key={m.id} className="sl-msg-sis">{m.texto} · {fmtDateTime(m.created_at)}</div>
            : (
              <div key={m.id} className={`sl-msg ${m.papel === lado ? 'minha' : 'outra'}`}>
                <div className="sl-msg-quem">{m.autor_nome} · {m.papel === 'central' ? 'Central' : 'Solicitante'}</div>
                <div className="sl-msg-txt">{m.texto}</div>
                <div className="sl-msg-quando">{fmtDateTime(m.created_at)}{m.papel === lado && <> · {m.lida ? 'lida' : 'não lida'}</>}</div>
              </div>
            )
        ))}
        <div ref={fim} />
      </div>
      {!fechado && (
        <div className="sl-chat-novo">
          <textarea rows={2} value={t} onChange={(e) => setT(e.target.value)} placeholder={lado === 'central' ? 'Escreva para o solicitante (ex.: qual linha deu erro)' : 'Escreva uma mensagem para a central'}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviar(); }} />
          <Button onClick={enviar} disabled={busy || !t.trim()}><Send size={15} /> Enviar</Button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ dados do pedido
export function DadosPedido({ p, central }) {
  const campos = [
    central && ['Solicitante', p.solicitante_nome], central && ['E-mail', p.solicitante_email],
    ['Data do pedido', fmtDateTime(p.created_at)], ['Projeto', p.projeto], ['Código da visita', p.cod_visita], ['ID da carga', p.id_carga],
    ['Título', p.titulo], p.data_inicial && ['Período', `${fmtDate(p.data_inicial)} a ${fmtDate(p.data_final)}`],
    p.responsavel_nome && ['Atendido por', p.responsavel_nome], p.concluido_at && ['Concluído em', fmtDateTime(p.concluido_at)],
  ].filter((c) => c && c[1]);
  const total = (k) => p.linhas.reduce((s, l) => s + l[k], 0);
  return (
    <>
      <div className="sl-campos">{campos.map(([k, v]) => <div key={k}><small>{k}</small><span>{v}</span></div>)}</div>
      {p.motivo && <><div className="sl-label">Motivo</div><div className="sl-texto">{p.motivo}</div></>}
      {p.descricao && <><div className="sl-label">{p.subtipo === 'correcao' ? 'Observação do solicitante' : 'Descrição'}</div><div className="sl-texto">{p.descricao}</div></>}
      {p.arquivos.length > 0 && (
        <>
          <div className="sl-label">Anexo</div>
          <div className="sl-arquivos">
            {p.arquivos.map((a) => (
              <a key={a.id} className={`sl-arq-link ${a.ativo ? '' : 'antigo'}`} href={`/api/m/solicitacoes/arquivos/${a.id}`}>
                <FileSpreadsheet size={16} /> {a.nome} <span className="muted small">{kb(a.tamanho)} · {fmtDateTime(a.created_at)}{a.ativo ? '' : ' · versão anterior'}</span> <Download size={14} />
              </a>
            ))}
          </div>
        </>
      )}
      {p.linhas.length > 0 && (
        <>
          <div className="sl-label">Linhas da correção ({p.linhas.length}){central && <a className="sl-link sl-ml" href={`/api/m/solicitacoes/central/pedidos/${p.id}/linhas.xlsx`}><Download size={13} /> Baixar em Excel</a>}</div>
          <div className="sl-scroll sl-scroll-ver">
            <table className="table sl-table sl-table-ver">
              <thead><tr><th>Código</th><th>CNPJ / CPF</th><th>Data</th>{VALORES.map(([, l]) => <th key={l} className="num">{l}</th>)}</tr></thead>
              <tbody>{p.linhas.map((l) => <tr key={l.id}><td className="cell-strong">{l.cod_visita}</td><td>{l.documento_fmt || '—'}</td><td>{fmtDate(l.data)}</td>{VALORES.map(([k]) => <td key={k} className="num">{numBr(l[k])}</td>)}</tr>)}</tbody>
              {p.linhas.length > 1 && <tfoot><tr><td colSpan={3} className="small muted">Total</td>{VALORES.map(([k]) => <td key={k} className="num"><b>{numBr(total(k))}</b></td>)}</tr></tfoot>}
            </table>
          </div>
        </>
      )}
      {p.obs_central && <><div className="sl-label">Observação da central</div><div className={`sl-texto ${p.status === 'correcao' ? 'sl-texto-correcao' : ''}`}>{p.obs_central}</div></>}
    </>
  );
}
