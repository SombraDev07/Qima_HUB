import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, Settings, LogOut, UserRound, FileSpreadsheet } from 'lucide-react';
import { sistemasComRelatorio } from './pages/Relatorios.jsx';
import { useAuth } from './auth.jsx';
import Bell from './Bell.jsx';

export default function Layout({ children }) {
  const { user, logout, modules } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="QIMA HUB - início">
            <img src="/qima-logo.svg" alt="QIMA" />
            <span className="brand-hub">HUB</span>
          </Link>
          <nav className="nav">
            <NavLink to="/" end><LayoutGrid size={16} /> <span>Início</span></NavLink>
            {sistemasComRelatorio(modules).length > 0 && <NavLink to="/relatorios"><FileSpreadsheet size={16} /> <span>Relatórios</span></NavLink>}
            {user.is_admin && <NavLink to="/admin"><Settings size={16} /> <span>Administração</span></NavLink>}
          </nav>
          <div className="user-area">
            {/* dentro de um sistema o sininho fica na barra dele, só com as pendências dele */}
            {!location.pathname.startsWith('/m/') && <Bell />}
            <NavLink to="/conta" className="user-chip" title="Minha conta">
              <UserRound size={16} /> <span>{user.name}</span>
            </NavLink>
            <button
              className="icon-btn"
              title="Sair"
              onClick={async () => { await logout(); navigate('/login'); }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
