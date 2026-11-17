// Gera imagens PNG de cupom fiscal FICTÍCIO para testes (sem dependências).
// Os dados do cupom vão embutidos num bloco tEXt "qima-demo" — o conector de IA "demo" lê esse bloco.
import zlib from 'node:zlib';
import { crc32 } from '../../core/server/lib/zip.js';

// Fonte 5x7 (colunas, bit 0 = topo) para ASCII 0x20..0x5A
export const F = {
  ' ': [0, 0, 0, 0, 0], '!': [0, 0, 0x5f, 0, 0], '#': [0x14, 0x7f, 0x14, 0x7f, 0x14], '$': [0x24, 0x2a, 0x7f, 0x2a, 0x12],
  '%': [0x23, 0x13, 0x08, 0x64, 0x62], '(': [0, 0x1c, 0x22, 0x41, 0], ')': [0, 0x41, 0x22, 0x1c, 0], '*': [0x08, 0x2a, 0x1c, 0x2a, 0x08],
  '+': [0x08, 0x08, 0x3e, 0x08, 0x08], ',': [0, 0x50, 0x30, 0, 0], '-': [0x08, 0x08, 0x08, 0x08, 0x08], '.': [0, 0x60, 0x60, 0, 0],
  '/': [0x20, 0x10, 0x08, 0x04, 0x02], ':': [0, 0x36, 0x36, 0, 0], '=': [0x14, 0x14, 0x14, 0x14, 0x14],
  '0': [0x3e, 0x51, 0x49, 0x45, 0x3e], '1': [0, 0x42, 0x7f, 0x40, 0], '2': [0x42, 0x61, 0x51, 0x49, 0x46], '3': [0x21, 0x41, 0x45, 0x4b, 0x31],
  '4': [0x18, 0x14, 0x12, 0x7f, 0x10], '5': [0x27, 0x45, 0x45, 0x45, 0x39], '6': [0x3c, 0x4a, 0x49, 0x49, 0x30], '7': [0x01, 0x71, 0x09, 0x05, 0x03],
  '8': [0x36, 0x49, 0x49, 0x49, 0x36], '9': [0x06, 0x49, 0x49, 0x29, 0x1e],
  A: [0x7e, 0x11, 0x11, 0x11, 0x7e], B: [0x7f, 0x49, 0x49, 0x49, 0x36], C: [0x3e, 0x41, 0x41, 0x41, 0x22], D: [0x7f, 0x41, 0x41, 0x22, 0x1c],
  E: [0x7f, 0x49, 0x49, 0x49, 0x41], F: [0x7f, 0x09, 0x09, 0x01, 0x01], G: [0x3e, 0x41, 0x41, 0x51, 0x32], H: [0x7f, 0x08, 0x08, 0x08, 0x7f],
  I: [0, 0x41, 0x7f, 0x41, 0], J: [0x20, 0x40, 0x41, 0x3f, 0x01], K: [0x7f, 0x08, 0x14, 0x22, 0x41], L: [0x7f, 0x40, 0x40, 0x40, 0x40],
  M: [0x7f, 0x02, 0x04, 0x02, 0x7f], N: [0x7f, 0x04, 0x08, 0x10, 0x7f], O: [0x3e, 0x41, 0x41, 0x41, 0x3e], P: [0x7f, 0x09, 0x09, 0x09, 0x06],
  Q: [0x3e, 0x41, 0x51, 0x21, 0x5e], R: [0x7f, 0x09, 0x19, 0x29, 0x46], S: [0x46, 0x49, 0x49, 0x49, 0x31], T: [0x01, 0x01, 0x7f, 0x01, 0x01],
  U: [0x3f, 0x40, 0x40, 0x40, 0x3f], V: [0x1f, 0x20, 0x40, 0x20, 0x1f], W: [0x7f, 0x20, 0x18, 0x20, 0x7f], X: [0x63, 0x14, 0x08, 0x14, 0x63],
  Y: [0x03, 0x04, 0x78, 0x04, 0x03], Z: [0x61, 0x51, 0x49, 0x45, 0x43],
};
export const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export function png(w, h, gray, texto) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; gray.copy(raw, y * (w + 1) + 1, y * w, y * w + w); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from(`qima-demo\0${texto}`, 'latin1')),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * @param {object} c  { emitente, cnpj, endereco, itens:[{desc, valor}], total, data:'AAAA-MM-DD', hora, nf, chave, pagamento, seed, legivel }
 */
