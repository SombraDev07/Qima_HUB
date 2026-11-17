// Telas do sistema Frotas. Exporta { Solicitante, Central } para o núcleo do HUB.
// A barra mostra só os painéis da área por onde a pessoa entrou (solicitante OU central).
import { ModuleNav, ToastProvider } from '@hub';
import SolicitanteRoutes from './Solicitante.jsx';
import CentralRoutes from './Central.jsx';
import './frotas.css';

function Shell({ module, area, children }) {
  const base = `/m/${module.key}/${area}`;
  const links = area === 'solicitante'
    ? [{ to: base, label: 'Meus pedidos', end: true }, { to: `${base}/veiculos`, label: 'Meus veículos' }]
    : [
      { to: base, label: 'Aprovações', end: true }, { to: `${base}/reservas`, label: 'Novos pedidos' }, { to: `${base}/ativar`, label: 'Ativar veículo' },
      { to: `${base}/chamados`, label: 'Chamados' }, { to: `${base}/controle`, label: 'Controle mestre' }, { to: `${base}/configuracoes`, label: 'Configurações' },
    ];
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
