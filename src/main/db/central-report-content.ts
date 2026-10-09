import type { BatchHistory, CaptureSessionRecord } from "../../shared/ipc";

const reportDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "medium"
});

export function buildCsvContent(history: BatchHistory): string {
  const lines: string[] = [];
  const header = [
    "Lote", "Produto", "Operador", "Abertura do Lote",
    "Sessão", "Início Sessão", "Fim Sessão",
    "Status Sessão", "Setor", "Responsável", "Login", "Computador", "Equipamento", "Slot", "Valor Bruto", "Valor Numérico", "Capturado em"
  ];
  lines.push(header.join(";"));

  const { batch, sessions } = history;
  let sessionNum = 0;

  for (const session of sessions) {
    sessionNum++;
    if (session.readings.length === 0) {
      lines.push(
        [batch.code, batch.productName, batch.operatorName, formatExcelDate(batch.openedAt),
          sessionNum, formatExcelDate(session.startedAt), formatExcelDate(session.endedAt), session.status,
          sectorLabel(session.sectorCode), session.operatorName ?? "", session.operatorLogin ?? "", session.stationCode ?? "", "", "", "", "", ""]
          .map(csvCell).join(";")
      );
      continue;
    }
    for (const r of session.readings) {
      lines.push(
        [batch.code, batch.productName, batch.operatorName, formatExcelDate(batch.openedAt),
          sessionNum, formatExcelDate(session.startedAt), formatExcelDate(session.endedAt), session.status,
          sectorLabel(session.sectorCode), session.operatorName ?? "", session.operatorLogin ?? "", session.stationCode ?? "", r.equipmentName,
          r.slotIndex >= 0 ? r.slotIndex + 1 : "", r.valueRaw, formatExcelDecimal(r.valueParsed), formatExcelDate(r.capturedAt)]
          .map(csvCell).join(";")
      );
    }
  }

  return lines.join("\r\n");
}

function sectorLabel(sector?: CaptureSessionRecord["sectorCode"]): string {
  return sector === "LABORATORY" ? "Laboratório" : sector === "PRODUCTION" ? "Produção" : "";
}

function formatExcelDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return reportDateFormatter.format(date);
}

function formatExcelDecimal(value?: string): string {
  return value && /^[-+]?\d+(?:\.\d+)?$/.test(value) ? value.replace(".", ",") : value ?? "";
}


function csvCell(v: unknown): string {
  const s = String(v ?? "");
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
