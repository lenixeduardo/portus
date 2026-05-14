import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { closeDb } from "./db/connection";
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

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#F3F4F6",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  };
}

app.whenReady().then(() => {
  runMigrations();
  seedInitialData();
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
