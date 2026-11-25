// Confere o CONTEÚDO REAL de um arquivo enviado, sem confiar no tipo que o navegador declarou nem na extensão.
//   conferirArquivo(buffer, mimeDeclarado) → null (aceito) ou o texto do erro para mostrar à pessoa.
// Regras:
//   - a assinatura dos primeiros bytes tem que bater com o tipo declarado (HTML/EXE/ZIP disfarçados de foto são recusados);
//   - fotos: no máximo 50 megapixels e 12.000 px de lado (uma "bomba de pixels" de 400 KB viraria GBs de memória ao abrir);
//   - PDF: sem JavaScript, ação de abrir programa, arquivo embutido ou formulário dinâmico;
//   - Excel .xlsx: ZIP de planilha de verdade e SEM macro; .xls (formato antigo): sem macro.
// O servidor nunca descompacta nem decodifica o arquivo por inteiro aqui: só lê cabeçalhos.

export const MAX_MEGAPIXELS = 50;
export const MAX_LADO = 12000;

const MIME_IGUAL = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'image/x-png': 'image/png', 'application/x-pdf': 'application/pdf' };
export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const XLS = 'application/vnd.ms-excel';

const comeca = (b, bytes, em = 0) => bytes.every((x, i) => b[em + i] === x);

/** Tipo de verdade pelos primeiros bytes (ou null se não for nenhum dos aceitos). */
export function tipoReal(b) {
  if (!b || b.length < 8) return null;
  if (comeca(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (comeca(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (/^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) return 'image/gif';
  if (b[0] === 0x42 && b[1] === 0x4d && b.length > 26) return 'image/bmp';
  if (b.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  if (comeca(b, [0x50, 0x4b, 0x03, 0x04])) return 'application/zip';
  if (comeca(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'application/x-ole';
  return null;
}

/** Largura e altura lidas do cabeçalho da imagem (sem decodificar). null se não der para ler. */
export function dimensoes(b, mime) {
  try {
    if (mime === 'image/png') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (mime === 'image/gif') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
    if (mime === 'image/bmp') return { w: Math.abs(b.readInt32LE(18)), h: Math.abs(b.readInt32LE(22)) };
    if (mime === 'image/webp') {
      const tipo = b.toString('latin1', 12, 16);
      if (tipo === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (tipo === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
      if (tipo === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      return null;
    }
    if (mime === 'image/jpeg') {
      // percorre os marcadores até o SOF (início do quadro), que tem altura e largura
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
        const tam = b.readUInt16BE(i + 2);
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        if (m === 0xda) return null;
        i += 2 + tam;
      }
    }
  } catch { /* cabeçalho truncado */ }
  return null;
}

/** Nomes dos arquivos dentro de um ZIP, lidos do diretório central (sem descompactar nada). */
export function nomesNoZip(b) {
  let fim = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (b.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) return null;
  const total = b.readUInt16LE(fim + 10);
  let p = b.readUInt32LE(fim + 16);
  const nomes = [];
  for (let k = 0; k < total; k++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) return null;
    const n = b.readUInt16LE(p + 28); const extra = b.readUInt16LE(p + 30); const coment = b.readUInt16LE(p + 32);
    nomes.push(b.toString('utf8', p + 46, p + 46 + n));
    p += 46 + n + extra + coment;
  }
  return nomes;
}

// Recursos de PDF que executam algo ao abrir (no Acrobat ou no navegador). Planilha de nota/passagem não precisa de nada disso.
const PDF_PERIGOSO = /\/(JavaScript|JS|Launch|EmbeddedFile|EmbeddedFiles|RichMedia|XFA|SubmitForm|ImportData)\b/;
// macro do Excel antigo (.xls): o fluxo "_VBA_PROJECT" aparece em UTF-16
const MACRO_XLS = Buffer.from('_VBA_PROJECT', 'utf16le');

/**
 * Confere o arquivo. Devolve null se estiver tudo certo, ou a mensagem de erro.
 * @param {Buffer} b conteúdo
 * @param {string} declarado tipo declarado (Content-Type) ou o tipo da extensão (planilhas)
 */
export function conferirArquivo(b, declarado) {
  if (!b?.length) return 'Arquivo vazio.';
  const mime = MIME_IGUAL[declarado] || declarado;
  const real = tipoReal(b);

  if (mime === XLSX) {
    if (real !== 'application/zip') return 'Este arquivo não é uma planilha Excel (.xlsx) de verdade.';
    const nomes = nomesNoZip(b);
    if (!nomes || !nomes.includes('[Content_Types].xml') || !nomes.some((n) => n.startsWith('xl/'))) return 'Este arquivo não é uma planilha Excel (.xlsx) de verdade.';
    if (nomes.some((n) => /vbaProject\.bin$|\.(bin|exe|dll|js|vbs|bat|cmd|ps1|scr)$/i.test(n) && !/^xl\/printerSettings\//i.test(n))) {
      return 'Planilha com macro ou programa embutido não é aceita. Salve como .xlsx comum (sem macro) e envie de novo.';
    }
    return null;
  }
  if (mime === XLS) {
    if (real !== 'application/x-ole') return 'Este arquivo não é uma planilha Excel (.xls) de verdade.';
    if (b.includes(MACRO_XLS)) return 'Planilha com macro não é aceita. Salve como .xlsx comum (sem macro) e envie de novo.';
    return null;
  }

  if (real !== mime) {
    return mime.startsWith('image/') ? 'O arquivo não é uma imagem válida (o conteúdo não confere com o tipo).' : 'O arquivo não é um PDF válido (o conteúdo não confere com o tipo).';
  }
  if (mime.startsWith('image/')) {
    const d = dimensoes(b, mime);
    if (!d || !d.w || !d.h) return 'Não foi possível ler esta imagem. Tire a foto de novo ou envie outro arquivo.';
    if (d.w > MAX_LADO || d.h > MAX_LADO || d.w * d.h > MAX_MEGAPIXELS * 1e6) {
      return `Imagem grande demais (${d.w} x ${d.h} pixels). O máximo é ${MAX_MEGAPIXELS} megapixels; reduza a foto e envie de novo.`;
    }
    return null;
  }
  if (mime === 'application/pdf') {
    if (PDF_PERIGOSO.test(b.toString('latin1'))) return 'Este PDF tem conteúdo ativo (script, programa ou arquivo embutido) e não é aceito. Gere o PDF de novo (ex.: "Imprimir como PDF").';
    return null;
  }
  return 'Tipo de arquivo não aceito.';
}
