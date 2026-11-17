// Administração › Inteligência artificial: qual serviço lê as fotos e quais sistemas usam.
import { useEffect, useState } from 'react';
import { Bot, CheckCircle2, AlertTriangle, PlugZap, Save, KeyRound, ShieldCheck } from 'lucide-react';
import { api } from '../../shared/api.js';
import { Alert, Button, Card, Field } from '../../shared/ui.jsx';
import { ModuleIcon } from '../../shared/icons.jsx';
import { useConfirm } from '../../shared/dialogo.jsx';

const fmt = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

export default function IA() {
  const [d, setD] = useState(null);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState({ tipo: '', texto: '' });
  const [busy, setBusy] = useState(false);
  const confirmar = useConfirm();

  const aplicar = (x) => {
    setD(x);
    setF({ provedor: x.provedor, url: x.url, modelo: x.modelo, auth: x.auth, timeout_s: x.timeout_s, chave: '', limpar_chave: false,
      sistemas: Object.fromEntries(x.sistemas_ia.map((s) => [s.key, x.sistemas[s.key] !== false])) });
  };
  useEffect(() => { api('/api/admin/ia').then(aplicar).catch((e) => setMsg({ tipo: 'error', texto: e.message })); }, []);
  if (!f) return <Alert kind={msg.tipo || 'info'}>{msg.texto || 'Carregando…'}</Alert>;

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const usarPreset = (id) => {
    const p = d.presets.find((x) => x.id === id);
    if (p) setF((x) => ({ ...x, url: p.url, modelo: p.modelo || x.modelo, auth: p.auth }));
  };
  const salvar = async () => {
    if (f.provedor !== 'nenhum' && f.provedor !== 'demo' && !await confirmar({
      titulo: 'Enviar fotos para o serviço de IA?',
      mensagem: 'As fotos de notas e comprovantes dos sistemas marcados serão enviadas a este serviço para leitura. Confirme que o contrato com o fornecedor permite esse uso dos dados.',
      confirmar: 'Salvar e ligar',
    })) return;
    setBusy(true); setMsg({});
    try { aplicar(await api('/api/admin/ia', { method: 'PUT', body: f })); setMsg({ tipo: 'success', texto: 'Configuração salva.' }); } catch (e) { setMsg({ tipo: 'error', texto: e.message }); } finally { setBusy(false); }
  };
  const testar = async () => {
    setBusy(true); setMsg({});
    try {
      const r = await api('/api/admin/ia/testar', { method: 'POST' });
      setMsg({ tipo: 'success', texto: `Conexão OK em ${r.ms} ms · ${typeof r.resposta === 'string' ? r.resposta : `resposta: ${JSON.stringify(r.resposta)}`}` });
    } catch (e) { setMsg({ tipo: 'error', texto: `Falhou: ${e.message}` }); } finally { setBusy(false); }
  };
  const alterado = JSON.stringify({ ...f, chave: '' }) !== JSON.stringify({ provedor: d.provedor, url: d.url, modelo: d.modelo, auth: d.auth, timeout_s: d.timeout_s, chave: '', limpar_chave: false,
    sistemas: Object.fromEntries(d.sistemas_ia.map((s) => [s.key, d.sistemas[s.key] !== false])) }) || !!f.chave;
  const uso = (k) => d.uso.por_sistema.find((u) => u.module_key === k);
  const st = d.status;

  const OPCOES = [
    ['nenhum', 'Desligada', 'Os sistemas funcionam em modo manual: a pessoa digita os dados da foto.'],
    ['openai', 'Serviço de IA (API compatível com OpenAI)', 'OpenAI, Google Gemini, Azure OpenAI, OpenRouter ou um servidor próprio (Ollama). Informe URL, modelo e chave.'],
    ['demo', 'Demonstração', 'Só lê os cupons de teste gerados pelos scripts. Nunca use em produção.'],
    ...d.arquivos.map((a) => [`arquivo:${a}`, `Conector próprio: ${a}`, `Arquivo core/server/ai-providers/${a}.js`]),
  ];

  return (
    <div className="adm-ia">
      <Card className="adm-ia-status">
        <span className={`adm-ia-pill ${st.ativo ? 'ok' : st.erro ? 'erro' : ''}`}>
          {st.ativo ? <CheckCircle2 size={16} /> : st.erro ? <AlertTriangle size={16} /> : <Bot size={16} />}
          {st.ativo ? `Ligada · ${st.provedor === 'openai' ? `${st.modelo}` : st.provedor}` : st.erro ? 'Com erro' : 'Desligada'}
        </span>
        <span className="muted small">{d.salvo ? `Última alteração ${fmt(d.updated_at)}${d.updated_by ? ` por ${d.updated_by}` : ''}` : 'Usando o padrão do arquivo .env (ainda não salvo aqui)'}</span>
        {st.erro && <span className="small adm-erro">{st.erro}</span>}
      </Card>

      <div className="adm-ia-grid">
        <Card>
          <h3 className="adm-h3">Serviço de leitura</h3>
          <div className="adm-opcoes">
            {OPCOES.map(([k, t, dsc]) => (
              <label key={k} className={`adm-opcao ${f.provedor === k ? 'on' : ''}`}>
                <input type="radio" name="prov" checked={f.provedor === k} onChange={() => set('provedor', k)} />
                <span><b>{t}</b><small>{dsc}</small></span>
              </label>
            ))}
          </div>

          {f.provedor === 'openai' && (
            <div className="adm-ia-campos">
              <Field label="Modelo pronto">
                <select value="" onChange={(e) => usarPreset(e.target.value)}>
                  <option value="">Preencher com…</option>
                  {d.presets.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </Field>
              <Field label="URL da API" hint="Endereço base, sem /chat/completions"><input value={f.url} onChange={(e) => set('url', e.target.value)} placeholder="https://api.openai.com/v1" /></Field>
              <div className="adm-2">
                <Field label="Modelo" hint="Precisa ler imagens"><input value={f.modelo} onChange={(e) => set('modelo', e.target.value)} placeholder="ex.: gpt-4o-mini" /></Field>
                <Field label="Autenticação">
                  <select value={f.auth} onChange={(e) => set('auth', e.target.value)}>
                    <option value="bearer">Bearer (padrão)</option><option value="api-key">Cabeçalho api-key (Azure)</option><option value="nenhuma">Sem chave (servidor local)</option>
                  </select>
                </Field>
              </div>
              {f.auth !== 'nenhuma' && (
                <Field label="Chave da API" hint={d.chave_definida && !f.limpar_chave ? `Já existe uma chave salva (termina em ${d.chave_final}). Deixe em branco para manter.` : 'Cole a chave fornecida pelo serviço.'}>
                  <div className="adm-chave">
                    <KeyRound size={16} />
                    <input type="password" autoComplete="new-password" value={f.chave} onChange={(e) => set('chave', e.target.value)}
                      placeholder={d.chave_definida && !f.limpar_chave ? `•••••••• ${d.chave_final}` : 'cole a chave aqui'} />
                  </div>
                </Field>
              )}
              {d.chave_definida && <label className="check small"><input type="checkbox" checked={f.limpar_chave} onChange={(e) => set('limpar_chave', e.target.checked)} /> Apagar a chave salva</label>}
              <Field label="Tempo máximo por leitura (segundos)"><input type="number" min={10} max={180} value={f.timeout_s} onChange={(e) => set('timeout_s', e.target.value)} /></Field>
              <p className="small muted adm-seg"><ShieldCheck size={14} /> A chave fica criptografada no servidor e nunca volta para a tela. Guarde o arquivo <code>data/.chave-hub</code> junto com o backup do banco.</p>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="adm-h3">Sistemas que usam a IA</h3>
          <p className="small muted">Desligue um sistema para ele voltar ao modo manual sem afetar os outros.</p>
          <div className="adm-ia-sis">
            {d.sistemas_ia.map((s) => {
              const u = uso(s.key);
              return (
                <label key={s.key} className={`adm-ia-sis-item ${f.sistemas[s.key] ? 'on' : ''}`}>
                  <input type="checkbox" checked={!!f.sistemas[s.key]} onChange={(e) => set('sistemas', { ...f.sistemas, [s.key]: e.target.checked })} />
                  <span className="adm-rel-ico"><ModuleIcon name={s.icon} size={18} /></span>
                  <span className="adm-ia-sis-txt"><b>{s.title}</b><small>{s.uso}</small>
                    <small>{u ? `Últimos 30 dias: ${u.total} leitura(s) · ${u.falhas} falha(s) · média ${(u.ms_medio / 1000).toFixed(1)} s` : 'Nenhuma leitura nos últimos 30 dias'}</small></span>
                </label>
              );
            })}
          </div>
          {d.uso.ultimos_erros.length > 0 && (
            <>
              <h4 className="adm-h4">Últimas falhas</h4>
              <ul className="adm-erros">{d.uso.ultimos_erros.map((e, i) => <li key={i}><span className="muted">{fmt(e.created_at)} · {e.module_key}</span> {e.erro}</li>)}</ul>
            </>
          )}
          <p className="small muted">Outros sistemas passam a aparecer aqui quando declararem <code>"ia"</code> no <code>module.json</code>.</p>
        </Card>
      </div>

      <Alert kind={msg.tipo === 'success' ? 'success' : 'error'}>{msg.texto}</Alert>
      <div className="adm-ia-acoes">
        <Button onClick={salvar} disabled={busy || !alterado}><Save size={16} /> Salvar</Button>
        <Button variant="outline" onClick={testar} disabled={busy || alterado || d.provedor === 'nenhum'} title={alterado ? 'Salve antes de testar' : ''}><PlugZap size={16} /> Testar conexão</Button>
        {alterado && <span className="small muted">Há alterações não salvas.</span>}
      </div>
    </div>
  );
}
