import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { backupDbTo } from "./connection";

const BACKUP_PREFIX = "serial-reader-backup-";
const BACKUP_SUFFIX = ".sqlite";
// serial-reader-backup-YYYYMMDD-HHMMSS.sqlite
const BACKUP_PATTERN = /^serial-reader-backup-\d{8}-\d{6}\.sqlite$/;

function localTimestamp(date = new Date()): string {
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  const ymd = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
  const hms = `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `${ymd}-${hms}`;
}

export function runBackup(
  backupFolder: string,
  retention: number
): { backedUp: boolean; path?: string; errors: string[] } {
  const errors: string[] = [];

  try {
    mkdirSync(backupFolder, { recursive: true });
  } catch (err) {
    return { backedUp: false, errors: [`Não foi possível criar a pasta de backup: ${String(err)}`] };
  }

  let backupPath: string;
  try {
    backupPath = join(backupFolder, `${BACKUP_PREFIX}${localTimestamp()}${BACKUP_SUFFIX}`);
    backupDbTo(backupPath);
  } catch (err) {
    return { backedUp: false, errors: [`Falha ao gerar backup do banco: ${String(err)}`] };
  }

  try {
    applyRetention(backupFolder, retention);
  } catch (err) {
    errors.push(`Falha ao aplicar retenção de backups: ${String(err)}`);
  }

  return { backedUp: true, path: backupPath, errors };
}

function applyRetention(backupFolder: string, retention: number): void {
  if (!Number.isInteger(retention) || retention < 1) return;

  const files = readdirSync(backupFolder)
    .filter((name) => BACKUP_PATTERN.test(name))
    .map((name) => {
      const full = join(backupFolder, name);
      return { name, full, mtime: statSync(full).mtimeMs };
    })
    // Mais recente primeiro: nome contém timestamp ordenável; mtime como desempate.
    .sort((a, b) => (b.name === a.name ? b.mtime - a.mtime : a.name < b.name ? 1 : -1));

  for (const file of files.slice(retention)) {
    unlinkSync(file.full);
  }
}
