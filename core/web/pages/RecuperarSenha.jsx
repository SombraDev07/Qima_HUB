// Telas públicas de recuperação de senha: "Esqueci minha senha" e "Redefinir senha" (link com token).
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../shared/api.js';
import { Alert } from '../shared/ui.jsx';

function Moldura({ titulo, subtitulo, children }) {
  return (
    <div className="login">
      <aside className="login-brand">
        <div className="login-brand-inner">
          <h2>Tudo em um só lugar.</h2>
          <p>Solicite, acompanhe e atenda os chamados de cada área pelo QIMA HUB.</p>
        </div>
      </aside>
      <section className="login-form-wrap">
        <div className="login-form">
          <div className="login-logo"><img src="/qima-logo.svg" alt="QIMA" /><span className="brand-hub">HUB</span></div>
          <h1>{titulo}</h1>
          {subtitulo && <p className="muted">{subtitulo}</p>}
          {children}
        </div>
      </section>
    </div>
  );
}

export function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const enviar = async (e) => {
    e.preventDefault(); setErro(''); setBusy(true);
    try { setMsg((await api('/api/auth/forgot', { method: 'POST', body: { email } })).mensagem); } catch (err) { setErro(err.message); } finally { setBusy(false); }
  };
  return (
    <Moldura titulo="Esqueci minha senha" subtitulo="Informe seu e-mail corporativo para receber o link de nova senha.">
      <form onSubmit={enviar}>
        <Alert>{erro}</Alert>
        {msg ? <Alert kind="success">{msg}</Alert> : (
          <>
            <label className="field"><span className="field-label">E-mail</span>
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
            <button className="btn btn-brand btn-block" disabled={busy}>{busy ? 'Enviando…' : 'Enviar link'}</button>
          </>
        )}
        <p className="login-foot muted"><Link to="/login">Voltar ao login</Link></p>
      </form>
    </Moldura>
  );
}

export function RedefinirSenha() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [senha, setSenha] = useState('');
  const [conf, setConf] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const salvar = async (e) => {
    e.preventDefault(); setErro('');
    if (senha !== conf) { setErro('As senhas não conferem'); return; }
    setBusy(true);
    try { await api('/api/auth/reset', { method: 'POST', body: { token, password: senha } }); setOk(true); } catch (err) { setErro(err.message); } finally { setBusy(false); }
  };
  return (
    <Moldura titulo="Nova senha" subtitulo="Crie uma senha com pelo menos 8 caracteres.">
      {ok ? (
        <>
          <Alert kind="success">Senha alterada. Você foi desconectado de outros aparelhos.</Alert>
          <Link className="btn btn-brand btn-block" to="/login">Entrar</Link>
        </>
      ) : (
        <form onSubmit={salvar}>
          <Alert>{erro || (!token ? 'Link inválido. Peça um novo.' : '')}</Alert>
          <label className="field"><span className="field-label">Nova senha</span>
            <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} maxLength={128} autoFocus /></label>
          <label className="field"><span className="field-label">Repita a senha</span>
            <input type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} required minLength={8} maxLength={128} /></label>
          <button className="btn btn-brand btn-block" disabled={busy || !token}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
          <p className="login-foot muted"><Link to="/esqueci-senha">Pedir outro link</Link></p>
        </form>
      )}
    </Moldura>
  );
}
