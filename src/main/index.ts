import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { closeDb, openDb, persistDb } from "./db/connection";
import { runMigrations } from "./db/migrate";
import { seedInitialData } from "./db/seed";
import { registerAuthHandlers } from "./ipc/auth-handlers";
import { registerBatchesHandlers } from "./ipc/batches-handlers";
import { registerCaptureHandlers } from "./ipc/capture-handlers";
import { registerEquipmentsHandlers } from "./ipc/equipments-handlers";
import { registerFormulasHandlers } from "./ipc/formulas-handlers";
import { registerHistoryHandlers } from "./ipc/history-handlers";
import { registerSettingsHandlers } from "./ipc/settings-handlers";
import { registerUsersHandlers } from "./ipc/users-handlers";

const isDev = !app.isPackaged && process.env.NODE_ENV !== "production" || process.env.ELECTRON_DEV === "1";

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
      sandbox: false
    }
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(join(__dirname, "../../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  await openDb();
  runMigrations();
  seedInitialData();
  persistDb();
  registerAuthHandlers();
  registerFormulasHandlers();
  registerBatchesHandlers();
  registerSettingsHandlers();
  registerEquipmentsHandlers();
  registerUsersHandlers();
  registerCaptureHandlers();
  registerHistoryHandlers();
  createWindow();
});

app.on("window-all-closed", () => {
  closeDb();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
