// Telas do sistema Contratação. Exporta { Solicitante, Central } para o núcleo do HUB.
// A barra mostra só os painéis da área por onde a pessoa entrou (solicitante OU central).
import { ModuleNav, ToastProvider } from '@hub';
import SolicitanteRoutes from './Solicitante.jsx';
import CentralRoutes from './Central.jsx';
import './contratacao.css';

function Shell({ module, area, children }) {
  const base = `/m/${module.key}/${area}`;
  const links = area === 'solicitante'
    ? [{ to: base, label: 'Meus pedidos', end: true }, { to: `${base}/anexados`, label: 'Meus Colaboradores' }, { to: `${base}/novo`, label: 'Nova solicitação' }]
    : [{ to: base, label: 'Vagas', end: true }, { to: `${base}/candidatos`, label: 'Candidatos' }, { to: `${base}/demissoes`, label: 'Demissões' }];
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
