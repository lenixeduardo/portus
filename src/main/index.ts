import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { closeDb, openDb, persistDb } from "./db/connection";
import { runMigrations } from "./db/migrate";
import { seedInitialData } from "./db/seed";
import { registerAuthHandlers } from "./ipc/auth-handlers";
import { registerBatchesHandlers } from "./ipc/batches-handlers";
import { registerCaptureHandlers } from "./ipc/capture-handlers";
import { registerEquipmentsHandlers } from "./ipc/equipments-handlers";
import { registerProductsHandlers } from "./ipc/products-handlers";
import { registerHistoryHandlers } from "./ipc/history-handlers";
import { registerSettingsHandlers } from "./ipc/settings-handlers";
import { registerUsersHandlers } from "./ipc/users-handlers";
import { registerShellHandlers } from "./ipc/shell-handlers";
import { registerLogHandlers } from "./ipc/log-handlers";
import { getAutoBackupFolder, getAutoBackupRetention, getAutoExportFolder } from "./db/settings-repo";
import { runAutoExport } from "./db/history-repo";
import { runBackup } from "./db/backup";
import { initLogger, logError } from "./logger";

const DEFAULT_BACKUP_RETENTION = 10;
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

function defaultBackupFolder(): string {
  return join(app.getPath("documents"), "PORTUS", "backups");
}

function performBackup(): void {
  const folder = getAutoBackupFolder(defaultBackupFolder());
  const retention = getAutoBackupRetention(DEFAULT_BACKUP_RETENTION);
  const result = runBackup(folder, retention);
  if (result.backedUp) {
    console.log(`[auto-backup] backup gerado em "${result.path}" (retenção: ${retention}).`);
  }
  if (result.errors.length > 0) {
    console.error("[auto-backup] Erros:", result.errors.join("; "));
  }
}

function scheduleNextBackup(): void {
  setTimeout(() => {
    performBackup();
    scheduleNextBackup();
  }, BACKUP_INTERVAL_MS);
}

initLogger(app.getPath("userData"));

process.on("uncaughtException", (err) => {
  logError("main:uncaughtException", err.message, err);
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logError("main:unhandledRejection", err.message, err);
});

const isDev = process.env.ELECTRON_DEV === "1" || (!app.isPackaged && process.env.NODE_ENV !== "production");

console.log("[main] startup:", {
  ELECTRON_DEV: process.env.ELECTRON_DEV,
  NODE_ENV: process.env.NODE_ENV,
  isPackaged: app.isPackaged,
  isDev
});

function scheduleNextMidnightExport(): void {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  nextMidnight.setHours(0, 0, 0, 0);
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  setTimeout(() => {
    const defaultFolder = join(app.getPath("documents"), "PORTUS", "exportacoes");
    const folder = getAutoExportFolder(defaultFolder);
    const result = runAutoExport(folder);
    if (result.exported > 0 || result.errors.length > 0) {
      console.log(`[auto-export] ${result.exported} lote(s) exportado(s) para "${folder}".`);
      if (result.errors.length > 0) {
        console.error("[auto-export] Erros:", result.errors.join("; "));
      }
    }
    scheduleNextMidnightExport();
  }, msUntilMidnight);
}

function createWindow() {
  const preloadPath = join(app.getAppPath(), "dist/preload/index.js");
  console.log("[main] isDev:", isDev);
  console.log("[main] preload:", preloadPath);

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#0c0c0e",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Hardening: nega abertura de novas janelas e bloqueia navegação para fora
  // da aplicação (só o servidor de dev é permitido). Defesa em profundidade.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => {
    if (isDev && url.startsWith("http://localhost:5173")) return;
    e.preventDefault();
  });

  if (isDev) {
    console.log("[main] loading dev URL: http://localhost:5173");
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    const htmlPath = join(__dirname, "../renderer/index.html");
    console.log("[main] loading production HTML:", htmlPath);
    win.loadFile(htmlPath).catch(err => {
      console.error("[main] failed to load HTML:", err);
      process.exit(1);
    });
  }
}

app.whenReady().then(async () => {
  await openDb();
  runMigrations();
  seedInitialData();
  persistDb();
  performBackup();
  registerAuthHandlers();
  registerProductsHandlers();
  registerBatchesHandlers();
  registerSettingsHandlers();
  registerEquipmentsHandlers();
  registerUsersHandlers();
  registerCaptureHandlers();
  registerHistoryHandlers();
  registerShellHandlers();
  registerLogHandlers();
  scheduleNextMidnightExport();
  scheduleNextBackup();
  createWindow();
});

app.on("window-all-closed", () => {
  closeDb();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
