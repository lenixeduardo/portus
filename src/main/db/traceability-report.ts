import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BatchAuditEvent, BatchHistory, CaptureSessionRecord } from "../../shared/ipc";

interface TraceRow {
  at: string;
  sector: string;
  event: string;
  result: string;
  responsible: string;
  login: string;
  station: string;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium"
  }).format(date);
}

function sectorLabel(code?: CaptureSessionRecord["sectorCode"]): string {
  if (code === "LABORATORY") return "Laboratório";
  if (code === "PRODUCTION") return "Caramelo";
  return "—";
}

function auditLabel(event: BatchAuditEvent): string | null {
  switch (event.action) {
    case "BATCH_OPENED": return "Lote aberto";
    case "BATCH_COMPLETED": return "Lote concluído";
    case "BATCH_COMPLETION_REVOKED": return "Conclusão removida";
    case "BATCH_FINALIZED":
    case "BATCH_CLOSED":
    case "MASTER_BATCH_CLOSED": return "Lote finalizado";
    case "BATCH_REOPENED": return "Lote reaberto";
    default: return null;
  }
}

/** Padroniza nomes de equipamentos no relatório, ignorando acentos e grafias de pH. */
export function reportEquipmentName(name: string): string {
  // Preserva o nome atual cadastrado, inclusive nomes personalizados.
  return name.trim();
}

export function buildTraceabilityRows(history: BatchHistory): TraceRow[] {
  const rows: TraceRow[] = [];

  for (const event of history.auditEvents ?? []) {
    const label = auditLabel(event);
    if (!label) continue;
    rows.push({
      at: event.timestamp,
      sector: sectorLabel(event.sectorCode),
      event: label,
      result: "",
      responsible: event.actorName ?? event.actorLogin ?? "—",
      login: event.actorLogin ?? "—",
      station: "—"
    });
  }

  for (const session of history.sessions) {
    for (const reading of session.readings) {
      rows.push({
        at: reading.capturedAt,
        sector: sectorLabel(session.sectorCode),
        event: reportEquipmentName(reading.equipmentName),
        result: reading.valueParsed ?? reading.valueRaw,
        responsible: session.operatorName ?? session.operatorLogin ?? "—",
        login: session.operatorLogin ?? session.operatorName ?? "—",
        station: session.stationCode ?? session.stationName ?? "—"
      });
    }
  }

  return rows.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}


