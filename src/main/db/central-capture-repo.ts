import { centralQuery } from "./central-connection";
import type { CaptureSession, Reading } from "../../shared/types";

interface ContextRow {
  user_id: number;
  application_id: number;
  sector_id: number;
}

interface SessionRow {
  id: number;
  batch_id: number;
  started_at: string;
  ended_at: string | null;
  timeout_seconds: number;
  status: "active" | "completed" | "cancelled";
}

async function resolveContext(username: string, sectorCode = "PRODUCTION"): Promise<ContextRow> {
  const applicationCode = sectorCode === "LABORATORY" ? "PORTUS_LABORATORY" : "PORTUS";
  const result = await centralQuery<ContextRow>(
    `SELECT u.id AS user_id, a.id AS application_id, s.id AS sector_id
       FROM users u
       CROSS JOIN applications a
       CROSS JOIN sectors s
      WHERE u.username = $1 AND a.code = $2 AND s.code = $3
        AND u.active AND a.active AND s.active`,
    [username, applicationCode, sectorCode]
  );
  if (!result.rows[0]) throw new Error("Usuário, aplicação ou setor não encontrado na base central.");
  return result.rows[0];
}

export interface CentralCaptureBatchState {
  id: number;
  status: "open" | "closed";
  productionClosed: boolean;
  laboratoryClosed: boolean;
}

export function isSectorCaptureClosed(
  batch: CentralCaptureBatchState,
  sectorCode: "PRODUCTION" | "LABORATORY"
): boolean {
  return sectorCode === "LABORATORY" ? batch.laboratoryClosed : batch.productionClosed;
}

export async function getCentralBatchById(batchId: number): Promise<CentralCaptureBatchState | null> {
  const result = await centralQuery<{
    id: number;
    status: "open" | "closed";
    production_closed: boolean;
    laboratory_closed: boolean;
  }>(
    "SELECT id, status, production_closed, laboratory_closed FROM batches WHERE id = $1",
    [batchId]
  );
  const row = result.rows[0];
  return row ? {
    id: row.id,
    status: row.status,
    productionClosed: row.production_closed,
    laboratoryClosed: row.laboratory_closed
  } : null;
}

export async function createCentralCaptureSession(
  batchId: number,
  timeoutSeconds: number,
  username: string,
  sectorCode: "PRODUCTION" | "LABORATORY"
): Promise<CaptureSession> {
  const context = await resolveContext(username, sectorCode);
  await centralQuery(
    "SELECT portus_assert_permission($1, $2, $3, 'capture')",
    [context.user_id, context.application_id, context.sector_id]
  );
  const result = await centralQuery<SessionRow>(
    `INSERT INTO capture_sessions (
       batch_id, sector_id, source_application_id, user_id, timeout_seconds
     )
     SELECT b.id, $2, $3, $4, $5
       FROM batches b
       JOIN sectors s ON s.id = $2
      WHERE b.id = $1
        AND b.status = 'open'
        AND CASE
          WHEN s.code = 'LABORATORY' THEN NOT b.laboratory_closed
          ELSE NOT b.production_closed
        END
     RETURNING id, batch_id, started_at, ended_at, timeout_seconds, status`,
    [batchId, context.sector_id, context.application_id, context.user_id, timeoutSeconds]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Este setor já foi confirmado e não aceita novas leituras neste lote.");
  return {
    id: row.id,
    batchId: row.batch_id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    timeoutSeconds: row.timeout_seconds,
    status: row.status
  };
}

export async function finishCentralCaptureSession(
  sessionId: number,
  username: string,
  sectorCode: "PRODUCTION" | "LABORATORY",
  status: "completed" | "cancelled"
): Promise<void> {
  const context = await resolveContext(username, sectorCode);
  await centralQuery(
    "SELECT portus_assert_permission($1, $2, $3, 'capture')",
    [context.user_id, context.application_id, context.sector_id]
  );
  await centralQuery(
    `UPDATE capture_sessions
        SET status = $1, ended_at = now()
      WHERE id = $2 AND status = 'active'`,
    [status, sessionId]
  );
}

export async function insertCentralReading(input: {
  batchId: number;
  equipmentName: string;
  valueRaw: string;
  valueParsed: string | null;
  captureSessionId: number;
  parseFailureReason?: string | null;
  parseRegexUsed?: string | null;
  username: string;
  sectorCode: "PRODUCTION" | "LABORATORY";
}): Promise<Reading | null> {
  const context = await resolveContext(input.username, input.sectorCode);
  const equipment = await centralQuery<{ id: number }>(
    "SELECT id FROM equipments WHERE name = $1 OR code = $1 ORDER BY id LIMIT 1",
    [input.equipmentName]
  );
  if (!equipment.rows[0]) {
    throw new Error(`Equipamento "${input.equipmentName}" não encontrado na base central.`);
  }
  const result = await centralQuery<{ id: number; batch_id: number; equipment_id: number; value_raw: string; value_parsed: string | null; captured_at: string; capture_session_id: number }>(
    `SELECT id, batch_id, equipment_id, value_raw, value_parsed, captured_at, capture_session_id
       FROM register_reading($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.batchId,
      equipment.rows[0].id,
      input.captureSessionId,
      input.valueRaw,
      input.valueParsed,
      input.parseFailureReason ?? null,
      input.parseRegexUsed ?? null,
      context.user_id,
      context.application_id,
      context.sector_id
    ]
  );
  const row = result.rows[0];
  return row ? {
    id: row.id,
    batchId: row.batch_id,
    equipmentId: row.equipment_id,
    valueRaw: row.value_raw,
    valueParsed: row.value_parsed ?? undefined,
    capturedAt: row.captured_at,
    captureSessionId: row.capture_session_id
  } : null;
}

export async function validateCentralEquipmentMapping(equipmentNames: string[]): Promise<string[]> {
  if (equipmentNames.length === 0) return [];
  const result = await centralQuery<{ name: string; code: string | null }>(
    `SELECT name, code FROM equipments WHERE name = ANY($1::text[]) OR code = ANY($1::text[])`,
    [equipmentNames]
  );
  const mapped = new Set(result.rows.flatMap((row) => [row.name, row.code].filter(Boolean) as string[]));
  return equipmentNames.filter((name) => !mapped.has(name));
}
