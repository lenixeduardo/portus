import { run } from "./query";

export interface CaptureErrorLogInput {
  batchId?: number | null;
  captureSessionId?: number | null;
  equipmentId?: number | null;
  slotIndex?: number | null;
  severity?: "warn" | "error";
  code: string;
  message: string;
  rawValue?: string | null;
  context?: Record<string, unknown>;
}

export function insertCaptureErrorLog(input: CaptureErrorLogInput): void {
  run(
    `INSERT INTO capture_error_logs
       (batch_id, capture_session_id, equipment_id, slot_index, severity, code, message, raw_value, context_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.batchId ?? null,
    input.captureSessionId ?? null,
    input.equipmentId ?? null,
    input.slotIndex ?? null,
    input.severity ?? "error",
    input.code,
    input.message,
    input.rawValue ?? null,
    input.context ? JSON.stringify(input.context) : null
  );
}
