// API pública do núcleo para os módulos (import { ... } from '@hub').
// Mantenha compatível: mudanças aqui afetam todos os sistemas.
export { api, moduleApi, ApiError } from './api.js';
export { PageHeader, Button, Card, Field, Alert, Badge, Empty, formatDate, ModuleNav } from './ui.jsx';
export { ModuleIcon, ICONS } from './icons.jsx';
export {
  ToastProvider, useToast, useAction, Modal, FiltroSelect, exportCsv, baixarBlob,
  fmtDate, fmtShort, fmtDateTime, money, num, norm, todayISO, addDays, uniq, parseMoney, maskCpf, fmtCpf, cpfValido,
} from './kit.jsx';
export { prepararArquivo, uploadArquivo, BotoesFoto, Miniatura, FotoLupa, Lightbox } from './foto.jsx';
export { CidadeInput, cidadeValida, cidadeOficial, UFS } from './cidade.jsx';
export { useConfirm, usePrompt } from './dialogo.jsx';
export { useAuth } from '../auth.jsx';
