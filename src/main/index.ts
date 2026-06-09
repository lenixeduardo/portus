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
import { getAutoExportFolder } from "./db/settings-repo";
import { runAutoExport } from "./db/history-repo";

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
  const preloadPath = join(app.getAppPath(), "dist/main/preload/index.js");
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
      sandbox: true
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
    const htmlPath = join(__dirname, "../../renderer/index.html");
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
  registerAuthHandlers();
  registerProductsHandlers();
  registerBatchesHandlers();
  registerSettingsHandlers();
  registerEquipmentsHandlers();
  registerUsersHandlers();
  registerCaptureHandlers();
  registerHistoryHandlers();
  registerShellHandlers();
  scheduleNextMidnightExport();
  createWindow();
});

app.on("window-all-closed", () => {
  closeDb();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
