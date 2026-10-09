import { writeFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";

// XLSX (OOXML) criado inteiramente em Node.js: não depende de Excel nem PowerShell.
const HEADERS = ["Lote", "Produto", "Operador", "Abertura do Lote", "Sessão", "Início Sessão", "Fim Sessão", "Status Sessão", "Setor", "Responsável", "Login", "Computador", "Equipamento", "Slot", "Valor Bruto", "Valor Numérico", "Capturado em"];
const WIDTHS = [16, 18, 14, 20, 10, 18, 18, 18, 14, 16, 14, 16, 16, 12, 16, 16, 22];

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const input = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++; }
      else if (field === "") quoted = !quoted;
      else field += c;
    } else if (c === ";" && !quoted) {
      row.push(field); field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (row.length || field) { row.push(field); rows.push(row); }
  return rows;
}

function xml(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function column(index: number): string {
  let value = index + 1, result = "";
  while (value > 0) {
    value--;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function sheetXml(csvContent: string): string {
  const rows = parseCsv(csvContent);
  // Preserve os mesmos 17 campos/ordem do relatório histórico; linhas vazias são válidas.
  const body = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: HEADERS.length }, (_, colIndex) => {
      const value = row[colIndex] ?? "";
      // Evitar interpretação de conteúdo proveniente do instrumento como fórmula.
      return '<c r="' + column(colIndex) + (rowIndex + 1) + '" t="inlineStr" s="' +
        (rowIndex === 0 ? "1" : "0") + '"><is><t xml:space="preserve">' +
        xml(value) + '</t></is></c>';
    }).join("");
    return '<row r="' + (rowIndex + 1) + '"' + (rowIndex === 0 ? ' ht="22" customHeight="1"' : "") + '>' + cells + '</row>';
  }).join("");
  const last = Math.max(1, rows.length);
  const cols = WIDTHS.map((width, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + width + '" customWidth="1"/>').join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<dimension ref="A1:Q' + last + '"/>' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/><cols>' + cols + '</cols><sheetData>' + body + '</sheetData>' +
    '<autoFilter ref="A1:Q' + last + '"/></worksheet>';
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: Array<[string, string]>): Buffer {
  const entries: Buffer[] = [], directory: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const filename = Buffer.from(name, "utf8"), raw = Buffer.from(data, "utf8");
    const packed = deflateRawSync(raw), checksum = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14); local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(filename.length, 26);
    entries.push(local, filename, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16); central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, filename);
    offset += local.length + filename.length + packed.length;
  }
  const centralSize = directory.reduce((n, part) => n + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...entries, ...directory, end]);
}

export function writeFormattedXlsx(filePath: string, csvContent: string): void {
  const types = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const workbook = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Relatório" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const workbookRels = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const styles = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF111215"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
    '</styleSheet>';
  writeFileSync(filePath, zip([
    ["[Content_Types].xml", types], ["_rels/.rels", rels],
    ["xl/workbook.xml", workbook], ["xl/_rels/workbook.xml.rels", workbookRels],
    ["xl/styles.xml", styles], ["xl/worksheets/sheet1.xml", sheetXml(csvContent)]
  ]));
}
