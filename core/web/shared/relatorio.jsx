// Botão "Relatório" da barra de cada sistema (só para quem é da Central dele):
// baixa o Excel do próprio sistema, por período. Não dá acesso a nada da Administração.
import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Modal } from './kit.jsx';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function periodo(tipo) {
  const h = new Date();
  const y = h.getFullYear(); const m = h.getMonth();
  if (tipo === 'mes') return [iso(new Date(y, m, 1)), iso(h)];
  if (tipo === 'mes_passado') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
  if (tipo === '30') return [iso(new Date(y, m, h.getDate() - 29)), iso(h)];
  if (tipo === '90') return [iso(new Date(y, m, h.getDate() - 89)), iso(h)];
  return [iso(new Date(y, 0, 1)), iso(h)];
}
const ATALHOS = [['mes', 'Este mês'], ['mes_passado', 'Mês passado'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['ano', 'Este ano']];

function Janela({ modulo, titulo, onClose }) {
  const [[de, ate], setPer] = useState(() => periodo('mes'));
  const [atalho, setAtalho] = useState('mes');
  const valido = de && ate && ate >= de;
  const baixar = () => {
    if (!valido) return;
    window.location.href = `/api/m/${modulo}/relatorio.xlsx?de=${de}&ate=${ate}`;
    onClose();
  };
  return (
    <Modal
      title={`Relatório · ${titulo}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Fechar</button>
          <button type="button" className="btn btn-primary" onClick={baixar} disabled={!valido}><Download size={16} /> Baixar Excel</button>
        </>
      )}
    >
      <p className="muted small" style={{ marginTop: 0 }}>
        Todos os dados do sistema em um Excel: a aba <b>Solicitante</b> (o que foi pedido) e a aba <b>Central</b> (como foi atendido),
        mais as abas de detalhe. Considera a data em que cada pedido foi criado.
      </p>
      <div className="rel-linha">
        <label className="field rel-data"><span className="field-label">De</span><input type="date" value={de} onChange={(e) => { setPer([e.target.value, ate]); setAtalho(''); }} /></label>
        <label className="field rel-data"><span className="field-label">Até</span><input type="date" value={ate} min={de} onChange={(e) => { setPer([de, e.target.value]); setAtalho(''); }} /></label>
      </div>
      <div className="rel-chips">
        {ATALHOS.map(([k, l]) => <button type="button" key={k} className={atalho === k ? 'on' : ''} onClick={() => { setPer(periodo(k)); setAtalho(k); }}>{l}</button>)}
      </div>
      {!valido && <p className="alert alert-error" style={{ marginTop: 12 }}>A data final não pode ser antes da inicial.</p>}
    </Modal>
  );
}

export function RelatorioBotao({ modulo, titulo }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className="mod-nav-rel" onClick={() => setAberto(true)} title="Baixar o relatório deste sistema em Excel">
        <FileSpreadsheet size={16} /> Relatório
      </button>
      {aberto && <Janela modulo={modulo} titulo={titulo} onClose={() => setAberto(false)} />}
    </>
  );
}
