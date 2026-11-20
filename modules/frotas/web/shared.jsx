// Peças usadas pelas telas do solicitante e da central do Frotas.
import { useEffect, useRef, useState } from 'react';
import { Camera, MapPin, X, Wrench, RefreshCw, UserRoundCog, FileX2 } from 'lucide-react';
import { Button, Field, Lightbox, Modal, fmtDate, fmtDateTime, todayISO, useAuth, useToast } from '@hub';

export const TONS = {
  rascunho: 'muted', solicitado: 'amarelo', aprovado: 'azul', reprovado: 'vermelho', reservado: 'escuro', em_uso: 'verde', encerrado: 'muted',
  substituido: 'muted', trocado: 'muted',
  pendente: 'amarelo', agendado: 'verde', finalizado: 'muted', cancelado: 'muted',
};
export function Status({ s, label }) {
  return <span className={`fr-st fr-st-${TONS[s] || 'muted'}`}>{label || s}</span>;
}

export const TIPO_ICONE = { manutencao: Wrench, troca: RefreshCw, substituicao: UserRoundCog, encerramento: FileX2 };
export function TipoChamado({ c }) {
  const I = TIPO_ICONE[c.tipo] || Wrench;
  return <span className={`fr-tipo fr-tipo-${c.tipo}`}><I size={14} /> {c.tipo_label}</span>;
}

/** Configuração do sistema (listas), carregada uma vez por tela. */
export function useConfig(api) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api.get('/config').then(setCfg).catch(() => setCfg(false)); }, []);
  return cfg;
}

export const placaFmt = (v) => {
  const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  return /^[A-Z]{3}\d{4}$/.test(s) ? `${s.slice(0, 3)}-${s.slice(3)}` : s;
};
// ------------------------------------------------------------------ modalidade e prazo
/** 'mensal', 'diaria' ou '' pelo nome cadastrado da modalidade. */
export const tipoModalidade = (nome) => {
  const n = String(nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return n.startsWith('mens') ? 'mensal' : n.startsWith('diar') ? 'diaria' : '';
};
export const DIAS_MENSAL = 30;
export const somaDias = (iso, n) => { if (!iso) return ''; const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaLocal = () => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
/** Dias de hoje até a data (negativo = já passou). */
export const diasAte = (iso) => (iso ? Math.round((Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) - diaLocal()) / 86400000) : null);
/** Cor do prazo: vermelho até 2 dias (ou vencido), amarelo até 7, verde depois. */
export const tomPrazo = (n) => (n === null ? '' : n <= 2 ? 'vermelho' : n <= 7 ? 'amarelo' : 'verde');
export const textoPrazo = (n) => (n === null ? '' : n === 0 ? 'vence hoje' : n === 1 ? '1 dia' : n === -1 ? '-1 dia' : `${n} dias`);
/** Data limite + contagem de dias (fica amarela e vermelha perto do fim; negativa quando venceu). */
export function PrazoTag({ data, ativo = true }) {
  if (!data) return <span className="muted">—</span>;
  const n = ativo ? diasAte(data) : null;
  return (
    <span className="fr-prazo">
      {fmtDate(data)}
      {n !== null && <span className={`fr-prazo-n fr-prazo-${tomPrazo(n)}`} title={n < 0 ? `Venceu há ${-n} dia(s) e não foi renovado` : `Faltam ${n} dia(s)`}>{textoPrazo(n)}</span>}
    </span>
  );
}

export const km = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('pt-BR'));
export const veic = (v) => [v.modelo, v.placa].filter(Boolean).join(' · ') || 'Veículo sem placa';
export const Opcoes = ({ lista, vazio = 'Selecione…' }) => (
  <>
    <option value="">{vazio}</option>
    {(lista || []).map((o) => <option key={o} value={o}>{o}</option>)}
  </>
);

/** Lista de nomes para o campo de motorista/condutor (aceita digitar um nome novo). */
export function Colaboradores({ id, lista }) {
  return <datalist id={id}>{(lista || []).map((n) => <option key={n} value={n} />)}</datalist>;
}

