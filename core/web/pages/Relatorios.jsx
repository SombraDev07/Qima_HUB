// Página Relatórios da Central: o mesmo painel da Administração, mas só com os sistemas em que a pessoa é Central.
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { PageHeader } from '../shared/ui.jsx';
import PainelRelatorios from './admin/Relatorios.jsx';
import './admin/admin.css';

export const sistemasComRelatorio = (modules) => modules.filter((m) => m.status === 'ativo' && (m.role === 'central' || m.role === 'ambos'));

export default function Relatorios() {
  const { modules } = useAuth();
  if (!sistemasComRelatorio(modules).length) return <Navigate to="/" replace />;
  return (
    <>
      <PageHeader title="Relatórios" subtitle="Baixe o Excel dos sistemas em que você é Central, por período." back="/" />
      <PainelRelatorios rota="/api/relatorios" />
    </>
  );
}
