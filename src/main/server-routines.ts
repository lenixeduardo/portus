import { app } from "electron";
import { join } from "node:path";
import { isCentralDatabaseConfigured } from "./db/central-connection";
import { getCentralStationSetting } from "./db/central-station-settings-repo";
import { runBackup } from "./db/backup";
import { runCentralAutoExport } from "./db/central-auto-export";

const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
let backupTimer: ReturnType<typeof setTimeout> | undefined;
let exportTimer: ReturnType<typeof setTimeout> | undefined;
let refreshing: Promise<void> | undefined;
let generation = 0;

async function backup(): Promise<void> {
  const folder = (await getCentralStationSetting("auto_backup_folder")) || join(app.getPath("documents"), "PORTUS", "backups");
  const requested = Number((await getCentralStationSetting("auto_backup_retention")) || 10);
  const retention = Number.isInteger(requested) && requested >= 1 && requested <= 100 ? requested : 10;
  const result = await runBackup(folder, retention);
  if (result.backedUp) console.log(`[auto-backup] backup gerado em "${result.path}" (retenção: ${retention}).`);
  for (const error of result.errors) console.error("[auto-backup]", error);
}

async function exportCompleted(): Promise<void> {
  const folder = (await getCentralStationSetting("auto_export_folder")) || join(app.getPath("documents"), "PORTUS", "exportacoes");
  const result = await runCentralAutoExport(folder);
  if (result.exported) console.log(`[central-export] ${result.exported} lote(s) exportado(s).`);
  for (const error of result.errors) console.error("[central-export]", error);
}

function scheduleBackup(token: number): void {
  const timer = setTimeout(() => {
    void backup().catch(error => console.error("[auto-backup] Falha PostgreSQL:", error)).finally(() => {
      if (token === generation && backupTimer === timer) scheduleBackup(token);
    });
  }, BACKUP_INTERVAL_MS);
  backupTimer = timer;
  timer.unref();
}

function scheduleExport(token: number): void {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  const timer = setTimeout(() => {
    void exportCompleted().catch(error => console.error("[central-export] PostgreSQL indisponível:", error)).finally(() => {
      if (token === generation && exportTimer === timer) scheduleExport(token);
    });
  }, midnight.getTime() - now.getTime());
  exportTimer = timer;
  timer.unref();
}

/** Compartilhado pela inicialização e pelo assistente; repetir não duplica rotinas. */
export function startServerRoutines(): Promise<void> {
  if (refreshing) return refreshing;
  const token = generation;
  refreshing = (async () => {
    if (!isCentralDatabaseConfigured()) { stopServerRoutines(); return; }
    const server = (await getCentralStationSetting("installation_mode")) === "server";
    if (token !== generation) return;
    const backups = server || process.env.PORTUS_SERVER_BACKUP === "1";
    const exports = server || process.env.PORTUS_SERVER_AUTO_EXPORT === "1";
    if (!backups && backupTimer) { clearTimeout(backupTimer); backupTimer = undefined; }
    if (!exports && exportTimer) { clearTimeout(exportTimer); exportTimer = undefined; }
    if (backups && !backupTimer) {
      scheduleBackup(token);
      void backup().catch(error => console.error("[auto-backup] Falha PostgreSQL:", error));
    }
    if (exports && !exportTimer) scheduleExport(token);
  })().finally(() => { refreshing = undefined; });
  return refreshing;
}

export function stopServerRoutines(): void {
  generation++;
  if (backupTimer) clearTimeout(backupTimer);
  if (exportTimer) clearTimeout(exportTimer);
  backupTimer = undefined;
  exportTimer = undefined;
}
