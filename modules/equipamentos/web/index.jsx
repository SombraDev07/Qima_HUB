// Telas do sistema Equipamentos. Exporta { Solicitante, Central } para o núcleo do HUB.
// Solicitante = Operação (pede, acompanha, troca e devolve). Central = Administrativo (cadastra, reserva, envia).
import { ModuleNav, ToastProvider } from '@hub';
import SolicitanteRoutes from './Solicitante.jsx';
import CentralRoutes from './Central.jsx';
import './equipamentos.css';

function Shell({ module, area, children }) {
  const base = `/m/${module.key}/${area}`;
  const links = area === 'solicitante'
    ? [{ to: base, label: 'Solicitações', end: true }, { to: `${base}/responsaveis`, label: 'Responsáveis' }]
    : [{ to: base, label: 'Equipamentos', end: true }, { to: `${base}/solicitacoes`, label: 'Solicitações' }];
  return (
    <ToastProvider>
      <ModuleNav icon={module.icon} title={module.title} subtitle={module.labels[area]} links={links} />
      {children}
    </ToastProvider>
  );
}

export default {
  Solicitante: (props) => <Shell {...props} area="solicitante"><SolicitanteRoutes {...props} /></Shell>,
  Central: (props) => <Shell {...props} area="central"><CentralRoutes {...props} /></Shell>,
};
