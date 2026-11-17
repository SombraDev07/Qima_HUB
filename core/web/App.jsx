import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './Layout.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Admin from './pages/Admin.jsx';
import Account from './pages/Account.jsx';
import ModuleHost from './pages/ModuleHost.jsx';

function Protected({ children, admin }) {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <div className="splash">Carregando…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (admin && !user.is_admin) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Home /></Protected>} />
      <Route path="/admin" element={<Protected admin><Admin /></Protected>} />
      <Route path="/conta" element={<Protected><Account /></Protected>} />
      <Route path="/m/:key/:view/*" element={<Protected><ModuleHost /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
