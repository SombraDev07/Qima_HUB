// Carrega sob demanda a tela de um módulo (modules/<chave>/web/index.jsx).
// Cada sistema vira um pacote JS separado no build: atualizar um não mexe nos outros.
import { Component, Suspense, lazy, useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { moduleApi } from '../shared/api.js';
import { PageHeader, Empty } from '../shared/ui.jsx';

const loaders = import.meta.glob(['/modules/*/web/index.jsx', '!/modules/_*/**']);
const loaderFor = (key) => loaders[`/modules/${key}/web/index.jsx`];

const VIEWS = { solicitante: 'Solicitante', central: 'Central' };
const can = (role, wanted) => role === 'ambos' || role === wanted || (role === 'central' && wanted === 'solicitante');

class ModuleErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('[modulo] erro de tela:', error); }
  render() {
    if (this.state.error) {
      return <Empty>Este sistema apresentou um erro. Tente novamente mais tarde ou avise a administração.</Empty>;
    }
    return this.props.children;
  }
}

function UnderConstruction({ module, view }) {
  return (
    <>
      <PageHeader title={module.title} subtitle={module.labels[view]} />
      <Empty>Este sistema ainda está em construção.</Empty>
    </>
  );
}

export default function ModuleHost() {
  const { key, view } = useParams();
  const { modules, user } = useAuth();
  const module = modules.find((m) => m.key === key);

  const Screen = useMemo(() => {
    const load = loaderFor(key);
    if (!load || !VIEWS[view]) return null;
    return lazy(() =>
      load().then((mod) => ({ default: mod.default?.[VIEWS[view]] || (() => <UnderConstruction module={module} view={view} />) })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, view]);

  if (!module || !VIEWS[view] || module.status !== 'ativo' || !can(module.role, view)) return <Navigate to="/" replace />;
  if (!Screen) return <UnderConstruction module={module} view={view} />;

  return (
    <ModuleErrorBoundary key={`${key}/${view}`}>
      <Suspense fallback={<div className="splash">Carregando {module.title}…</div>}>
        <Screen module={module} user={user} role={module.role} api={moduleApi(key)} />
      </Suspense>
    </ModuleErrorBoundary>
  );
}
