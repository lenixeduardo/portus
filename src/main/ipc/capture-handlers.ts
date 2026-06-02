import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc";
import { getCurrentUser } from "../auth/auth-service";
import { cancelCapture, getState, isActive, startCapture } from "../serial/capture-service";

export function registerCaptureHandlers(): void {
  ipcMain.handle(IPC.captureStart, async (_e, batchId: number) => {
    if (!getCurrentUser()) return { ok: false, error: "Sessão expirada." };
    return startCapture(batchId);
  });

  ipcMain.handle(IPC.captureCancel, async () => {
    if (!getCurrentUser()) return { ok: false, error: "Sessão expirada." };
    return cancelCapture();
  });

  ipcMain.handle(IPC.captureIsActive, (): boolean => isActive());

  ipcMain.handle(IPC.captureGetState, () => getState());
}