// =========================================================================== fotos do carro (com GPS)
function posicao() {
  return new Promise((ok, falha) => {
    if (!navigator.geolocation) return falha(new Error('Este aparelho não informa a localização.'));
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude, precisao: p.coords.accuracy }),
      () => falha(new Error('Sem localização. Libere o GPS do navegador e tire a foto de novo.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}

/** Grava o carimbo (lado, placa, data/hora, GPS e quem tirou) na própria foto. */
async function carimbar(file, linhas) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k); const h = Math.round(bmp.height * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0, w, h);
  const fs = Math.max(14, Math.round(w / 48));
  const faixa = fs * 1.45 * linhas.length + fs;
  g.fillStyle = 'rgba(12,48,62,.78)';
  g.fillRect(0, h - faixa, w, faixa);
  g.fillStyle = '#fff';
  g.font = `600 ${fs}px Segoe UI, Arial, sans-serif`;
  linhas.forEach((t, i) => g.fillText(t, fs * 0.7, h - faixa + fs * 1.35 * (i + 1)));
  return new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível ler a foto.'))), 'image/jpeg', 0.86));
}

function LadoFoto({ angulo, foto, enviando, onTirar, onVer, podeTirar }) {
  const ref = useRef();
  return (
    <div className="fr-lado">
      <div className="fr-lado-info">
        <b>{angulo}</b>
        {foto ? (
          <span className="small muted">
            {fmtDateTime(foto.tirada_em)}<br />
            <MapPin size={12} /> {foto.lat != null ? `${Number(foto.lat).toFixed(5)}, ${Number(foto.lon).toFixed(5)}` : 'Sem GPS'}<br />
            {foto.autor_nome}
          </span>
        ) : <span className="small muted">sem foto</span>}
      </div>
      {podeTirar && (
        <>
          <Button className="btn-sm" onClick={() => ref.current.click()} disabled={enviando}><Camera size={15} /> {enviando ? 'Enviando…' : foto ? 'Refazer' : 'Câmera'}</Button>
          <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onTirar(f); }} />
        </>
      )}
      <button type="button" className="fr-lado-thumb" onClick={foto ? onVer : undefined} disabled={!foto}>
        {foto ? <img src={`/api/m/frotas/foto/${foto.id}`} alt={angulo} loading="lazy" /> : <Camera size={22} />}
      </button>
    </div>
  );
}

/** Painel lateral "Fotos do carro": lados do carro + triângulo + medidor de pneu + estepe e macaco, cada foto exige GPS. */
export function FotosCarro({ veiculo, onClose, podeTirar = true, onChange }) {
  const { user } = useAuth();
  const toast = useToast();
  const [fotos, setFotos] = useState(null);
  const [enviando, setEnviando] = useState('');
  const [ver, setVer] = useState(null);
  const [angulos, setAngulos] = useState([]);
  const carregar = () => fetch(`/api/m/frotas/veiculos/${veiculo.id}/fotos`, { credentials: 'same-origin' }).then((r) => r.json()).then(setFotos).catch(() => setFotos([]));
  useEffect(() => { carregar(); fetch('/api/m/frotas/config', { credentials: 'same-origin' }).then((r) => r.json()).then((c) => setAngulos(c.angulos || [])); }, [veiculo.id]);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && !ver && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [ver, onClose]);

  const ultima = (a) => (fotos || []).find((f) => f.angulo === a);
  const tirar = async (angulo, file) => {
    setEnviando(angulo);
    try {
      // GPS é opcional: sem localização a foto entra com "Sem GPS" no carimbo
      const pos = await posicao().catch(() => null);
      const quando = new Date();
      const blob = await carimbar(file, [
        `${angulo} · ${veiculo.placa || veiculo.codigo_reserva || ''}`,
        `${quando.toLocaleString('pt-BR')} · ${pos ? `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}` : 'Sem GPS'}`,
        `${user.name} · ${user.email}`,
      ]);
      // horário em UTC, como o resto do banco (a tela converte para o fuso de quem vê)
      const qs = new URLSearchParams({ angulo, tirada_em: quando.toISOString().slice(0, 19),
        ...(pos ? { lat: pos.lat, lon: pos.lon, precisao: pos.precisao ?? '' } : {}) });
      const r = await fetch(`/api/m/frotas/veiculos/${veiculo.id}/fotos?${qs}`, { method: 'POST', credentials: 'same-origin', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Não salvou a foto.');
      toast(pos ? `Foto ${angulo} salva` : `Foto ${angulo} salva sem GPS`);
      await carregar();
      onChange?.();
    } catch (e) {
      toast(e.message, 'erro');
    } finally { setEnviando(''); }
  };

  const feitas = angulos.filter((a) => ultima(a)).length;
  return (
    <div className="fr-gaveta-fundo" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="fr-gaveta" role="dialog" aria-label="Fotos do carro">
        <div className="fr-gaveta-head">
          <div><h3>Fotos do carro</h3><span className="muted small">{veic(veiculo)}{veiculo.motorista ? ` · ${veiculo.motorista}` : ''}</span></div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>
        <p className="small muted fr-m0">A foto grava o item, data, hora, GPS (quando o aparelho informa) e quem tirou. As fotos são opcionais: o veículo pode ser ativado sem elas — {feitas}/{angulos.length} feitas.</p>
        {fotos === null ? <p className="muted">Carregando…</p> : (
          <div className="fr-lados">
            {angulos.map((a) => (
              <LadoFoto key={a} angulo={a} foto={ultima(a)} enviando={enviando === a} podeTirar={podeTirar}
                onTirar={(f) => tirar(a, f)} onVer={() => setVer(ultima(a))} />
            ))}
          </div>
        )}
        {fotos?.length > feitas && <p className="small muted">Histórico: {fotos.length} foto(s) guardada(s) deste veículo.</p>}
      </aside>
      {ver && <Lightbox src={`/api/m/frotas/foto/${ver.id}`} downloadUrl={`/api/m/frotas/foto/${ver.id}?download=1`} titulo={`${ver.angulo} · ${veiculo.placa || ''}`}
        subtitulo={`${fmtDateTime(ver.tirada_em)} · ${ver.autor_nome}`} onClose={() => setVer(null)} />}
    </div>
  );
}

