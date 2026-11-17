import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Alert } from '../shared/ui.jsx';

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <aside className="login-brand">
        <div className="login-brand-inner">
          <svg className="login-mark" viewBox="0 0 92 92" aria-hidden="true">
            <path fill="currentColor" d="M89.206 79.093 78.039 67.927a43.081 43.081 0 1 0-10.112 10.112l11.166 11.167a7.15 7.15 0 0 0 10.113-10.113M14.302 43.012a28.71 28.71 0 1 1 28.71 28.71 28.74 28.74 0 0 1-28.71-28.710" />
          </svg>
          <h2>Tudo em um só lugar.</h2>
          <p>Solicite, acompanhe e atenda os chamados de cada área pelo QIMA HUB.</p>
        </div>
      </aside>

      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <div className="login-logo">
            <img src="/qima-logo.svg" alt="QIMA" />
            <span className="brand-hub">HUB</span>
          </div>
          <h1>Entrar</h1>
          <p className="muted">Use seu e-mail corporativo e senha.</p>

          <Alert>{error}</Alert>

          <label className="field">
            <span className="field-label">E-mail</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span className="field-label">Senha</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>

          <button className="btn btn-brand btn-block" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="login-foot muted">Não tem acesso? Fale com a administração do HUB.</p>
        </form>
      </section>
    </div>
  );
}
