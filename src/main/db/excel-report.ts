import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BatchHistory } from "../../shared/ipc";
import { reportEquipmentName } from "./traceability-report";
import { deflateRawSync, deflateSync } from "node:zlib";

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

function zip(files: Array<[string, string | Buffer]>): Buffer {
  const entries: Buffer[] = [], directory: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const filename = Buffer.from(name, "utf8"), raw = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
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


/**
 * Exporta lotes usando exclusivamente as oito colunas do template aprovado.
 * Unidade, status da leitura e observacao permanecem vazios enquanto o banco
 * nao fornecer estes dados — nenhuma avaliacao e inventada.
 */
const EPA_COLUMNS = ["Computador", "Login", "Equipamento", "Valor", "Unidade", "Status", "Data da captura", "Observação"];
const EPA_WIDTHS = [21, 17, 20, 15, 16, 17, 22, 28];
const OOXML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function excelDate(value?: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).format(parsed).replace(",", "");
}

function excelActor(history: BatchHistory, actions: string[]): string {
  const event = [...(history.auditEvents ?? [])].reverse().find(item => actions.includes(item.action));
  return event?.actorName || event?.actorLogin || "";
}

export function excelReportRows(history: BatchHistory): string[][] {
  return history.sessions.flatMap(session =>
    session.readings.map(reading => ({ session, reading }))
  ).sort((a, b) => a.reading.capturedAt.localeCompare(b.reading.capturedAt) || a.reading.id - b.reading.id)
  .map(({ session, reading }) => [
    session.stationCode || session.stationName || "",
    session.operatorLogin || "",
    reportEquipmentName(reading.equipmentName),
    reading.valueRaw || reading.valueParsed || "",
    "", // Unidade: sem dado de origem
    "", // Status de leitura: sem regra de validacao confiavel
    excelDate(reading.capturedAt),
    "" // Observacao: sem dado de origem
  ]);
}

