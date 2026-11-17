// Componentes compartilhados das telas do Despesas.
// Visualizador de foto, lupa, tela cheia e envio vêm do núcleo (@hub).
import {
  Badge, BotoesFoto as HubBotoesFoto, FotoLupa as HubFotoLupa, Lightbox as HubLightbox, Miniatura as HubMiniatura, uploadArquivo,
} from '@hub';

export const PEDIDO_STATUS = {
  aguardando: { label: 'Aguardando central', tone: 'warning' },
  aprovado: { label: 'Aprovado', tone: 'success' },
  parcial: { label: 'Aprovado parcial', tone: 'info' },
  reprovado: { label: 'Reprovado', tone: 'brand' },
  cancelado: { label: 'Cancelado', tone: 'muted' },
};
export const NOTA_STATUS = {
  rascunho: { label: 'Rascunho', tone: 'muted' },
  aguardando: { label: 'Aguardando', tone: 'warning' },
  ok: { label: 'OK', tone: 'success' },
  recusada: { label: 'Recusada', tone: 'brand' },
  substituida: { label: 'Substituída', tone: 'muted' },
  cancelada: { label: 'Cancelada', tone: 'muted' },
};
export const PedidoBadge = ({ s }) => <Badge tone={PEDIDO_STATUS[s]?.tone}>{PEDIDO_STATUS[s]?.label || s}</Badge>;
export const NotaBadge = ({ s }) => <Badge tone={NOTA_STATUS[s]?.tone}>{NOTA_STATUS[s]?.label || s}</Badge>;

export const arquivoUrl = (key, nota, download) => `/api/m/${key}/arquivo/${nota.id}?v=${nota.hash?.slice(0, 8) || ''}${download ? '&download=1' : ''}`;
export const isPdf = (n) => n.mime === 'application/pdf';

export function Alertas({ itens, ocultar = [] }) {
  const lista = (itens || []).filter((a) => !ocultar.includes(a.tipo));
  if (!lista.length) return null;
  return (
    <div className="dp-alertas">
      {lista.map((a) => <span key={a.tipo} className={`dp-alerta dp-alerta-${a.tipo === 'duplicada' ? 'red' : 'amber'}`}>{a.texto}</span>)}
    </div>
  );
}

export const enviarArquivo = (key, file, { substitui } = {}) => uploadArquivo(`/api/m/${key}/notas`, file, substitui ? { substitui } : {});
export const BotoesFoto = HubBotoesFoto;
export const Miniatura = ({ module, nota, onOpen, size }) => (
  <HubMiniatura src={arquivoUrl(module.key, nota)} pdf={isPdf(nota)} alt={nota.codigo} onOpen={onOpen} size={size} />
);
export const FotoLupa = ({ module, nota, onFull }) => (
  <HubFotoLupa src={arquivoUrl(module.key, nota)} downloadUrl={arquivoUrl(module.key, nota, true)} pdf={isPdf(nota)} alt={nota.codigo} onFull={onFull} />
);
export const Lightbox = ({ module, nota, onClose }) => (
  <HubLightbox src={arquivoUrl(module.key, nota)} downloadUrl={arquivoUrl(module.key, nota, true)} pdf={isPdf(nota)}
    titulo={nota.codigo} subtitulo={nota.emitente} onClose={onClose} />
);
