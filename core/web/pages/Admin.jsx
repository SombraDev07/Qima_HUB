import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, X, Search, AlertTriangle, KeyRound, LockOpen } from 'lucide-react';
import { fmtDateTime } from '../shared/kit.jsx';
import { api } from '../shared/api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Badge, Button, Card, Field, PageHeader } from '../shared/ui.jsx';
import { ModuleIcon } from '../shared/icons.jsx';
import { useConfirm } from '../shared/dialogo.jsx';
import Relatorios from './admin/Relatorios.jsx';
import IA from './admin/IA.jsx';
import './admin/admin.css';

const ROLE_LABEL = { solicitante: 'Solicitante', central: 'Central', ambos: 'Solicitante + Central', rtv: 'RTV' };

// ===================================================================== Usuários

function UserForm({ initial, modules, onClose, onSaved }) {
  const editing = !!initial?.id;
  const [form, setForm] = useState(
    initial || { name: '', email: '', password: '', is_admin: false, active: true, access: {} },
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setAccess = (key, role) =>
    setForm((f) => {
      const access = { ...f.access };
      if (role) access[key] = role;
      else delete access[key];
      return { ...f, access };
    });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = { ...form };
      if (editing && !body.password) delete body.password;
      if (editing) await api(`/api/admin/users/${initial.id}`, { method: 'PUT', body });
      else await api('/api/admin/users', { method: 'POST', body });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <h3>{editing ? 'Editar conta' : 'Nova conta'}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="modal-body">
          <Alert>{error}</Alert>
          <div className="grid-2">
            <Field label="Nome"><input value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
            <Field label="E-mail"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required /></Field>
            <Field label={editing ? 'Nova senha' : 'Senha'} hint={editing ? 'Deixe em branco para manter a atual' : 'Mínimo de 8 caracteres, nada óbvio'}>
              <input type="password" value={form.password || ''} onChange={(e) => set('password', e.target.value)} required={!editing} minLength={8} maxLength={128} autoComplete="new-password" />
            </Field>
            <div className="checks">
              <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Conta ativa</label>
              <label className="check"><input type="checkbox" checked={form.is_admin} onChange={(e) => set('is_admin', e.target.checked)} /> Administrador do HUB</label>
            </div>
          </div>

          <h4 className="section-title">Sistemas e perfil</h4>
          <p className="muted small">Escolha quais cards a pessoa vê e se ela é <b>solicitante</b> (abre chamados), <b>central</b> (atende) ou ambos.</p>
          <div className="access-list">
            {modules.map((m) => (
              <div className="access-row" key={m.key}>
                <ModuleIcon name={m.icon} size={20} />
                <div className="access-name">
                  {m.title}
                  {m.status !== 'ativo' && <span className="soon">em breve</span>}
                </div>
                <select value={form.access[m.key] || ''} onChange={(e) => setAccess(m.key, e.target.value)}>
                  <option value="">Sem acesso</option>
                  <option value="solicitante">Solicitante</option>
                  <option value="central">Central</option>
                  <option value="ambos">Solicitante + Central</option>
                  <option value="rtv">RTV (sem telas por enquanto)</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-foot">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
        </div>
      </form>
    </div>
  );
}

function UsersTab({ modules }) {
  const { user: me, refresh: refreshMe } = useAuth();
  const confirmar = useConfirm();
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const load = () => api('/api/admin/users').then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const titles = useMemo(() => Object.fromEntries(modules.map((m) => [m.key, m.title])), [modules]);
  const filtered = users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()));

  const remove = async (u) => {
    if (!await confirmar({ titulo: `Excluir a conta de ${u.name}?`, mensagem: 'A pessoa perde o acesso ao HUB. Esta ação não pode ser desfeita.', confirmar: 'Excluir conta', perigo: true })) return;
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const [link, setLink] = useState(null);
  const gerarLink = async (u) => {
    setError('');
    try { setLink({ nome: u.name, ...(await api(`/api/admin/users/${u.id}/reset-link`, { method: 'POST', body: {} })) }); } catch (e) { setError(e.message); }
  };
  const desbloquear = async (u) => {
    setError('');
    try { await api(`/api/admin/users/${u.id}/desbloquear`, { method: 'POST', body: {} }); setLink({ nome: u.name, aviso: 'Login desbloqueado: a pessoa já pode tentar entrar de novo.' }); } catch (e) { setError(e.message); }
  };

  return (
    <>
      {link && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setLink(null)}>
          <div className="modal">
            <div className="modal-head"><h3>{link.link ? `Nova senha de ${link.nome}` : link.nome}</h3>
              <button type="button" className="icon-btn" onClick={() => setLink(null)} aria-label="Fechar"><X size={18} /></button></div>
            <div className="modal-body">
              {link.aviso && <p>{link.aviso}</p>}
              {link.link && (
                <>
                  <p className="muted small">Entregue este link à pessoa. Vale por {link.expira_em_min} minutos e só pode ser usado uma vez. Ele não aparece de novo; gere outro se precisar.</p>
                  <input readOnly value={link.link} onFocus={(e) => e.target.select()} />
                </>
              )}
            </div>
            <div className="modal-foot">
              {link.link && <Button variant="outline" onClick={() => navigator.clipboard?.writeText(link.link)}>Copiar link</Button>}
              <Button onClick={() => setLink(null)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
      <div className="toolbar">
        <div className="search">
          <Search size={16} />
          <input placeholder="Buscar por nome ou e-mail" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button onClick={() => setEditing({})}><Plus size={16} /> Nova conta</Button>
      </div>
      <Alert>{error}</Alert>

      <Card className="table-card">
        <table className="table">
          <thead>
            <tr><th>Nome</th><th>Sistemas e perfil</th><th>Situação</th><th /></tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="cell-strong">{u.name}</div>
                  <div className="muted small">{u.email}</div>
                </td>
                <td>
                  <div className="tags">
                    {Object.entries(u.access).map(([k, role]) => (
                      <span className="tag" key={k}>{titles[k] || k} · <b>{ROLE_LABEL[role]}</b></span>
                    ))}
                    {!Object.keys(u.access).length && <span className="muted small">Nenhum</span>}
                  </div>
                </td>
                <td>
                  <div className="tags">
                    {u.active ? <Badge tone="success">Ativa</Badge> : <Badge tone="muted">Inativa</Badge>}
                    {u.is_admin && <Badge tone="brand">Admin</Badge>}
                  </div>
                </td>
                <td className="row-actions">
                  <button className="icon-btn" title="Gerar link para criar nova senha" onClick={() => gerarLink(u)}><KeyRound size={16} /></button>
                  <button className="icon-btn" title="Desbloquear login (excesso de tentativas)" onClick={() => desbloquear(u)}><LockOpen size={16} /></button>
                  <button className="icon-btn" title="Editar" onClick={() => setEditing({ ...u, password: '' })}><Pencil size={16} /></button>
                  {u.id !== me.id && <button className="icon-btn danger" title="Excluir" onClick={() => remove(u)}><Trash2 size={16} /></button>}
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={4} className="muted center">Nenhuma conta encontrada</td></tr>}
          </tbody>
        </table>
      </Card>

      {editing && (
        <UserForm
          initial={editing.id ? editing : null}
          modules={modules}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); refreshMe(); }}
        />
      )}
    </>
  );
}

