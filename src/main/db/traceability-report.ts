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
  if (code === "PRODUCTION") return "Produção";
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
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const key = normalized.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const known: Record<string, string> = {
    ESPECTROFOTOMETRO: "Espectrofotometro",
    BALANCA: "Balanca",
    VISCOSIMETRO: "Viscosimetro",
    PHMETRO: "pHmetro",
    REFRATOMETRO: "Refratometro",
    RESERVA: "RESERVA"
  };
  return known[key] ?? normalized;
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
  const startedBy = actorFor(history, ["BATCH_OPENED"]);
  const closedBy = actorFor(history, ["BATCH_FINALIZED", "BATCH_CLOSED", "MASTER_BATCH_CLOSED"]);
  const body = rows.map((row) => `
    <tr>
      <td>${esc(row.station)}</td>
      <td class="mono">${esc(row.login)}</td>
      <td>${esc(row.event)}</td>
      <td class="mono">${esc(row.result)}</td>
      <td>${esc(formatDate(row.at))}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>PORTUS · Lote ${esc(batch.code)}</title>
<style>
@page { size: A4 portrait; margin: 14mm 12mm 18mm; }
* { box-sizing:border-box; }
body { background:#fff; color:#111; margin:0; font:10pt Arial,Helvetica,sans-serif; }
header { display:flex; align-items:center; justify-content:space-between; border-bottom:1.5px solid #111; padding-bottom:12px; margin-bottom:15px; min-height:90px; }
h1 { margin:0; padding-right:12mm; font-size:21pt; font-weight:800; text-align:right; }
.identity { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); border:1px solid #bbb; align-items:center; padding:14px; margin-bottom:18px; }
.product { min-width:0; padding-right:14px; font-size:13pt; overflow-wrap:anywhere; }
.label { display:block; font-size:10pt; margin-bottom:10px; }
.barcode { border-left:1px solid #aaa; padding-left:18px; text-align:center; min-width:0; }
.barcode svg { width:100%; height:44px; display:block; }
.code { font-size:12pt; margin-top:8px; overflow-wrap:anywhere; }
table { width:100%; border-collapse:collapse; table-layout:fixed; }
th,td { padding:12px 9px; border:1px solid #bbb; word-break:break-word; text-align:left; }
th { background:#eee; font-size:10.5pt; font-weight:700; }
tbody tr:nth-child(even) { background:#f1f1f1; }
tr { break-inside:avoid; }
.responsibles { border:1px solid #bbb; display:grid; grid-template-columns:1fr 1fr; padding:14px 0; margin-top:23px; }
.responsibles > div { padding:0 16px; min-width:0; overflow-wrap:anywhere; }
.responsibles > div+div { border-left:1px solid #999; }
.responsibles span { display:block; margin-bottom:8px; }
.responsibles strong { font-size:12pt; }
.mono { font-family:Consolas,monospace; }
footer { position:fixed; bottom:-11mm; left:0; right:0; display:flex; justify-content:space-between; font-size:9pt; border-top:1px solid #111; padding-top:8px; }
</style>
</head>
<body>
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
      <th style="width:21%">Computador</th>
      <th style="width:18%">Login</th>
      <th style="width:23%">Equipamento</th>
      <th style="width:17%">Valor</th>
      <th style="width:21%">Data da captura</th>
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
