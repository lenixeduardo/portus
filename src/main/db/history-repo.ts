import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { all } from "./query";
import type { BatchHistory, BatchWithProduct, CaptureSessionRecord, ReadingRecord } from "../../shared/ipc";

interface LastReadingRow {
  id: number;
  equipment_id: number;
  equipment_name: string;
  slot_index: number;
  value_raw: string;
  value_parsed: string | null;
  captured_at: string;
}

export function getLastReadingsByBatch(batchId: number): ReadingRecord[] {
  const rows = all<LastReadingRow>(
    `SELECT r.id, r.equipment_id, e.name AS equipment_name, e.slot_index,
            r.value_raw, r.value_parsed, r.captured_at
     FROM readings r
     JOIN equipments e ON e.id = r.equipment_id
     WHERE r.batch_id = ?
       AND r.id IN (
         SELECT MAX(r2.id) FROM readings r2
         WHERE r2.batch_id = ? AND r2.value_raw != ''
         GROUP BY r2.equipment_id
       )
     ORDER BY e.slot_index ASC`,
    batchId,
    batchId
  );

  return rows.map((row) => ({
    id: row.id,
    equipmentId: row.equipment_id,
    equipmentName: row.equipment_name,
    slotIndex: row.slot_index,
    valueRaw: row.value_raw,
    valueParsed: row.value_parsed ?? undefined,
    capturedAt: row.captured_at
  }));
}
import { getBatchWithProduct, listClosedUnexportedBatches, markBatchAutoExported } from "./batches-repo";

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

export function getBatchHistory(batchId: number, preloaded?: BatchWithProduct): BatchHistory | null {
  const batch = preloaded ?? getBatchWithProduct(batchId);
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

export function writeCsvFile(filePath: string, csv: string): void {
  writeFileSync(filePath, "﻿" + csv, "utf-8");
}

export function runAutoExport(exportFolder: string): { exported: number; errors: string[] } {
  const batches = listClosedUnexportedBatches();
  let exported = 0;
  const errors: string[] = [];

  try {
    mkdirSync(exportFolder, { recursive: true });
  } catch (err) {
    return { exported: 0, errors: [`Não foi possível criar a pasta de exportação: ${String(err)}`] };
  }

  for (const batch of batches) {
    const history = getBatchHistory(batch.id, batch);
    if (!history) continue;
    try {
      const csv = buildCsvContent(history);
      writeCsvFile(join(exportFolder, `lote-${batch.code}.csv`), csv);
      markBatchAutoExported(batch.id);
      exported++;
    } catch (err) {
      errors.push(`Lote ${batch.code}: ${String(err)}`);
    }
  }

  return { exported, errors };
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
