// Página de relatórios da Central: lista os sistemas em que a pessoa é da Central e baixa o Excel de cada um.
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { ModuleIcon } from '../shared/icons.jsx';
import { PageHeader, Empty } from '../shared/ui.jsx';
import { Janela } from '../shared/relatorio.jsx';

export const sistemasComRelatorio = (modules) => modules.filter((m) => m.status === 'ativo' && (m.role === 'central' || m.role === 'ambos'));

export default function Relatorios() {
  const { modules } = useAuth();
  const [sel, setSel] = useState(null);
  const lista = sistemasComRelatorio(modules);
  if (!lista.length) return <Navigate to="/" replace />;
  return (
    <>
      <PageHeader title="Relatórios" subtitle="Escolha o sistema e o período para baixar o Excel." back="/" />
      <div className="module-grid">
        {lista.map((m) => (
          <article key={m.key} className="module-card">
            <div className="module-card-top">
              <div>
                <h2>{m.title}</h2>
                <p className="module-desc">Pedidos do período, o que foi solicitado e como foi atendido, com abas de detalhe.</p>
              </div>
              <ModuleIcon name={m.icon} size={60} strokeWidth={1.5} className="module-icon" />
            </div>
            <div className="module-actions">
              <button type="button" className="btn btn-primary" onClick={() => setSel(m)}><FileSpreadsheet size={16} /> Baixar relatório</button>
            </div>
          </article>
        ))}
      </div>
      {!lista.length && <Empty>Nenhum sistema disponível.</Empty>}
      {sel && <Janela modulo={sel.key} titulo={sel.title} onClose={() => setSel(null)} />}
    </>
  );
}
