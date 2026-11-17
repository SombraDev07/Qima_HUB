// Componentes visuais compartilhados. Módulos devem usar estes em vez de criar
// seus próprios estilos, para manter a identidade visual do HUB.
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ModuleIcon } from './icons.jsx';
import Bell from '../Bell.jsx';

/**
 * Barra de navegação padrão de um sistema.
 * links: [{ to, label, end?, badge? }] — use apenas os que o perfil da pessoa permite.
 */
export function ModuleNav({ icon, title, subtitle, links }) {
  // sininho só deste sistema e desta área (/m/<sistema>/<area>/...)
  const [, , modulo, area] = useLocation().pathname.split('/');
  return (
    <div className="mod-nav">
      <div className="mod-nav-brand">
        <span className="mod-nav-icon"><ModuleIcon name={icon} size={19} /></span>
        <div><b>{title}</b>{subtitle && <small>{subtitle}</small>}</div>
      </div>
      <nav>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}>
            {l.label}{l.badge ? <span className="mod-nav-badge">{l.badge}</span> : null}
          </NavLink>
        ))}
      </nav>
      {modulo && area && <div className="mod-nav-sino"><Bell modulo={modulo} area={area} /></div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, back = '/', actions }) {
  return (
    <div className="page-header">
      <div>
        {back && (
          <Link to={back} className="back-link">
            <ArrowLeft size={16} /> Voltar
          </Link>
        )}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Button({ variant = 'primary', className = '', ...props }) {
  return <button className={`btn btn-${variant} ${className}`} {...props} />;
}

export function Card({ className = '', children }) {
  return <div className={`panel ${className}`}>{children}</div>;
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  return <div className={`alert alert-${kind}`}>{children}</div>;
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('pt-BR');
}
