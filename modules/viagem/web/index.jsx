// Telas do sistema Viagem. Exporta { Solicitante, Central } para o núcleo do HUB.
// A barra mostra só os painéis da área por onde a pessoa entrou (solicitante OU central).
import { ToastProvider, ModuleNav } from '@hub';
import SolicitanteRoutes from './Solicitante.jsx';
import CentralRoutes from './Central.jsx';
import './viagem.css';

function Shell({ module, area, children }) {
  const base = `/m/${module.key}/${area}`;
  const links = area === 'solicitante'
    ? [{ to: base, label: 'Minhas viagens', end: true }, { to: `${base}/novo`, label: 'Nova viagem' }]
    : [{ to: base, label: 'Pedidos', end: true }, { to: `${base}/config`, label: 'Configurações' }];
  return (
    <ToastProvider>
      <div className="vg-root">
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
