// Telas do sistema Nota NF. Exporta { Solicitante, Central } para o núcleo do HUB.
// A barra mostra só os painéis da área por onde a pessoa entrou (solicitante OU central).
import { ModuleNav, ToastProvider } from '@hub';
import SolicitanteRoutes from './Solicitante.jsx';
import CentralRoutes from './Central.jsx';
import './nota_nf.css';

function Shell({ module, area, children }) {
  const base = `/m/${module.key}/${area}`;
  const links = area === 'solicitante'
    ? [{ to: base, label: 'Enviar NF', end: true }, { to: `${base}/minhas`, label: 'Minhas NFs' }]
    : [{ to: base, label: 'NFs', end: true }, { to: `${base}/config`, label: 'Configurações' }];
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
