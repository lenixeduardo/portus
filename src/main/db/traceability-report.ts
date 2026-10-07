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

export function buildBatchPrintHtml(history: BatchHistory): string {
  const rows = buildTraceabilityRows(history);
  const batch = history.batch;
  const status = batch.status === "closed" ? "FINALIZADO" : batch.completed ? "CONCLUÍDO" : "ABERTO";
  const body = rows.map((row) => `
    <tr>
      <td>${esc(formatDate(row.at))}</td>
      <td>${esc(row.sector)}</td>
      <td>${esc(row.event)}</td>
      <td class="mono">${esc(row.result)}</td>
      <td>${esc(row.responsible)}</td>
      <td class="mono">${esc(row.login)}</td>
      <td class="mono">${esc(row.station)}</td>
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
  header { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
  h1 { font-size: 16pt; margin: 0 0 8px; }
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
  <h1>PORTUS · Folha de rastreabilidade do lote</h1>
  <div class="meta">
    <div><span>Lote</span><strong>${esc(batch.code)}</strong></div>
    <div><span>Produto</span><strong>${esc(batch.productName)}</strong></div>
    <div><span>Status</span><strong>${status}</strong></div>
    <div><span>Aberto em</span><strong>${esc(formatDate(batch.openedAt))}</strong></div>
    <div><span>Aberto por</span><strong>${esc(batch.operatorName)}</strong></div>
    <div><span>Total de leituras</span><strong>${batch.readingsCount}</strong></div>
  </div>
</header>
<table>
  <thead>
    <tr>
      <th style="width:15%">Data / hora</th>
      <th style="width:10%">Setor</th>
      <th style="width:18%">Análise / evento</th>
      <th style="width:12%">Resultado</th>
      <th style="width:16%">Responsável</th>
      <th style="width:14%">Login</th>
      <th style="width:15%">Computador</th>
    </tr>
  </thead>
  <tbody>${body || '<tr><td colspan="7">Nenhum registro.</td></tr>'}</tbody>
</table>
<footer>Documento gerado pelo PORTUS. Ordem cronológica preservada para arquivamento junto ao produto.</footer>
</body>
</html>`;
}