// ===================================================================== Sistemas

function ModulesTab({ modules, reload }) {
  const { refresh: refreshMe } = useAuth();
  const [error, setError] = useState('');

  const save = async (m, patch) => {
    setError('');
    try {
      await api(`/api/admin/modules/${m.key}`, { method: 'PUT', body: { status: m.status, sort_order: m.sort_order, enabled: m.enabled, ...patch } });
      await reload();
      refreshMe();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <p className="muted">Os sistemas são instalados como pastas em <code>modules/</code>. Aqui você controla se aparecem, se estão liberados ou “em breve”, e a ordem dos cards.</p>
      <Alert>{error}</Alert>
      <Card className="table-card">
        <table className="table">
          <thead>
            <tr><th>Sistema</th><th>Versão</th><th>Status</th><th>Ordem</th><th>Visível</th></tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m.key}>
                <td>
                  <div className="module-cell">
                    <ModuleIcon name={m.icon} size={22} />
                    <div>
                      <div className="cell-strong">{m.title}</div>
                      <div className="muted small">{m.description}</div>
                      {m.error && <div className="error-inline"><AlertTriangle size={14} /> Falha ao carregar: {m.error}</div>}
                    </div>
                  </div>
                </td>
                <td className="small">v{m.version || '?'}<div className="muted">banco v{m.dbVersion}</div></td>
                <td>
                  <select value={m.status} onChange={(e) => save(m, { status: e.target.value })}>
                    <option value="ativo">Ativo</option>
                    <option value="em_breve">Em breve</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    className="order-input"
                    defaultValue={m.sort_order}
                    onBlur={(e) => Number(e.target.value) !== m.sort_order && save(m, { sort_order: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <label className="switch">
                    <input type="checkbox" checked={m.enabled} onChange={(e) => save(m, { enabled: e.target.checked })} />
                    <span />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ===================================================================== Auditoria

const ACAO = {
  login_falhou: 'Login errado', login_bloqueado: 'Login bloqueado (excesso de tentativas)', login_desbloqueado: 'Login desbloqueado',
  senha_alterada: 'Senha alterada', senha_redefinida: 'Senha redefinida pelo link', senha_link_pedido: 'Link de senha pedido', senha_link_gerado: 'Link de senha gerado pela administração',
  usuario_criado: 'Conta criada', usuario_alterado: 'Conta alterada', usuario_excluido: 'Conta excluída',
};

function AuditoriaTab() {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => { api('/api/admin/auditoria').then(setLista).catch((e) => setErro(e.message)); }, []);
  return (
    <>
      <p className="muted small">Últimos 300 eventos de segurança: logins errados e bloqueados, trocas de senha, criação e mudança de contas e perfis.</p>
      <Alert>{erro}</Alert>
      <Card className="table-card">
        <table className="table">
          <thead><tr><th>Quando</th><th>Evento</th><th>Conta</th><th>Detalhe</th><th>IP</th></tr></thead>
          <tbody>
            {(lista || []).map((x) => (
              <tr key={x.id}>
                <td className="small">{fmtDateTime(x.created_at)}</td>
                <td>{ACAO[x.acao] || x.acao}</td>
                <td className="small">{x.usuario_email || '-'}</td>
                <td className="small">{x.detalhe || ''}</td>
                <td className="small">{x.ip || ''}</td>
              </tr>
            ))}
            {lista && !lista.length && <tr><td colSpan={5} className="muted center">Nada registrado ainda</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ===================================================================== Página

export default function Admin() {
  const [tab, setTab] = useState('users');
  const [modules, setModules] = useState([]);

  const loadModules = () => api('/api/admin/modules').then(setModules);
  useEffect(() => { loadModules(); }, []);

  return (
    <>
      <PageHeader title="Administração" subtitle="Contas, perfis de acesso, sistemas, relatórios e leitura por IA" />
      <div className="tabs">
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Contas</button>
        <button className={tab === 'modules' ? 'active' : ''} onClick={() => setTab('modules')}>Sistemas</button>
        <button className={tab === 'relatorios' ? 'active' : ''} onClick={() => setTab('relatorios')}>Relatórios</button>
        <button className={tab === 'ia' ? 'active' : ''} onClick={() => setTab('ia')}>Inteligência artificial</button>
        <button className={tab === 'auditoria' ? 'active' : ''} onClick={() => setTab('auditoria')}>Segurança</button>
      </div>
      {tab === 'users' && <UsersTab modules={modules} />}
      {tab === 'modules' && <ModulesTab modules={modules} reload={loadModules} />}
      {tab === 'relatorios' && <Relatorios />}
      {tab === 'ia' && <IA />}
      {tab === 'auditoria' && <AuditoriaTab />}
    </>
  );
}
