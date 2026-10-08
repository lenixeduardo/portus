import { centralQuery } from "./central-connection";

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

export async function insertCaptureErrorLog(input: CaptureErrorLogInput): Promise<void> {
  await centralQuery(
    "INSERT INTO capture_error_logs " +
    "(batch_id,capture_session_id,equipment_id,slot_index,severity,code,message,raw_value,context_json) " +
    "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
    [
      input.batchId ?? null, input.captureSessionId ?? null,
      input.equipmentId ?? null, input.slotIndex ?? null,
      input.severity ?? "error", input.code, input.message,
      input.rawValue ?? null, JSON.stringify(input.context ?? {})
    ]
  );
}
