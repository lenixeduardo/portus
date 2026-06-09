import { get, run } from "./query";

export function getSetting(key: string): string | null {
  return get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value
  );
}

export function getCaptureTimeoutSeconds(): number {
  const v = getSetting("capture_timeout_seconds");
  const n = v ? Number(v) : 30;
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export function getAutoExportFolder(defaultFolder: string): string {
  return getSetting("auto_export_folder") ?? defaultFolder;
}

export function getAutoBackupFolder(defaultFolder: string): string {
  const v = getSetting("auto_backup_folder");
  return v && v.trim() ? v : defaultFolder;
}

export function getAutoBackupRetention(defaultRetention: number): number {
  const v = getSetting("auto_backup_retention");
  const n = v ? Number(v) : defaultRetention;
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : defaultRetention;
}
