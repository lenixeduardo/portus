import { ipcMain, shell } from "electron";
import { IPC } from "../../shared/ipc";
import { getCurrentUser } from "../auth/auth-service";

const ALLOWED_PROTOCOLS = new Set(["https:", "http:"]);

export function registerShellHandlers() {
  ipcMain.handle(IPC.shellOpenExternal, (_event, url: string) => {
    if (!getCurrentUser()) return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return;
    return shell.openExternal(url);
  });
}
