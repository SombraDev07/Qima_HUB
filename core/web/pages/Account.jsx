import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { api } from '../shared/api.js';
import { Alert, Button, Card, Field, PageHeader } from '../shared/ui.jsx';

export default function Account() {
  const { user } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (form.next !== form.confirm) return setMsg({ kind: 'error', text: 'As senhas não conferem' });
    try {
      await api('/api/me/password', { method: 'POST', body: { current: form.current, next: form.next } });
      setForm({ current: '', next: '', confirm: '' });
      setMsg({ kind: 'success', text: 'Senha alterada com sucesso' });
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="narrow">
      <PageHeader title="Minha conta" subtitle={`${user.name} · ${user.email}`} />
      <Card>
        <form onSubmit={submit} className="form-grid">
          <h3>Alterar senha</h3>
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <Field label="Senha atual"><input type="password" value={form.current} onChange={set('current')} required autoComplete="current-password" /></Field>
          <Field label="Nova senha"><input type="password" value={form.next} onChange={set('next')} required minLength={8} maxLength={128} autoComplete="new-password" /></Field>
          <Field label="Confirmar nova senha"><input type="password" value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" /></Field>
          <div><Button type="submit">Salvar</Button></div>
        </form>
      </Card>
    </div>
  );
}
