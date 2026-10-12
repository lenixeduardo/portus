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
        event: reading.equipmentName,
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

export function buildBatchPrintHtml(history: BatchHistory): string {
  const rows = buildTraceabilityRows(history).filter(row => row.result !== "");
  const batch = history.batch;
  const status = batch.status === "closed" ? "FINALIZADO" : batch.completed ? "CONCLUÍDO" : "ABERTO";
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
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #111; margin: 0; font-size: 10.5pt; }
  header { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; display:flex; align-items:center; justify-content:space-between; }
  h1 { font-size: 15pt; margin: 0; text-align:right; }
  .brand { font-size:25pt; font-weight:900; letter-spacing:-1.2px; }
  .brand small { display:block; font-size:6pt; letter-spacing:1px; font-weight:normal; }
  .identity { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin:15px 0; }
  .product { flex:1; min-width:0; overflow-wrap:anywhere; }
  .barcode { width:190px; text-align:center; flex-shrink:0; }
  .barcode svg { width:100%; height:38px; display:block; }
  .code { overflow-wrap:anywhere; padding-top:5px; font-weight:bold; }
  .label { color:#555; font-size:8pt; text-transform:uppercase; display:block; margin-bottom:5px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 12px; }
  .meta div { border: 1px solid #bbb; padding: 6px; min-height: 38px; }
  .meta span { display: block; font-size: 8pt; color: #555; margin-bottom: 2px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #aaa; padding: 5px 6px; vertical-align: top; word-wrap: break-word; }
  th { background: #eee; text-align: left; font-size: 8.5pt; }
  tr { break-inside: avoid; }
  .mono { font-family: Consolas, monospace; }
  footer { margin-top: 10px; font-size: 8pt; color: #555; }
</style>
</head>
<body>
<header>
  <div class="brand">PORTUS<small>CONTROLE INDUSTRIAL</small></div>
  <h1>RELATÓRIO DE LOTE</h1>
</header>
<section class="identity">
  <div class="product"><span class="label">Produto</span><strong>${esc(batch.productName)}</strong></div>
  <div class="barcode">${code39Svg(batch.code)}<div class="code">${esc(batch.code)}</div></div>
</section>
<div class="meta">
  <div><span>Situação</span><strong>${status}</strong></div>
  <div><span>Abertura</span><strong>${esc(formatDate(batch.openedAt))}</strong></div>
  <div><span>Capturas</span><strong>${rows.length}</strong></div>
</div>
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
<footer>Documento gerado pelo PORTUS. Capturas em ordem cronológica.</footer>
</body>
</html>`;
}
