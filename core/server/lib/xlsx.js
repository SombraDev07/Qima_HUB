// Gerador de planilha Excel (.xlsx) mínimo, sem dependências.
// buildXlsx([{ name: 'Notas', columns: [{label, width?, type?: 'money'|'date'|'datetime'|'texto'}], rows: [[...], ...] }])
// Nomes de aba repetidos ganham " (2)", " (3)"… automaticamente.
import { createZip } from './zip.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const sheetName = (n) => String(n).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Planilha';

// estilos: 0 normal · 1 cabeçalho · 2 moeda · 3 data · 4 número · 5 data e hora · 6 texto longo (quebra linha)
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy hh:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0C303E"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="7"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/><xf numFmtId="4" applyNumberFormat="1"/><xf numFmtId="166" applyNumberFormat="1"/><xf applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>
</styleSheet>`;

// datas e horas do banco estão em UTC; no Excel saem no fuso local (padrão Brasília, -3)
const FUSO_H = Number(process.env.QIMA_FUSO_HORAS ?? -3);

function excelDate(iso) {
  const t = Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(t) ? null : t / 86400000 + 25569;
}
function excelDateTime(s) {
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return excelDate(s);
  const t = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4] || '00'}Z`) + FUSO_H * 3600000;
  return Number.isNaN(t) ? null : t / 86400000 + 25569;
}

function sheetXml({ columns, rows }) {
  const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || Math.max(10, c.label.length + 2)}" customWidth="1"/>`).join('');
  const cell = (ref, v, col) => {
    if (v === null || v === undefined || v === '') return '';
    if (col?.type === 'date' || col?.type === 'datetime') {
      const d = col.type === 'date' ? excelDate(v) : excelDateTime(v);
      return d === null ? `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>` : `<c r="${ref}" s="${col.type === 'date' ? 3 : 5}"><v>${d}</v></c>`;
    }
    if (col?.type === 'texto') return `<c r="${ref}" t="inlineStr" s="6"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${col?.type === 'money' ? 2 : 0}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  };
  const head = `<row r="1">${columns.map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="1"><is><t>${esc(c.label)}</t></is></c>`).join('')}</row>`;
  const body = rows.map((r, ri) => `<row r="${ri + 2}">${r.map((v, ci) => cell(`${colName(ci)}${ri + 2}`, v, columns[ci])).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols><sheetData>${head}${body}</sheetData>
${rows.length ? `<autoFilter ref="A1:${colName(columns.length - 1)}${rows.length + 1}"/>` : ''}
</worksheet>`;
}

export function buildXlsx(entrada) {
  const usados = new Set();
  const sheets = entrada.map((s) => {
    let n = sheetName(s.name); let i = 2;
    while (usados.has(n.toLowerCase())) n = `${sheetName(s.name).slice(0, 26)} (${i++})`;
    usados.add(n.toLowerCase());
    return { ...s, name: n };
  });
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
${sheets.map((s, i) => `<sheet name="${esc(sheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}
</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
    { name: 'xl/styles.xml', data: STYLES },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  return createZip(files);
}
