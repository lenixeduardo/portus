import { all } from "./query";
import type { BatchHistory, CaptureSessionRecord, ReadingRecord } from "../../shared/ipc";
import { getBatchWithProduct } from "./batches-repo";

interface SessionReadingRow {
  session_id: number;
  session_started_at: string;
  session_ended_at: string | null;
  session_timeout_seconds: number;
  session_status: string;
  reading_id: number | null;
  value_raw: string | null;
  value_parsed: string | null;
  captured_at: string | null;
  equipment_id: number | null;
  equipment_name: string | null;
  slot_index: number | null;
}

export function getBatchHistory(batchId: number): BatchHistory | null {
  const batch = getBatchWithProduct(batchId);
  if (!batch) return null;

  const rows = all<SessionReadingRow>(
    `SELECT
       cs.id              AS session_id,
       cs.started_at      AS session_started_at,
       cs.ended_at        AS session_ended_at,
       cs.timeout_seconds AS session_timeout_seconds,
       cs.status          AS session_status,
       r.id               AS reading_id,
       r.value_raw,
       r.value_parsed,
       r.captured_at,
       e.id               AS equipment_id,
       e.name             AS equipment_name,
       e.slot_index
     FROM capture_sessions cs
     LEFT JOIN readings r ON r.capture_session_id = cs.id
     LEFT JOIN equipments e ON e.id = r.equipment_id
     WHERE cs.batch_id = ?
     ORDER BY cs.started_at ASC, r.captured_at ASC`,
    batchId
  );

  const sessionsMap = new Map<number, CaptureSessionRecord>();

  for (const row of rows) {
    if (!sessionsMap.has(row.session_id)) {
      sessionsMap.set(row.session_id, {
        id: row.session_id,
        startedAt: row.session_started_at,
        endedAt: row.session_ended_at ?? undefined,
        timeoutSeconds: row.session_timeout_seconds,
        status: row.session_status as CaptureSessionRecord["status"],
        readings: []
      });
    }

    if (row.reading_id !== null) {
      const reading: ReadingRecord = {
        id: row.reading_id,
        equipmentId: row.equipment_id!,
        equipmentName: row.equipment_name ?? "—",
        slotIndex: row.slot_index ?? 0,
        valueRaw: row.value_raw!,
        valueParsed: row.value_parsed ?? undefined,
        capturedAt: row.captured_at!
      };
      sessionsMap.get(row.session_id)!.readings.push(reading);
    }
  }

  return { batch, sessions: Array.from(sessionsMap.values()) };
}

export function buildCsvContent(history: BatchHistory): string {
  const lines: string[] = [];
  const header = [
    "Lote", "Produto", "Sessão", "Início Sessão", "Fim Sessão",
    "Status Sessão", "Equipamento", "Slot", "Valor Bruto", "Valor Parseado", "Capturado em"
  ];
  lines.push(header.join(";"));

  const { batch, sessions } = history;
  let sessionNum = 0;

  for (const session of sessions) {
    sessionNum++;
    if (session.readings.length === 0) {
      lines.push(
        [batch.code, batch.productName, sessionNum, session.startedAt,
          session.endedAt ?? "", session.status, "", "", "", "", ""]
          .map(csvCell).join(";")
      );
      continue;
    }
    for (const r of session.readings) {
      lines.push(
        [batch.code, batch.productName, sessionNum, session.startedAt,
          session.endedAt ?? "", session.status, r.equipmentName, r.slotIndex + 1,
          r.valueRaw, r.valueParsed ?? "", r.capturedAt]
          .map(csvCell).join(";")
      );
    }
  }

  return lines.join("\r\n");
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
