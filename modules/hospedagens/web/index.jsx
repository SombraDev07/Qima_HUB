// Telas do sistema Hospedagens. Exporta { Solicitante, Central } para o núcleo do HUB.
// A barra mostra só os painéis da área por onde a pessoa entrou (solicitante OU central).
import { Route, Routes } from 'react-router-dom';
import { ModuleNav, ToastProvider } from '@hub';
import SolicitanteRoutes from './Solicitante.jsx';
import PedidosCentral from './central/Pedidos.jsx';
import DetalheCentral from './central/Detalhe.jsx';
import Hoteis from './central/Hoteis.jsx';
import Financeiro from './central/Financeiro.jsx';
import './hospedagens.css';

function Shell({ module, area, children }) {
  const base = `/m/${module.key}/${area}`;
  const links = area === 'solicitante'
    ? [{ to: base, label: 'Meus pedidos', end: true }, { to: `${base}/novo`, label: 'Nova solicitação' }]
    : [{ to: base, label: 'Pedidos', end: true }, { to: `${base}/hoteis`, label: 'Hotéis' }, { to: `${base}/financeiro`, label: 'Financeiro' }];
  return (
    <ToastProvider>
      <ModuleNav icon={module.icon} title={module.title} subtitle={module.labels[area]} links={links} />
      {children}
    </ToastProvider>
  );
}

function Solicitante(props) {
  return <Shell {...props} area="solicitante"><SolicitanteRoutes {...props} /></Shell>;
}

function Central(props) {
  return (
    <Shell {...props} area="central">
      <Routes>
        <Route index element={<PedidosCentral {...props} />} />
        <Route path="pedido/:id" element={<DetalheCentral {...props} />} />
        <Route path="hoteis" element={<Hoteis {...props} />} />
        <Route path="financeiro" element={<Financeiro {...props} />} />
      </Routes>
    </Shell>
  );
}

export default { Solicitante, Central };
