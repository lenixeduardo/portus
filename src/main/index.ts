import { app, BrowserWindow } from "electron";
import { join } from "node:path";
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
import { registerCentralHandlers } from "./ipc/central-handlers";
import { registerSetupHandlers } from "./ipc/setup-handlers";
import { registerUpdateHandlers } from "./ipc/update-handlers";
import { startServerRoutines, stopServerRoutines } from "./server-routines";
import { initLogger, logError, logInfo } from "./logger";
import { checkCentralDatabase, closeCentralDatabase, isCentralDatabaseConfigured } from "./db/central-connection";

initLogger(app.getPath("userData"));
const updateStartupMarker = `[PORTUS_UPDATE_SMOKE] versão carregada: ${app.getVersion()}`;
console.log(updateStartupMarker);
logInfo("updates:startup", updateStartupMarker);

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

function createWindow() {
  const preloadPath = join(app.getAppPath(), "dist/preload/index.js");
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, "portus-icon.png")
    : join(app.getAppPath(), "build/icon.png");
  console.log("[main] isDev:", isDev);
  console.log("[main] preload:", preloadPath);

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: iconPath,
    backgroundColor: "#0c0c0e",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // O preload compilado importa dist/shared/ipc.js. Preloads sandboxed não
      // podem carregar módulos locais CommonJS sem um bundler dedicado.
      sandbox: false
    }
  });

  win.webContents.on("preload-error", (_event, failedPreloadPath, error) => {
    console.error(`[main] preload failed: ${failedPreloadPath}`, error);
    logError("main:preload", `Falha ao carregar preload: ${failedPreloadPath}`, error);
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
  // SQLite desativado no runtime. A importação dos bancos locais deve ser
  // executada ANTES do corte com scripts/import-legacy-to-postgres.mjs.
  if (isCentralDatabaseConfigured()) {
    try {
      await checkCentralDatabase();
      console.log("[central-db] PostgreSQL central pronto.");
    } catch (error) {
      console.error("[central-db] configuração/migrations pendentes:", error);
    }
  } else {
    console.error("[central-db] configure PORTUS_DATABASE_URL antes de operar.");
  }
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
  registerCentralHandlers();
  registerSetupHandlers();
  registerUpdateHandlers();
  await startServerRoutines().catch(error => console.error("[central-db] rotinas do servidor não agendadas:", error));
  createWindow();
});

app.on("before-quit", stopServerRoutines);

app.on("window-all-closed", () => {
  void closeCentralDatabase();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
