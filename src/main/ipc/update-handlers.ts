import { app, ipcMain, net, shell } from "electron";
import { IPC, type AvailableUpdate, type ServiceResult } from "../../shared/ipc";
import { checkForUpdate } from "../updates";

export function registerUpdateHandlers() {
  let checked: Promise<AvailableUpdate | null> | undefined;
  const check = () => checked ??= app.isPackaged && process.platform === "win32"
    ? checkForUpdate(app.getVersion(), net.fetch.bind(net))
    : Promise.resolve(null);

  // Available before login; no URL or executable is accepted from the renderer.
  ipcMain.handle(IPC.updatesCheck, () => check());
  ipcMain.handle(IPC.updatesDownload, async (): Promise<ServiceResult<true>> => {
    const update = await check();
    if (!update) return { ok: false, error: "Nenhuma atualização disponível." };
    try {
      await shell.openExternal(update.downloadUrl);
      return { ok: true, data: true };
    } catch {
      return { ok: false, error: "Não foi possível abrir o download. Tente novamente." };
    }
  });
}
