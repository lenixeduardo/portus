import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc";
import { logError } from "../logger";

export function registerLogHandlers(): void {
  ipcMain.handle(IPC.logError, (_e, source: string, message: string, stack?: string) => {
    logError(source, message, stack);
  });
}
