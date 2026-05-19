import { get, run } from "./query";
import type { CaptureSession, Reading } from "../../shared/types";

interface SessionRow {
  id: number;
  batch_id: number;
  started_at: string;
  ended_at: string | null;
  timeout_seconds: number;
  status: string;
}

function rowToSession(r: SessionRow): CaptureSession {
  return {
    id: r.id,
    batchId: r.batch_id,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? undefined,
    timeoutSeconds: r.timeout_seconds,
    status: r.status as CaptureSession["status"]
  };
}

export function createCaptureSession(batchId: number, timeoutSeconds: number): CaptureSession {
  const id = run("INSERT INTO capture_sessions (batch_id, timeout_seconds) VALUES (?, ?)", batchId, timeoutSeconds);
  const row = get<SessionRow>("SELECT * FROM capture_sessions WHERE id = ?", id)!;
  return rowToSession(row);
}

export function completeCaptureSession(id: number): void {
  run("UPDATE capture_sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?", id);
}

export function cancelCaptureSession(id: number): void {
  run("UPDATE capture_sessions SET status = 'cancelled', ended_at = datetime('now') WHERE id = ?", id);
}

export interface InsertReadingParams {
  batchId: number;
  equipmentId: number;
  valueRaw: string;
  valueParsed: string | null;
  captureSessionId: number;
  parseFailureReason?: string | null;
  parseRegexUsed?: string | null;
}

export function insertReading(params: InsertReadingParams): Reading {
  const id = run(
    `INSERT INTO readings
       (batch_id, equipment_id, value_raw, value_parsed, capture_session_id,
        parse_failure_reason, parse_regex_used)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params.batchId,
    params.equipmentId,
    params.valueRaw,
    params.valueParsed,
    params.captureSessionId,
    params.parseFailureReason ?? null,
    params.parseRegexUsed ?? null
  );
  const row = get<{
    id: number;
    batch_id: number;
    equipment_id: number;
    value_raw: string;
    value_parsed: string | null;
    captured_at: string;
    capture_session_id: number;
  }>("SELECT * FROM readings WHERE id = ?", id)!;
  return {
    id: row.id,
    batchId: row.batch_id,
    equipmentId: row.equipment_id,
    valueRaw: row.value_raw,
    valueParsed: row.value_parsed ?? undefined,
    capturedAt: row.captured_at,
    captureSessionId: row.capture_session_id
  };
}
