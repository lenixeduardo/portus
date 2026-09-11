import type { BatchHistory, BatchWithProduct, CaptureSessionRecord, ReadingRecord } from "../../shared/ipc";
import { centralQuery } from "./central-connection";
import { assertCentralReadAccess, toCentralTimestamp } from "./central-batches-repo";

interface HistoryRow {
  session_id: number;
  session_started_at: string | Date;
  session_ended_at: string | Date | null;
  session_timeout_seconds: number;
  session_status: "active" | "completed" | "cancelled";
  reading_id: number | null;
  value_raw: string | null;
  value_parsed: string | null;
  captured_at: string | Date | null;
  equipment_id: number | null;
  equipment_name: string | null;
  operator_name: string | null;
  sector_code: "PRODUCTION" | "LABORATORY" | null;
}

export async function getCentralBatchHistory(
  batchId: number,
  username: string,
  sectorCode: "PRODUCTION" | "LABORATORY"
): Promise<BatchHistory | null> {
  await assertCentralReadAccess(username, sectorCode);
  const batchResult = await centralQuery<BatchWithProduct & { openedAt: string | Date; closedAt?: string | Date | null }>(
    `SELECT b.id, b.product_id AS "productId", p.name AS "productName", b.code, b.status,
            b.opened_at AS "openedAt", b.closed_at AS "closedAt",
            b.closed_by AS "closedBy", b.created_by AS "createdBy",
            b.stage, b.production_closed AS "productionClosed",
            b.laboratory_closed AS "laboratoryClosed",
            u.username AS "operatorName",
            (SELECT COUNT(*) FROM readings r0 WHERE r0.batch_id = b.id) AS "readingsCount"
       FROM batches b
       JOIN products p ON p.id = b.product_id
       JOIN users u ON u.id = b.created_by
      WHERE b.id = $1`,
    [batchId]
  );
  const batchRow = batchResult.rows[0];
  if (!batchRow) return null;
  const batch: BatchWithProduct = {
    ...batchRow,
    openedAt: toCentralTimestamp(batchRow.openedAt),
    closedAt: batchRow.closedAt ? toCentralTimestamp(batchRow.closedAt) : undefined,
    readingsCount: Number(batchRow.readingsCount)
  };

  const rows = await centralQuery<HistoryRow>(
    `SELECT cs.id AS session_id, cs.started_at AS session_started_at,
            cs.ended_at AS session_ended_at, cs.timeout_seconds AS session_timeout_seconds,
            cs.status AS session_status, cu.username AS operator_name,
            s.code AS sector_code, r.id AS reading_id, r.value_raw,
            r.value_parsed, r.captured_at, e.id AS equipment_id, e.name AS equipment_name
       FROM capture_sessions cs
       LEFT JOIN users cu ON cu.id = cs.user_id
       LEFT JOIN sectors s ON s.id = cs.sector_id
       LEFT JOIN readings r ON r.capture_session_id = cs.id
       LEFT JOIN equipments e ON e.id = r.equipment_id
      WHERE cs.batch_id = $1
      ORDER BY cs.started_at ASC, r.captured_at ASC`,
    [batchId]
  );

  const sessions = new Map<number, CaptureSessionRecord>();
  for (const row of rows.rows) {
    if (!sessions.has(row.session_id)) {
      sessions.set(row.session_id, {
        id: row.session_id,
        startedAt: toCentralTimestamp(row.session_started_at),
        endedAt: row.session_ended_at ? toCentralTimestamp(row.session_ended_at) : undefined,
        timeoutSeconds: row.session_timeout_seconds,
        status: row.session_status,
        operatorName: row.operator_name ?? undefined,
        sectorCode: row.sector_code ?? undefined,
        readings: []
      });
    }
    if (row.reading_id !== null) {
      const reading: ReadingRecord = {
        id: row.reading_id,
        equipmentId: row.equipment_id ?? 0,
        equipmentName: row.equipment_name ?? "—",
        // O modelo central não possui slot físico da estação. Não inventamos
        // "slot 1" para todas as leituras; a interface exibe "—" nesse caso.
        slotIndex: -1,
        valueRaw: row.value_raw ?? "",
        valueParsed: row.value_parsed ?? undefined,
        capturedAt: toCentralTimestamp(row.captured_at)
      };
      sessions.get(row.session_id)!.readings.push(reading);
    }
  }
  return { batch, sessions: Array.from(sessions.values()) };
}
