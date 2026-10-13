import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { execFile, type ExecFileException } from "node:child_process";
import { findPostgresBin } from "../setup/initial-setup-service";
import { getCentralDatabaseUrl } from "./central-connection";
import { join } from "node:path";

const BACKUP_PREFIX = "portus-postgres-backup-";
const BACKUP_SUFFIX = ".dump";
// serial-reader-backup-YYYYMMDD-HHMMSS.sqlite
const BACKUP_PATTERN = /^portus-postgres-backup-\d{8}-\d{6}(?:-\d{3})?\.dump$/;
let backupQueue: Promise<unknown> = Promise.resolve();
let lastBackupTimestamp = 0;

function localTimestamp(date = new Date()): string {
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  const ymd = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
  const hms = `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `${ymd}-${hms}-${p(date.getMilliseconds(), 3)}`;
}

export function runBackup(
  backupFolder: string,
  retention: number
): Promise<{ backedUp: boolean; path?: string; errors: string[] }> {
  // Backup manual e automático compartilham a fila; pg_dump e retenção não se sobrepõem.
  const result = backupQueue.then(() => performBackup(backupFolder, retention));
  backupQueue = result.catch(() => {});
  return result;
}

async function performBackup(
  backupFolder: string,
  retention: number
): Promise<{ backedUp: boolean; path?: string; errors: string[] }> {
  const errors: string[] = [];

  try {
    mkdirSync(backupFolder, { recursive: true });
  } catch (err) {
    return { backedUp: false, errors: [`Não foi possível criar a pasta de backup: ${String(err)}`] };
  }

  let backupPath: string | undefined;
  try {
    const connection = getCentralDatabaseUrl();
    if (!connection) throw new Error("PostgreSQL central não configurado.");
    const database = new URL(connection);
    const bin = findPostgresBin();
    const executable = bin ? join(bin, process.platform === "win32" ? "pg_dump.exe" : "pg_dump") : "pg_dump";
    if (bin && !existsSync(executable)) throw new Error("pg_dump não encontrado no servidor.");
    // Mesmo duas operações terminadas no mesmo milissegundo têm destinos distintos.
    lastBackupTimestamp = Math.max(Date.now(), lastBackupTimestamp + 1);
    backupPath = join(backupFolder, `${BACKUP_PREFIX}${localTimestamp(new Date(lastBackupTimestamp))}${BACKUP_SUFFIX}`);
    const dumpPath: string = backupPath;
    await new Promise<void>((resolve, reject) => execFile(executable, ["--format=custom", "--no-owner", "--no-acl", "--file", dumpPath], {
      env: {
        ...process.env,
        PGHOST: database.hostname,
        PGPORT: database.port || "5432",
        PGUSER: decodeURIComponent(database.username),
        PGPASSWORD: decodeURIComponent(database.password),
        PGDATABASE: decodeURIComponent(database.pathname.slice(1))
      },
      timeout: 120000,
      windowsHide: true
    }, (error: ExecFileException | null) => error ? reject(error) : resolve()));
  } catch (err) {
    // Um dump interrompido nunca participa da retenção nem parece um backup válido.
    if (backupPath && existsSync(backupPath)) {
      try { unlinkSync(backupPath); } catch { /* Mantém o erro original. */ }
    }
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
