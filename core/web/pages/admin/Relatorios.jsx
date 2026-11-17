// Administração › Relatórios: um Excel por sistema (abas Solicitante e Central) com filtro de datas.
import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, CalendarRange } from 'lucide-react';
import { api } from '../../shared/api.js';
import { Alert, Button, Card } from '../../shared/ui.jsx';
import { ModuleIcon } from '../../shared/icons.jsx';

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

// Usado na Administração (todos os sistemas) e na página Relatórios da Central (só os sistemas dela): muda só a rota.
export default function Relatorios({ rota = '/api/admin/relatorios' }) {
  const [sistemas, setSistemas] = useState(null);
  const [[de, ate], setPer] = useState(() => periodo('mes'));
  const [atalho, setAtalho] = useState('mes');
  const [erro, setErro] = useState('');
  useEffect(() => { api(rota).then(setSistemas).catch((e) => setErro(e.message)); }, [rota]);

  const valido = de && ate && ate >= de;
  const baixar = (key) => {
    if (!valido) return setErro('Confira o período: a data final não pode ser antes da inicial.');
    setErro('');
    window.location.href = `${rota}/${key}.xlsx?de=${de}&ate=${ate}`;
  };

  return (
    <div className="adm-rel">
      <Card className="adm-rel-periodo">
        <div className="adm-rel-titulo"><CalendarRange size={18} /> <b>Período</b> <span className="muted small">— considera a data em que cada pedido foi criado</span></div>
        <div className="adm-rel-linha">
          <label className="field adm-data"><span className="field-label">De</span><input type="date" value={de} onChange={(e) => { setPer([e.target.value, ate]); setAtalho(''); }} /></label>
          <label className="field adm-data"><span className="field-label">Até</span><input type="date" value={ate} min={de} onChange={(e) => { setPer([de, e.target.value]); setAtalho(''); }} /></label>
          <div className="adm-chips">
            {ATALHOS.map(([k, l]) => <button key={k} className={atalho === k ? 'on' : ''} onClick={() => { setPer(periodo(k)); setAtalho(k); }}>{l}</button>)}
          </div>
        </div>
        <Alert>{erro}</Alert>
      </Card>

      <Card className="adm-rel-todos">
        <div>
          <b><FileSpreadsheet size={18} /> Todos os sistemas em um arquivo</b>
          <p className="muted small">Uma aba de resumo e, para cada sistema, a aba <b>Solicitante</b> (o que foi pedido), a aba <b>Central</b> (como foi atendido) e as abas de detalhe.</p>
        </div>
        <Button onClick={() => baixar('todos')} disabled={!valido}><Download size={16} /> Baixar Excel geral</Button>
      </Card>

      <div className="adm-rel-grid">
        {(sistemas || []).map((s) => (
          <Card key={s.key} className="adm-rel-card">
            <div className="adm-rel-card-top"><span className="adm-rel-ico"><ModuleIcon name={s.icon} size={20} /></span><b>{s.title}</b></div>
            <ul className="small muted">
              <li>Solicitante — {s.labels?.solicitante || 'quem pede'}</li>
              <li>Central — {s.labels?.central || 'quem atende'}</li>
              {s.key === 'solicitacoes' && <li>Inclui a conversa completa de cada solicitação</li>}
            </ul>
            <Button variant="outline" onClick={() => baixar(s.key)} disabled={!valido}><Download size={15} /> Baixar Excel</Button>
          </Card>
        ))}
      </div>
      {sistemas?.length === 0 && <p className="muted">Nenhum sistema com relatório.</p>}
    </div>
  );
}
