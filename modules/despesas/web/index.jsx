// Telas do sistema Despesas. Exporta { Solicitante, Central } para o núcleo do HUB.
// A barra mostra só os painéis da área por onde a pessoa entrou (solicitante OU central).
import { ToastProvider, ModuleNav } from '@hub';
import SolicitanteRoutes from './Solicitante.jsx';
import CentralRoutes from './Central.jsx';
import './despesas.css';

function Shell({ module, area, children }) {
  const base = `/m/${module.key}/${area}`;
  const links = area === 'solicitante'
    ? [{ to: base, label: 'Novo pedido', end: true }, { to: `${base}/pedidos`, label: 'Meus pedidos' }]
    : [{ to: base, label: 'Central', end: true }, { to: `${base}/financeiro`, label: 'Financeiro' }, { to: `${base}/config`, label: 'Configurações' }];
  return (
    <ToastProvider>
      <div className="dp-root">
        <ModuleNav icon={module.icon} title={module.title} subtitle={module.labels[area]} links={links} />
        {children}
      </div>
    </ToastProvider>
  );
}

export default {
  Solicitante: (props) => <Shell {...props} area="solicitante"><SolicitanteRoutes {...props} /></Shell>,
  Central: (props) => <Shell {...props} area="central"><CentralRoutes {...props} /></Shell>,
};