function epaCell(address: string, value: string | undefined, style: number): string {
  return value === undefined || value === ""
    ? '<c r="' + address + '" s="' + style + '"/>'
    : '<c r="' + address + '" t="inlineStr" s="' + style + '"><is><t xml:space="preserve">' + xml(value) + '</t></is></c>';
}
function epaRow(number: number, values: string[], styles: number[], height = 24): string {
  const cells = values.map((value, index) =>
    epaCell(column(index) + number, value, styles[index] ?? 0)
  ).join("");
  return '<row r="' + number + '" ht="' + height + '" customHeight="1">' + cells + '</row>';
}
function epaSheet(history: BatchHistory): string {
  const data = excelReportRows(history);
  const footer = Math.max(27, data.length + 15);
  const openedBy = excelActor(history, ["BATCH_OPENED"]) || history.batch.operatorName || "";
  const closed = history.batch.status === "closed";
  const closedBy = closed
    ? excelActor(history, ["BATCH_FINALIZED", "BATCH_CLOSED", "MASTER_BATCH_CLOSED"])
    : "";
  const rows: string[] = [
    epaRow(2, ["", "", "RELATÓRIO DO LOTE"], [0,0,1], 39),
    epaRow(4, ["", "", "RASTREABILIDADE DE LEITURAS E EQUIPAMENTOS"], [0,0,2], 25),
    epaRow(7, ["LOTE","PRODUTO","","STATUS","DATA DE ABERTURA","","RESPONSÁVEL","CÓDIGO DE BARRAS"], Array(8).fill(3),25),
    epaRow(8, [
      history.batch.code, history.batch.productName, "",
      closed ? "Finalizado" : "Em andamento",
      excelDate(history.batch.openedAt), "", openedBy, history.batch.code
    ], [4,4,4,5,4,4,4,4], 39),
    epaRow(12, EPA_COLUMNS, Array(8).fill(6), 31)
  ];
  for (let i=0;i<Math.max(12,data.length);i++) {
    rows.push(epaRow(i+13, data[i] ?? Array(8).fill(""), Array(8).fill(i%2 ? 8 : 7)));
  }
  rows.push(epaRow(footer, [
    "LOTE ABERTO POR", "", "DATA/HORA DA ABERTURA", "",
    "LOTE FECHADO POR", "", "DATA/HORA DO FECHAMENTO", ""
  ], Array(8).fill(3)));
  rows.push(epaRow(footer+1, [
    openedBy, "", excelDate(history.batch.openedAt), "",
    closedBy, "", closed ? excelDate(history.batch.closedAt) : "", ""
  ], Array(8).fill(4), 32));
  const merges = [
    "C2:H3","C4:H4","B7:C7","B8:C8","E7:F7","E8:F8"
  ];
  for (const pair of ["A:B","C:D","E:F","G:H"]) {
    const [start, end] = pair.split(":");
    merges.push(start+footer+":"+end+footer);
    merges.push(start+(footer+1)+":"+end+(footer+1));
  }
  const cols = EPA_WIDTHS.map((width, index) =>
    '<col min="'+(index+1)+'" max="'+(index+1)+'" width="'+width+'" customWidth="1"/>'
  ).join("");
  return XML_DECL + '<worksheet xmlns="'+OOXML_NS+'" xmlns:r="'+OFFICE_REL+'">'
    + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
    + '<dimension ref="A1:H'+(footer+1)+'"/>'
    + '<sheetViews><sheetView showGridLines="0" workbookViewId="0">'
    + '<pane ySplit="12" topLeftCell="A13" activePane="bottomLeft" state="frozen"/>'
    + '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>'+cols+'</cols>'
    + '<sheetData>'+rows.join("")+'</sheetData>'
    + '<mergeCells count="'+merges.length+'">'+merges.map(m=>'<mergeCell ref="'+m+'"/>').join("")+'</mergeCells>'
    + '<printOptions horizontalCentered="1"/><pageMargins left="0.2" right="0.2" top="0.3" bottom="0.3" header="0.1" footer="0.1"/>'
    + '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="1"/>'
    + '<drawing r:id="rId1"/></worksheet>';
}
function epaStyles(): string {
  const font = (name: string,size:number,color:string,bold=false)=>
    '<font>'+(bold?'<b/>':'')+'<sz val="'+size+'"/><color rgb="FF'+color+'"/><name val="'+name+'"/></font>';
  const fonts = [
    font("Inter",11,"182637"),font("Sora",27,"121C29",true),
    font("Inter",11,"5F7EA8",true),font("Inter",10,"5F7EA8",true),
    font("Inter",12,"182637",true),font("Inter",12,"087653",true),
    font("Inter",11,"FFFFFF",true),font("Inter",11,"182637"),font("Inter",11,"182637")
  ];
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF086A59"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF6FAFA"/></patternFill></fill>'
  ];
  const borders = [
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left style="thin"><color rgb="FFD9E5E5"/></left><right style="thin"><color rgb="FFD9E5E5"/></right><top style="thin"><color rgb="FFD9E5E5"/></top><bottom style="thin"><color rgb="FFD9E5E5"/></bottom><diagonal/></border>'
  ];
  const fmt=(fi:number,fl:number,bo:number,h="center")=>
    '<xf numFmtId="0" fontId="'+fi+'" fillId="'+fl+'" borderId="'+bo+'" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="'+h+'" vertical="center" wrapText="1"/></xf>';
  const xfs=[fmt(0,0,0),fmt(1,0,0,"left"),fmt(2,0,0,"left"),fmt(3,0,1),fmt(4,0,1),fmt(5,0,1),fmt(6,2,1),fmt(7,0,1),fmt(8,3,1)];
  return XML_DECL+'<styleSheet xmlns="'+OOXML_NS+'"><fonts count="'+fonts.length+'">'+fonts.join("")+'</fonts>'
    +'<fills count="'+fills.length+'">'+fills.join("")+'</fills>'
    +'<borders count="'+borders.length+'">'+borders.join("")+'</borders>'
    +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    +'<cellXfs count="'+xfs.length+'">'+xfs.join("")+'</cellXfs></styleSheet>';
}

