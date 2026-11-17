// Fotos e documentos: captura/envio, miniatura, visualizador com lupa e tela cheia.
// Usado por todos os sistemas que recebem foto de nota/documento.
import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCw, X, Download, Maximize2, FileText, Search, Camera, Image as ImageIcon } from 'lucide-react';

// ------------------------------------------------------------------ preparo e envio
async function sha256Hex(blob) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

/** Reduz fotos grandes no aparelho (mantém PDF e arquivos pequenos como estão). */
export async function prepararArquivo(file) {
  const hashOriginal = await sha256Hex(file);
  if (file.type === 'application/pdf') return { blob: file, mime: 'application/pdf', hashOriginal };
  if (/^image\/(jpeg|png|webp)$/.test(file.type) && file.size < 1.5 * 1024 * 1024) return { blob: file, mime: file.type, hashOriginal };
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const max = 2200;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
    if (blob) return { blob, mime: 'image/jpeg', hashOriginal };
  } catch { /* formato que o navegador não abre: envia como está */ }
  if (/^image\/(jpeg|png|webp)$/.test(file.type)) return { blob: file, mime: file.type, hashOriginal };
  throw new Error(`${file.name}: formato não suportado. Use foto (JPG/PNG) ou PDF.`);
}

/** Envia o arquivo (já preparado) para a URL da API. Retorna o JSON da resposta. */
export async function uploadArquivo(url, file, params = {}) {
  const { blob, mime, hashOriginal } = await prepararArquivo(file);
  const qs = new URLSearchParams({ nome: file.name || 'foto.jpg', ...params });
  const r = await fetch(`${url}?${qs}`, {
    method: 'POST', credentials: 'same-origin', body: blob,
    headers: { 'Content-Type': mime, ...(hashOriginal ? { 'X-Hash-Original': hashOriginal } : {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Falha ao enviar ${file.name}`);
  return data;
}

/** Botões "Tirar foto" e "Escolher fotos ou PDF". */
export function BotoesFoto({ onFiles, multiple = true, compact, labelGaleria = 'Escolher fotos ou PDF' }) {
  const cam = useRef();
  const gal = useRef();
  const pick = (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) onFiles(fs); };
  return (
    <div className={`foto-botoes ${compact ? 'compact' : ''}`}>
      <button type="button" className="btn btn-primary" onClick={() => cam.current.click()}><Camera size={17} /> Tirar foto</button>
      <button type="button" className="btn btn-outline" onClick={() => gal.current.click()}><ImageIcon size={17} /> {labelGaleria}</button>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={gal} type="file" accept="image/*,application/pdf" multiple={multiple} hidden onChange={pick} />
    </div>
  );
}

// ------------------------------------------------------------------ miniatura
export function Miniatura({ src, pdf, alt, onOpen, size = 90 }) {
  return (
    <button type="button" className="foto-thumb" style={{ width: size, height: size * 1.3 }} onClick={onOpen} title="Ver arquivo">
      {pdf ? <span className="foto-thumb-pdf"><FileText size={28} />PDF</span> : <img src={src} alt={alt} loading="lazy" />}
    </button>
  );
}

// ------------------------------------------------------------------ visualizador com lupa
export function FotoLupa({ src, downloadUrl, pdf, alt, onFull }) {
  const [lens, setLens] = useState(null);
  const ref = useRef();
  if (pdf) {
    return (
      <div className="foto-view">
        <iframe src={src} title={alt} className="foto-pdf" />
        <div className="foto-tools"><span className="muted small">PDF</span><a className="foto-link" href={src} target="_blank" rel="noreferrer"><Maximize2 size={14} /> Abrir</a></div>
        {downloadUrl && <a className="foto-link small" href={downloadUrl}><Download size={13} /> Baixar arquivo</a>}
      </div>
    );
  }
  const move = (e) => {
    const img = ref.current;
    if (!img) return;
    const b = img.getBoundingClientRect();
    const x = e.clientX - b.left; const y = e.clientY - b.top;
    if (x < 0 || y < 0 || x > b.width || y > b.height) return setLens(null);
    setLens({ x, y, w: b.width, h: b.height });
  };
  const Z = 2.6; const L = 180;
  return (
    <div className="foto-view">
      <div className="foto-img" onMouseMove={move} onMouseLeave={() => setLens(null)} onClick={onFull}>
        <img ref={ref} src={src} alt={alt} />
        {lens && (
          <div className="foto-lens" style={{
            left: lens.x - L / 2, top: lens.y - L / 2, width: L, height: L,
            backgroundImage: `url(${src})`, backgroundSize: `${lens.w * Z}px ${lens.h * Z}px`,
            backgroundPosition: `${-(lens.x * Z - L / 2)}px ${-(lens.y * Z - L / 2)}px`,
          }} />
        )}
      </div>
      <div className="foto-tools">
        <span className="muted small"><Search size={13} /> Passe o mouse para a lupa</span>
        <button type="button" className="foto-link" onClick={onFull}><Maximize2 size={14} /> Tela cheia</button>
      </div>
      {downloadUrl && <a className="foto-link small" href={downloadUrl}><Download size={13} /> Baixar foto</a>}
    </div>
  );
}

// ------------------------------------------------------------------ tela cheia (zoom, arrastar, girar)
export function Lightbox({ src, downloadUrl, pdf, titulo, subtitulo, onClose }) {
  const [z, setZ] = useState(1);
  const [rot, setRot] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZ((v) => Math.min(8, v * 1.25));
      if (e.key === '-') setZ((v) => Math.max(0.5, v / 1.25));
      if (e.key.toLowerCase() === 'r') setRot((v) => v + 90);
    };
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="foto-lightbox" onWheel={(e) => setZ((v) => Math.min(8, Math.max(0.5, v * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))}>
      <div className="foto-lb-bar">
        <b>{titulo}</b>{subtitulo && <span className="muted"> · {subtitulo}</span>}
        <span style={{ flex: 1 }} />
        <button onClick={() => setZ((v) => Math.max(0.5, v / 1.25))} title="Diminuir (-)"><ZoomOut size={18} /></button>
        <span className="foto-lb-z">{Math.round(z * 100)}%</span>
        <button onClick={() => setZ((v) => Math.min(8, v * 1.25))} title="Aumentar (+)"><ZoomIn size={18} /></button>
        <button onClick={() => setRot((v) => v + 90)} title="Girar (R)"><RotateCw size={18} /></button>
        <button onClick={() => { setZ(1); setRot(0); setPos({ x: 0, y: 0 }); }} title="Ajustar">1:1</button>
        {downloadUrl && <a href={downloadUrl} title="Baixar"><Download size={18} /></a>}
        <button onClick={onClose} title="Fechar (Esc)"><X size={20} /></button>
      </div>
      <div
        className="foto-lb-stage"
        onMouseDown={(e) => { drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }; }}
        onMouseMove={(e) => drag.current && setPos({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })}
        onMouseUp={() => { drag.current = null; }}
        onMouseLeave={() => { drag.current = null; }}
        onDoubleClick={() => setZ((v) => (v > 1 ? 1 : 2.5))}
      >
        {pdf
          ? <iframe src={src} title={titulo} className="foto-lb-pdf" />
          : <img src={src} alt={titulo} draggable={false} style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${z}) rotate(${rot}deg)` }} />}
      </div>
      <div className="foto-lb-hint">Roda do mouse = zoom · arraste para mover · duplo clique = aproximar · R = girar · Esc = fechar</div>
    </div>
  );
}
