// Administração › App: contato da central que aparece no app de celular (botões Ligar, WhatsApp e E-mail).
import { useEffect, useState } from 'react';
import { Save, Smartphone } from 'lucide-react';
import { api } from '../../shared/api.js';
import { Alert, Button, Card, Field } from '../../shared/ui.jsx';

export default function AppCelular() {
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState({ tipo: '', texto: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/admin/app').then(setF).catch((e) => setMsg({ tipo: 'error', texto: e.message })); }, []);
  if (!f) return <Alert kind={msg.tipo || 'info'}>{msg.texto || 'Carregando…'}</Alert>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const salvar = async () => {
    setBusy(true); setMsg({ tipo: '', texto: '' });
    try { setF(await api('/api/admin/app', { method: 'PUT', body: f })); setMsg({ tipo: 'success', texto: 'Contato salvo. O app mostra na próxima vez que abrir.' }); }
    catch (e) { setMsg({ tipo: 'error', texto: e.message }); } finally { setBusy(false); }
  };
  return (
    <Card>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 0 }}><Smartphone size={18} /> Contato da central no app</h3>
      <p className="muted small">Aparece no Perfil e nos pedidos do app de celular, para o solicitante falar com a central com um toque. Deixe em branco o que não quiser mostrar.</p>
      {msg.texto && <Alert kind={msg.tipo}>{msg.texto}</Alert>}
      <div className="grid-2">
        <Field label="Telefone"><input value={f.telefone} onChange={set('telefone')} placeholder="(45) 3000-0000" maxLength={30} /></Field>
        <Field label="WhatsApp"><input value={f.whatsapp} onChange={set('whatsapp')} placeholder="(45) 99999-0000" maxLength={30} /></Field>
        <Field label="E-mail"><input type="email" value={f.email} onChange={set('email')} placeholder="central@empresa.com" maxLength={120} /></Field>
        <Field label="Horário de atendimento"><input value={f.horario} onChange={set('horario')} placeholder="Seg a sex, 8h às 18h" maxLength={80} /></Field>
      </div>
      <Button onClick={salvar} disabled={busy}><Save size={15} /> Salvar</Button>
    </Card>
  );
}