const CODE39:Record<string,string> = {
  "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw",
  "5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnn","8":"wnnwnnwnn","9":"nnwwnnwnn",
  "A":"wnnnnwnnw","B":"nnwnnwnnw","C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn",
  "F":"nnwnwwnnn","G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn",
  "K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww","O":"wnnnwnnwn",
  "P":"nnwnwnnwn","Q":"nnnnnnwww","R":"wnnnnnwwn","S":"nnwnnnwwn","T":"nnnnwnwwn",
  "U":"wwnnnnnnw","V":"nwwnnnnnw","W":"wwwnnnnnn","X":"nwnnwnnnw","Y":"wwnnwnnnn",
  "Z":"nwwnwnnnn","-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn",
  "$":"nwnwnwnnn","/":"nwnwnnnwn","+":"nwnnnwnwn","%":"nnnwnwnwn","*":"nwnnwnwnn"
};
function pngChunk(type:string,data:Buffer):Buffer {
  const tag=Buffer.from(type,"ascii"),size=Buffer.alloc(4),hash=Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  hash.writeUInt32BE(crc32(Buffer.concat([tag,data])));
  return Buffer.concat([size,tag,data,hash]);
}
function epaBarcode(code:string):Buffer|null {
  const value=code.toUpperCase();
  if(!value || value.length>40 || !/^[0-9A-Z. $/+%-]+$/.test(value))return null;
  const bars:number[]=[];
  for(const char of "*"+value+"*"){
    for(let i=0;i<9;i++)bars.push(CODE39[char][i]==="w"?3:1);
    bars.push(1);
  }
  const width=bars.reduce((a,b)=>a+b,24),height=54,raw=Buffer.alloc(height*(width+1),255);
  let x=12;
  for(let u=0;u<bars.length;u++){
    if(u%10!==9 && u%2===0)for(let y=0;y<height;y++)
      raw.fill(0,y*(width+1)+1+x,y*(width+1)+1+x+bars[u]);
    x+=bars[u];
  }
  for(let y=0;y<height;y++)raw[y*(width+1)]=0;
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),pngChunk("IHDR",ihdr),
    pngChunk("IDAT",deflateSync(raw)),pngChunk("IEND",Buffer.alloc(0))
  ]);
}
function picture(id:number,rel:string,c:number,r:number,w:number,h:number):string{
  return '<xdr:oneCellAnchor><xdr:from><xdr:col>'+c+'</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>'+r+'</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>'
  +'<xdr:ext cx="'+w*9525+'" cy="'+h*9525+'"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="'+id+'" name="Imagem '+id+'"/><xdr:cNvPicPr/></xdr:nvPicPr>'
  +'<xdr:blipFill><a:blip r:embed="'+rel+'"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
  +'<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>';
}
export function writeBatchReportXlsx(filePath:string,history:BatchHistory):void {
  const paths=[
    join((process as typeof process & {resourcesPath?:string}).resourcesPath||"","branding","epa-logo-color.png"),
    join(process.cwd(),"assets","branding","epa-logo-color.png")
  ];
  let logo:Buffer|undefined;
  for(const p of paths){try{logo=readFileSync(p);break;}catch{/*next*/}}
  if(!logo)throw new Error("Logotipo colorido da EPA nao encontrado no PORTUS.");
  const barcode=epaBarcode(history.batch.code);
  const files:Array<[string,string|Buffer]>=[
    ["[Content_Types].xml",XML_DECL+'<Types xmlns="'+PKG_REL.replace("/relationships","/content-types")+'"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>'],
    ["_rels/.rels",XML_DECL+'<Relationships xmlns="'+PKG_REL+'"><Relationship Id="rId1" Type="'+OFFICE_REL+'/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ["xl/workbook.xml",XML_DECL+'<workbook xmlns="'+OOXML_NS+'" xmlns:r="'+OFFICE_REL+'"><sheets><sheet name="Resumo do Lote" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ["xl/_rels/workbook.xml.rels",XML_DECL+'<Relationships xmlns="'+PKG_REL+'"><Relationship Id="rId1" Type="'+OFFICE_REL+'/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="'+OFFICE_REL+'/styles" Target="styles.xml"/></Relationships>'],
    ["xl/worksheets/sheet1.xml",epaSheet(history)],
    ["xl/worksheets/_rels/sheet1.xml.rels",XML_DECL+'<Relationships xmlns="'+PKG_REL+'"><Relationship Id="rId1" Type="'+OFFICE_REL+'/drawing" Target="../drawings/drawing1.xml"/></Relationships>'],
    ["xl/styles.xml",epaStyles()],
    ["xl/drawings/drawing1.xml",XML_DECL+'<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="'+OFFICE_REL+'">'+picture(1,"rId1",0,0,225,130)+(barcode?picture(2,"rId2",7,7,175,35):"")+'</xdr:wsDr>'],
    ["xl/drawings/_rels/drawing1.xml.rels",XML_DECL+'<Relationships xmlns="'+PKG_REL+'"><Relationship Id="rId1" Type="'+OFFICE_REL+'/image" Target="../media/epa-logo.png"/>'+(barcode?'<Relationship Id="rId2" Type="'+OFFICE_REL+'/image" Target="../media/code39.png"/>':"")+'</Relationships>'],
    ["xl/media/epa-logo.png",logo]
  ];
  if(barcode)files.push(["xl/media/code39.png",barcode]);
  writeFileSync(filePath,zip(files));
}