/** Desenha Code 39 real e autocontido para impressão e PDF sem rede. */
function code39Svg(value: string): string {
  const patterns: Record<string, string> = {
    "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn",
    "4":"nnnwwnnnw","5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw",
    "8":"wnnwnnwnn","9":"nnwwnnwnn","A":"wnnnnwnnw","B":"nnwnnwnnw",
    "C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn","F":"nnwnwwnnn",
    "G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn",
    "K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww",
    "O":"wnnnwnnwn","P":"nnwnwnnwn","Q":"nnnnnnwww","R":"wnnnnnwwn",
    "S":"nnwnnnwwn","T":"nnnnwnwwn","U":"wwnnnnnnw","V":"nwwnnnnnw",
    "W":"wwwnnnnnn","X":"nwnnwnnnw","Y":"wwnnwnnnn","Z":"nwwnwnnnn",
    "-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn","$":"nwnwnwnnn",
    "/":"nwnwnnnwn","+":"nwnnnwnwn","%":"nnnwnwnwn","*":"nwnnwnwnn"
  };
  const clean = value.toUpperCase();
  if (!/^[0-9A-Z. $/+%-]+$/.test(clean) || clean.length > 60) {
    return '<div class="code">Código sem simbologia Code 39 compatível</div>';
  }
  let x = 10;
  let bars = "";
  for (const char of "*" + clean + "*") {
    const pattern = patterns[char];
    for (let i = 0; i < 9; i++) {
      const width = pattern[i] === "w" ? 3 : 1;
      if (i % 2 === 0) bars += '<rect x="' + x + '" y="0" width="' + width + '" height="38"/>';
      x += width;
    }
    x += 1;
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (x + 10) + ' 38" preserveAspectRatio="none" role="img" aria-label="Código de barras do lote"><g fill="#111">' + bars + '</g></svg>';
}


function actorFor(history: BatchHistory, actions: string[]): string {
  const event = [...(history.auditEvents ?? [])].reverse().find(item => actions.includes(item.action));
  if (!event) return "Não registrado";
  const name = event.actorName ?? event.actorLogin ?? "Não registrado";
  return event.actorLogin && event.actorLogin !== name ? name + " (" + event.actorLogin + ")" : name;
}

/** Usa o asset oficial EPA Química no PDF e na pré-visualização.
 *  A imagem é embutida como data URI para funcionar em data: URLs offline,
 *  inclusive no aplicativo Electron empacotado.
 */
function epaLogoSvg(): string {
  const paths = [
    join(process.resourcesPath ?? "", "branding", "epa-logo.png"),
    join(process.cwd(), "assets", "branding", "epa-logo.png")
  ];

  for (const file of paths) {
    try {
      const bytes = readFileSync(file);
      const src = `data:image/png;base64,${bytes.toString("base64")}`;
      return `<img src="${src}" alt="EPA Química — Química a serviço da vida, desde 1961" width="172" height="129" style="display:block;width:172px;height:auto;max-height:90px;object-fit:contain;object-position:left center" />`;
    } catch {
      // Relatórios existentes continuam imprimíveis sem o novo asset.
    }
  }
  return fallbackEpaLogoSvg();
}

/** Compatibilidade com instalações antigas que ainda não possuem o PNG. */
function fallbackEpaLogoSvg(): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="172" height="84" viewBox="0 0 210 105">'
    + '<text x="104" y="13" font-size="10" font-family="Arial" text-anchor="middle" font-weight="bold">QUÍMICA A SERVIÇO DA VIDA</text>'
    + '<ellipse cx="103" cy="56" rx="100" ry="31" fill="none" stroke="#666" stroke-width="2" transform="rotate(-12 103 56)"/>'
    + '<ellipse cx="103" cy="56" rx="78" ry="33" fill="#444" stroke="#333"/>'
    + '<text x="103" y="66" font-family="Arial" font-size="49" font-weight="300" fill="white" text-anchor="middle">epa</text>'
    + '<text x="103" y="80" font-family="Arial" font-size="11" font-weight="bold" fill="white" text-anchor="middle">QUÍMICA</text>'
    + '<text x="103" y="102" font-family="Arial" font-size="10" text-anchor="middle" font-weight="bold">DESDE 1961</text></svg>';
}
export function buildBatchPrintHtml(history: BatchHistory): string {
  const rows = buildTraceabilityRows(history).filter(row => row.result !== "");
  const batch = history.batch;
  // Escalas progressivas para otimizar o número de registros legíveis por A4.
  // Lotes muito extensos continuam paginados; nenhuma leitura pode ser omitida.
  const density = rows.length >= 43 ? "report--dense"
    : rows.length >= 22 ? "report--compact" : "report--regular";
  const startedBy = actorFor(history, ["BATCH_OPENED"]);
  const closedBy = actorFor(history, ["BATCH_FINALIZED", "BATCH_CLOSED", "MASTER_BATCH_CLOSED"]);
  const body = rows.map((row) => `
    <tr>
      <td>${esc(row.sector)}</td>
      <td class="mono">${esc(row.login)}</td>
      <td class="equipment-name"><span>${esc(row.event)}</span></td>
      <td class="mono">${esc(row.result)}</td>
      <td>${esc(formatDate(row.at))}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>PORTUS · Lote ${esc(batch.code)}</title>
<style>
@page { size: A4 portrait; margin: 9mm 9mm 11mm; }
* { box-sizing: border-box; }
html { background: #fff; }
body {
  background: #fff; color: #111; margin: 0; width: 100%; max-width: 100%;
  font: 8.5pt/1.22 Arial, Helvetica, sans-serif;
}
@media screen {
  html { background: #e9ecef; }
  body {
    width: min(210mm, 100%); min-height: 297mm; margin: 14px auto;
    padding: 9mm; box-shadow: 0 3px 22px rgba(0,0,0,.15);
  }
}
header {
  display: grid; grid-template-columns: 132px minmax(0,1fr);
  align-items: center; gap: 12px; min-height: 62px;
  border-bottom: 1px solid #111; padding: 0 0 7px; margin-bottom: 9px;
  max-width: 100%; break-inside: avoid;
}
header img, header svg {
  display: block; width: 132px !important; max-width: 132px !important;
  height: auto !important; max-height: 60px !important; object-fit: contain;
  object-position: left center;
}
h1 {
  margin: 0; min-width: 0; font-size: 16pt; line-height: 1.12;
  font-weight: 800; text-align: right; white-space: nowrap;
}
.identity {
  display: grid; grid-template-columns: minmax(0,1.15fr) minmax(0,1fr);
  border: 1px solid #bbb; align-items: center;
  padding: 8px 10px; margin-bottom: 10px; min-height: 58px;
  break-inside: avoid;
}
.product { min-width: 0; padding-right: 10px; font-size: 10pt; overflow-wrap: anywhere; }
.label { display: block; font-size: 7.5pt; margin-bottom: 3px; color: #444; }
.barcode { border-left: 1px solid #aaa; padding: 0 4px 0 12px; text-align: center; min-width: 0; width: 100%; }
.barcode svg { display: block; width: 100%; height: 34px; }
.code { font-size: 9pt; line-height: 1; margin-top: 4px; overflow-wrap: anywhere; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-variant-numeric: tabular-nums; }
thead { display: table-header-group; }
th, td {
  padding: 5px 4px; border: 1px solid #bbb; text-align: left;
  vertical-align: middle; overflow-wrap: anywhere; line-height: 1.16;
}
th { background: #eee; font-size: 8pt; font-weight: 700; }
td { font-size: 8pt; }
.equipment-name { white-space: nowrap; overflow: hidden; }
.equipment-name span { display: inline-block; white-space: nowrap; transform-origin: left center; }
tbody tr:nth-child(even) { background: #f4f4f4; }
tr { break-inside: avoid; page-break-inside: avoid; }
.report--compact th, .report--compact td { font-size: 7.35pt; padding: 3px 3px; line-height: 1.12; }
.report--dense th, .report--dense td { font-size: 6.7pt; padding: 2.5px 3px; line-height: 1.08; }
.responsibles {
  border: 1px solid #bbb; display: grid; grid-template-columns: 1fr 1fr;
  padding: 8px 0; margin-top: 12px; break-inside: avoid;
}
.responsibles > div { padding: 0 11px; min-width: 0; overflow-wrap: anywhere; }
.responsibles > div + div { border-left: 1px solid #999; }
.responsibles span { display: block; margin-bottom: 4px; font-size: 7.5pt; }
.responsibles strong { font-size: 9pt; line-height: 1.2; }
.mono { font-family: Consolas, 'Liberation Mono', monospace; }
footer {
  /* O rodapé fixo com bottom negativo criava uma segunda página em branco. */
  position: static; margin-top: 10px;
  display: flex; justify-content: space-between;
  font-size: 7pt; border-top: 1px solid #111; padding-top: 4px;
  break-inside: avoid;
}
@media screen and (max-width: 730px) {
  body { margin: 0 auto; padding: 7mm 5mm; }
  header { gap: 7px; grid-template-columns: 105px minmax(0,1fr); }
  header img, header svg { width: 105px !important; max-width: 105px !important; }
  h1 { font-size: 13pt; }
  th, td { padding: 3px; font-size: 7pt; }
}
@media print {
  html, body { background: #fff; margin: 0; padding: 0; width: 100%; min-height: auto; box-shadow: none; }
  header, .identity, .responsibles { break-inside: avoid; }
  table { break-before: avoid; }
  th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
<script>
function fitEquipmentNames() {
  document.querySelectorAll(".equipment-name").forEach(function(cell) {
    var span = cell.querySelector("span");
    if (!span) return;
    span.style.fontSize = "";
    span.style.transform = "";
    var available = cell.clientWidth - parseFloat(getComputedStyle(cell).paddingLeft) - parseFloat(getComputedStyle(cell).paddingRight);
    var width = span.getBoundingClientRect().width;
    if (width > available && available > 0) {
      var size = parseFloat(getComputedStyle(span).fontSize);
      span.style.fontSize = Math.max(7, size * available / width * 0.98) + "px";
      width = span.getBoundingClientRect().width;
      // Se o nome continuar maior que a coluna no piso de legibilidade,
      // comprimir somente na horizontal; nunca cortar nem quebrar o nome.
      if (width > available) {
        span.style.transform = "scaleX(" + Math.min(1, available / width * 0.98) + ")";
      }
    }
  });
}
window.addEventListener("load", fitEquipmentNames);
window.addEventListener("beforeprint", fitEquipmentNames);
window.addEventListener("resize", fitEquipmentNames);
</script>
</head>
<body class="${density}">
<header>
  <div>${epaLogoSvg()}</div>
  <h1>RELATÓRIO DO LOTE</h1>
</header>
<section class="identity">
  <div class="product"><span class="label">Produto</span><strong>${esc(batch.productName)}</strong></div>
  <div class="barcode">${code39Svg(batch.code)}<div class="code">${esc(batch.code)}</div></div>
</section>
<table>
  <thead>
    <tr>
      <th style="width:16%">Setor</th>
      <th style="width:13%">Login</th>
      <th style="width:39%">Equipamento</th>
      <th style="width:12%">Valor</th>
      <th style="width:20%">Data da captura</th>
    </tr>
  </thead>
  <tbody>${body || '<tr><td colspan="5">Nenhum registro.</td></tr>'}</tbody>
</table>
<section class="responsibles">
  <div><span>Lote iniciado por:</span><strong>${esc(startedBy === "Não registrado" ? batch.operatorName : startedBy)}</strong></div>
  <div><span>Lote finalizado por:</span><strong>${esc(batch.status === "closed" ? closedBy : "Ainda não finalizado")}</strong></div>
</section>
<footer><span>EPA • Relatório do lote</span><span>Relatório de rastreabilidade</span></footer>
</body>
</html>`;
}
