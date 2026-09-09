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

async function resolveContext(username: string, sectorCode = process.env.PORTUS_SECTOR_CODE ?? "PRODUCTION"): Promise<ContextRow> {
  const result = await centralQuery<ContextRow>(
    `SELECT u.id AS user_id, a.id AS application_id, s.id AS sector_id
       FROM users u
       CROSS JOIN applications a
       CROSS JOIN sectors s
      WHERE u.username = $1 AND a.code = 'PORTUS' AND s.code = $2
        AND u.active AND a.active AND s.active`,
    [username, sectorCode]
  );
  if (!result.rows[0]) throw new Error("Usuário, aplicação ou setor não encontrado na base central.");
  return result.rows[0];
}

export async function getCentralBatchById(batchId: number): Promise<{ id: number; status: "open" | "closed" } | null> {
  const result = await centralQuery<{ id: number; status: "open" | "closed" }>(
    "SELECT id, status FROM batches WHERE id = $1",
    [batchId]
  );
  return result.rows[0] ?? null;
}

export async function createCentralCaptureSession(
  batchId: number,
  timeoutSeconds: number,
  username: string
): Promise<CaptureSession> {
  const context = await resolveContext(username);
  const result = await centralQuery<SessionRow>(
    `INSERT INTO capture_sessions (
       batch_id, sector_id, source_application_id, timeout_seconds
     )
     VALUES ($1, $2, $3, $4)
     RETURNING id, batch_id, started_at, ended_at, timeout_seconds, status`,
    [batchId, context.sector_id, context.application_id, timeoutSeconds]
  );
  const row = result.rows[0];
  if (!row) throw new Error("A base central não retornou a sessão de captura.");
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
  status: "completed" | "cancelled"
): Promise<void> {
  await resolveContext(username);
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
}): Promise<Reading | null> {
  const context = await resolveContext(input.username);
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
