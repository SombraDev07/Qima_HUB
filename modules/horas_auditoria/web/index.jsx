// Telas do sistema Horas de Auditoria. Exporta { Solicitante, Central } para o núcleo do HUB.
// Solicitante = Planejamento (lança as horas e envia). Central = aprova, cadastra planejamentos e distritos.
import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ModuleNav, ToastProvider, moduleApi } from '@hub';
import Planejamento from './Planejamento.jsx';
import Aprovacoes from './Aprovacoes.jsx';
import Gestao from './Gestao.jsx';
import Historico from './Historico.jsx';
import './horas.css';

const api = moduleApi('horas_auditoria');

function usePendentes(ativo) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!ativo) return undefined;
    const ler = () => api.get('/planejamentos').then((l) => setN(l.reduce((s, p) => s + p.pendentes, 0))).catch(() => {});
    ler();
    window.addEventListener('qh:atualizar', ler);
    return () => window.removeEventListener('qh:atualizar', ler);
  }, [ativo]);
  return n;
}

function Shell({ module, area, children }) {
  const base = `/m/${module.key}/${area}`;
  const pend = usePendentes(area === 'central');
  const links = area === 'solicitante'
    ? [{ to: base, label: 'Planejamento', end: true }, { to: `${base}/historico`, label: 'Histórico' }]
    : [{ to: base, label: 'Aprovações', end: true, badge: pend || undefined }, { to: `${base}/planejamentos`, label: 'Planejamentos' }, { to: `${base}/historico`, label: 'Histórico' },
      { to: `/m/${module.key}/solicitante`, label: 'Lançar horas' }];
  return (
    <ToastProvider>
      <ModuleNav icon={module.icon} title={module.title} subtitle={module.labels[area]} links={links} />
      {children}
    </ToastProvider>
  );
}

export default {
  Solicitante: (props) => (
    <Shell {...props} area="solicitante">
      <Routes>
        <Route index element={<Planejamento api={api} />} />
        <Route path="historico" element={<Historico api={api} />} />
      </Routes>
    </Shell>
  ),
  Central: (props) => (
    <Shell {...props} area="central">
      <Routes>
        <Route index element={<Aprovacoes api={api} />} />
        <Route path="planejamentos" element={<Gestao api={api} />} />
        <Route path="historico" element={<Historico api={api} />} />
      </Routes>
    </Shell>
  ),
};
