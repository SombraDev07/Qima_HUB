// Sininho do topo: pendências do usuário em todos os sistemas.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell as BellIcon, CheckCircle2, ChevronRight } from 'lucide-react';
import { api } from './shared/api.js';
import { ModuleIcon } from './shared/icons.jsx';
import { useAuth } from './auth.jsx';

const INTERVALO = 60_000;

/**
 * Sem props: pendências de todos os sistemas (tela inicial).
 * Com modulo + area: só as pendências daquele sistema e daquela área (barra do sistema).
 */
export default function Bell({ modulo, area }) {
  const { user } = useAuth();
  const [dados, setDados] = useState({ total: 0, itens: [] });
  const [aberto, setAberto] = useState(false);
  const [novo, setNovo] = useState(false);
  const ref = useRef();
  const location = useLocation();
  const navigate = useNavigate();
  const chave = `qh-sino-visto-${user?.id}${modulo ? `-${modulo}-${area}` : ''}`;

  const carregar = useCallback(async () => {
    try {
      // dentro de um sistema, o servidor só calcula as pendências dele
      let d = await api(`/api/notificacoes${modulo ? `?modulo=${encodeURIComponent(modulo)}` : ''}`);
      if (modulo) {
        const prefixo = `/m/${modulo}/${area}`;
        const itens = d.itens.filter((n) => n.modulo === modulo && (n.link === prefixo || n.link.startsWith(`${prefixo}/`)));
        d = { itens, total: itens.reduce((s, n) => s + n.qtd, 0) };
      }
      setDados(d);
      let visto = 0;
      try { visto = Number(localStorage.getItem(chave)) || 0; } catch {}
      setNovo(d.total > visto);
    } catch { /* sem sessão ou servidor fora: ignora */ }
  }, [chave, modulo, area]);

  useEffect(() => { carregar(); }, [location.pathname, carregar]);
  useEffect(() => {
    const t = setInterval(carregar, INTERVALO);
    const atualizar = () => setTimeout(carregar, 300);
    window.addEventListener('qh:atualizar', atualizar);
    window.addEventListener('focus', carregar);
    return () => { clearInterval(t); window.removeEventListener('qh:atualizar', atualizar); window.removeEventListener('focus', carregar); };
  }, [carregar]);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => ref.current && !ref.current.contains(e.target) && setAberto(false);
    const esc = (e) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); window.removeEventListener('keydown', esc); };
  }, [aberto]);

  const abrir = () => {
    setAberto(!aberto);
    setNovo(false);
    try { localStorage.setItem(chave, String(dados.total)); } catch {}
  };
  const ir = (n) => { setAberto(false); navigate(n.link); };

  // agrupa por sistema
  const grupos = dados.itens.reduce((acc, n) => {
    (acc[n.modulo] ||= { titulo: n.modulo_titulo, icone: n.icone, itens: [] }).itens.push(n);
    return acc;
  }, {});

  return (
    <div className={`sino ${modulo ? 'sino-modulo' : ''}`} ref={ref}>
      <button className={`icon-btn sino-btn ${novo ? 'sino-novo' : ''}`} onClick={abrir} title="Notificações"
        aria-label={dados.total ? `${dados.total} pendência(s)` : 'Notificações'}>
        <BellIcon size={19} />
        {dados.total > 0 && <span className="sino-badge">{dados.total > 99 ? '99+' : dados.total}</span>}
      </button>
      {aberto && (
        <div className="sino-painel" role="dialog" aria-label="Notificações">
          <div className="sino-head"><b>{modulo ? `Notificações · ${dados.itens[0]?.modulo_titulo || 'este sistema'}` : 'Notificações'}</b>{dados.total > 0 && <span className="muted small">{dados.total} pendência(s)</span>}</div>
          {!dados.itens.length ? (
            <div className="sino-vazio"><CheckCircle2 size={22} /> Tudo em dia. Nenhuma pendência.</div>
          ) : (
            <div className="sino-lista">
              {Object.entries(grupos).map(([k, g]) => (
                <div key={k} className="sino-grupo">
                  {!modulo && <div className="sino-grupo-tit"><span className="sino-ico"><ModuleIcon name={g.icone} size={14} /></span>{g.titulo}</div>}
                  {g.itens.map((n, i) => (
                    <button key={i} className="sino-item" onClick={() => ir(n)}>
                      <span className="sino-qtd">{n.qtd}</span>
                      <span className="sino-txt">{n.texto}</span>
                      <ChevronRight size={15} className="muted" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
