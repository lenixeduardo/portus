import { getDb } from "./connection";

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

export function getCaptureTimeoutSeconds(): number {
  const v = getSetting("capture_timeout_seconds");
  const n = v ? Number(v) : 30;
  return Number.isFinite(n) && n > 0 ? n : 30;
}