// =========================================================================== formulários de operação
/** Troca de veículo: devolve o atual e cadastra o novo (central direto ou solicitante ao finalizar). */
export function TrocaForm({ v, f, set, comMotivo }) {
  return (
    <>
      <p className="small muted fr-m0">Veículo atual: <b>{veic(v)}</b> · km de retirada {km(v.km_retirada)}</p>
      <div className="fr-grid2">
        <Field label="Km de devolução *"><input inputMode="numeric" value={f.km_devolucao ?? ''} onChange={(e) => set('km_devolucao', e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Data de devolução *"><input type="date" value={f.data_devolucao ?? ''} onChange={(e) => set('data_devolucao', e.target.value)} /></Field>
        <Field label="Nova placa *"><input value={f.placa_nova ?? ''} onChange={(e) => set('placa_nova', placaFmt(e.target.value))} placeholder="ABC-1234" /></Field>
        <Field label="Modelo novo *"><input value={f.modelo_novo ?? ''} onChange={(e) => set('modelo_novo', e.target.value)} /></Field>
        <Field label="Data de início *"><input type="date" value={f.data_inicio ?? ''} onChange={(e) => set('data_inicio', e.target.value)} /></Field>
        <Field label="Km inicial *"><input inputMode="numeric" value={f.km_inicial ?? ''} onChange={(e) => set('km_inicial', e.target.value.replace(/\D/g, ''))} /></Field>
      </div>
      {comMotivo && <Field label="Motivo *"><textarea rows={2} value={f.motivo ?? ''} onChange={(e) => set('motivo', e.target.value)} /></Field>}
    </>
  );
}

/** Abertura de chamado pelo solicitante. */
export function ChamadoDialog({ api, veiculo, tipo, cfg, onClose, onDone }) {
  const [f, setF] = useState({ tipo, data_saida_condutor: todayISO() });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const toast = useToast();
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const titulos = { manutencao: 'Solicitar manutenção', troca: 'Solicitar troca de veículo', substituicao: 'Substituir condutor', encerramento: 'Encerrar contrato' };
  const enviar = async () => {
    setBusy(true); setErro('');
    try {
      await api.post(`/meus/veiculos/${veiculo.id}/chamados`, f);
      toast('Solicitação enviada para aprovação da central');
      window.dispatchEvent(new Event('qh:atualizar'));
      onDone();
    } catch (e) { setErro(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={titulos[tipo]} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={enviar} disabled={busy}>{busy ? 'Enviando…' : 'Enviar'}</Button></>}>
      <p className="small muted fr-m0">{veic(veiculo)} · motorista {veiculo.motorista || '—'}</p>
      {erro && <div className="alert alert-error">{erro}</div>}
      {tipo === 'manutencao' && (
        <Field label="Tipo de manutenção *">
          <select value={f.tipo_manutencao || ''} onChange={(e) => set('tipo_manutencao', e.target.value)}><Opcoes lista={cfg.tipos_manutencao} /></select>
        </Field>
      )}
      {tipo === 'troca' && (
        <div className="fr-grid2">
          <Field label="Data desejada *"><input type="date" value={f.data_inicio_nova || ''} onChange={(e) => set('data_inicio_nova', e.target.value)} /></Field>
          <Field label="Onde fazer a troca *"><input value={f.local_servico || ''} onChange={(e) => set('local_servico', e.target.value)} placeholder="Cidade / agência" /></Field>
        </div>
      )}
      {tipo === 'substituicao' && (
        <>
          <Field label="Novo condutor *"><input list="fr-colab-ch" value={f.condutor_novo || ''} onChange={(e) => set('condutor_novo', e.target.value)} placeholder="Nome do colaborador" /></Field>
          <Colaboradores id="fr-colab-ch" lista={cfg.colaboradores} />
          <div className="fr-grid2">
            <Field label="Saída do condutor atual *"><input type="date" value={f.data_saida_condutor || ''} onChange={(e) => set('data_saida_condutor', e.target.value)} /></Field>
            <Field label="Início do novo condutor *"><input type="date" value={f.data_inicio_nova || ''} onChange={(e) => set('data_inicio_nova', e.target.value)} /></Field>
          </div>
        </>
      )}
      {tipo === 'encerramento' && (
        <div className="fr-grid2">
          <Field label="Km de devolução *" hint={`Retirada com ${km(veiculo.km_retirada)} km`}><input inputMode="numeric" value={f.km_devolucao || ''} onChange={(e) => set('km_devolucao', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Data prevista de devolução *"><input type="date" value={f.data_devolucao || ''} onChange={(e) => set('data_devolucao', e.target.value)} /></Field>
        </div>
      )}
      <Field label={tipo === 'manutencao' ? 'Descreva o problema *' : 'Motivo *'}>
        <textarea rows={3} value={f.motivo || ''} onChange={(e) => set('motivo', e.target.value)} />
      </Field>
    </Modal>
  );
}

export const dataBr = (s) => (s ? fmtDate(s) : '—');
