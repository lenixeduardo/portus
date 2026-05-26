import { ipcMain, shell } from "electron";
import { IPC } from "../../shared/ipc";

export function registerShellHandlers() {
  ipcMain.handle(IPC.shellOpenExternal, (_event, url: string) => shell.openExternal(url));
}
