import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ModuleIcon } from '../shared/icons.jsx';

const can = (role, wanted) => role === 'ambos' || role === wanted;

function ModuleCard({ m }) {
  const navigate = useNavigate();
  const soon = m.status !== 'ativo';
  const canSol = !soon && can(m.role, 'solicitante');
  const canCen = !soon && can(m.role, 'central');

  return (
    <article className="module-card">
      <div className="module-card-top">
        <div>
          <h2>
            {m.title}
            {soon && <span className="soon">em breve</span>}
          </h2>
          <p className="module-desc">{m.description}</p>
          {m.summary && <p className="module-summary">{m.summary}</p>}
        </div>
        <ModuleIcon name={m.icon} size={60} strokeWidth={1.5} className="module-icon" />
      </div>
      <div className="module-actions">
        <button className="btn btn-primary" disabled={!canSol} onClick={() => navigate(`/m/${m.key}/solicitante`)}>
          {m.labels.solicitante}
        </button>
        <button className="btn btn-outline" disabled={!canCen} onClick={() => navigate(`/m/${m.key}/central`)}>
          {m.labels.central}
        </button>
      </div>
    </article>
  );
}

export default function Home() {
  const { modules, refresh } = useAuth();

  // Atualiza contadores dos cards sempre que volta para a tela inicial
  useEffect(() => { refresh(); }, [refresh]);

  if (!modules.length) {
    return (
      <div className="empty big">
        Você ainda não tem acesso a nenhum sistema.<br />Solicite à administração do HUB.
      </div>
    );
  }

  return (
    <div className="module-grid">
      {modules.map((m) => <ModuleCard key={m.key} m={m} />)}
    </div>
  );
}