export function cupomPng(c) {
  const S = 2; const CW = 6 * S; const LH = 10 * S; const M = 16;
  const W = 420;
  const cols = Math.floor((W - 2 * M) / CW);
  const linhas = [];
  const centro = (t) => { t = semAcento(t).slice(0, cols); linhas.push(' '.repeat(Math.max(0, Math.floor((cols - t.length) / 2))) + t); };
  const esq = (t) => linhas.push(semAcento(t).slice(0, cols));
  const lr = (a, b) => { a = semAcento(a); b = semAcento(b); linhas.push((a.slice(0, cols - b.length - 1) + ' '.repeat(cols)).slice(0, cols - b.length) + b); };
  const br = (n) => n.toFixed(2).replace('.', ',');
  const fmtCnpj = (d) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;

  centro(c.emitente);
  centro(`CNPJ ${fmtCnpj(c.cnpj)}`);
  centro(c.endereco);
  linhas.push('-'.repeat(cols));
  centro('DOCUMENTO AUXILIAR DA NOTA FISCAL');
  centro('DE CONSUMIDOR ELETRONICA');
  linhas.push('-'.repeat(cols));
  c.itens.forEach((it, i) => lr(`${String(i + 1).padStart(3, '0')} ${it.desc}`, br(it.valor)));
  linhas.push('-'.repeat(cols));
  lr('QTDE TOTAL DE ITENS', String(c.itens.length));
  lr('VALOR TOTAL R$', br(c.total));
  lr('FORMA PAGAMENTO', c.pagamento);
  linhas.push('');
  centro(`NFC-E N ${String(c.nf).padStart(6, '0')} SERIE 1`);
  centro(`${c.data.slice(8, 10)}/${c.data.slice(5, 7)}/${c.data.slice(0, 4)} ${c.hora}`);
  centro('CONSULTE PELA CHAVE DE ACESSO');
  for (let i = 0; i < 44; i += 24) centro(c.chave.slice(i, i + 24).replace(/(\d{4})/g, '$1 ').trim());
  const qrTop = M + linhas.length * LH + 10;
  const QR = 25; const QS = 6;
  const H = qrTop + QR * QS + 60;

  const g = Buffer.alloc(W * H);
  let s = c.seed || 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const base = 244 - Math.round(10 * (y / H)) - (x < 6 || x > W - 7 ? 30 : 0);
    g[y * W + x] = Math.max(0, base - Math.floor(rnd() * 8));
  }
  const tinta = c.legivel === false ? 205 : 40;
  const dot = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = Math.min(g[y * W + x], tinta + Math.floor(rnd() * 25)); };
  linhas.forEach((t, li) => {
    [...t].forEach((ch, ci) => {
      const cols5 = F[ch] || F[' '];
      cols5.forEach((bits, cx) => { for (let cy = 0; cy < 7; cy++) if (bits & (1 << cy)) for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) dot(M + ci * CW + cx * S + a, M + li * LH + cy * S + b); });
    });
  });
  // "QR code" ilustrativo
  const qx = Math.floor((W - QR * QS) / 2);
  for (let i = 0; i < QR; i++) for (let j = 0; j < QR; j++) {
    const finder = (a, b) => a < 7 && b < 7 && (a === 0 || a === 6 || b === 0 || b === 6 || (a > 1 && a < 5 && b > 1 && b < 5));
    const on = finder(i, j) || finder(QR - 1 - i, j) || finder(i, QR - 1 - j) || (!(i < 8 && j < 8) && !(i > QR - 9 && j < 8) && !(i < 8 && j > QR - 9) && rnd() > 0.5);
    if (on) for (let a = 0; a < QS; a++) for (let b = 0; b < QS; b++) dot(qx + i * QS + a, qrTop + j * QS + b);
  }

  const dados = {
    legivel: c.legivel !== false, valor_total: c.total.toFixed(2), data_emissao: c.data, emitente: c.emitente, cnpj: c.cnpj,
    numero_nf: String(c.nf), chave_acesso: c.chave, tipo: c.tipo || '', observacao: c.observacao || '',
  };
  const json = JSON.stringify(dados).replace(/[\u0080-￿]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return png(W, H, g, json);
}
