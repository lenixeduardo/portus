import { app, ipcMain, net } from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { startFileUpdate } from "../update-apply";
import { IPC, type AvailableUpdate, type ServiceResult } from "../../shared/ipc";
import { checkForUpdate } from "../updates";
import { downloadUpdate } from "../update-download";
import { isActive } from "../serial/capture-service";
import { logError, logInfo } from "../logger";

export function registerUpdateHandlers() {
  let checking: Promise<AvailableUpdate | null> | undefined;
  let downloading: Promise<ServiceResult<true>> | undefined;
  let downloadedPath: string | undefined;
  let downloadedUpdate: AvailableUpdate | undefined;
  let installing = false;
  // Coalesce concurrent requests, but never cache a failed/no-release result forever.
  const check = (): Promise<AvailableUpdate | null> => {
    if (!app.isPackaged || process.platform !== "win32") return Promise.resolve(null);
    return checking ??= checkForUpdate(app.getVersion(), net.fetch.bind(net)).finally(() => { checking = undefined; });
  };

  ipcMain.handle(IPC.updatesCheck, () => check());
  ipcMain.handle(IPC.updatesDownload, (event): Promise<ServiceResult<true>> => {
    if (installing) return Promise.resolve({ ok: false, error: "A atualização já está sendo aplicada." });
    if (downloading) return downloading;
    downloading = (async (): Promise<ServiceResult<true>> => {
      try {
        const update = await check();
        if (!update) return { ok: false, error: "Nenhuma atualização disponível. Confira a conexão e tente novamente." };
        downloadedPath = undefined;
        downloadedPath = await downloadUpdate(update, join(app.getPath("userData"), "updates", randomUUID()), net.fetch.bind(net), progress => {
          if (!event.sender.isDestroyed()) event.sender.send(IPC.updatesProgress, progress);
        });
        downloadedUpdate = update;
        logInfo("updates:download", `Pacote ${update.version} baixado com sucesso.`);
        return { ok: true, data: true };
      } catch (error) {
        logError("updates:download", "Falha ao baixar atualização.", error);
        return { ok: false, error: "Não foi possível concluir o download. Confira a conexão e tente novamente." };
      }
    })().finally(() => { downloading = undefined; });
    return downloading;
  });

  ipcMain.handle(IPC.updatesInstall, async (): Promise<ServiceResult<true>> => {
    if (!app.isPackaged || process.platform !== "win32" || !downloadedPath || !downloadedUpdate || installing) {
      return { ok: false, error: "Baixe a atualização antes de aplicar." };
    }
    if (isActive()) return { ok: false, error: "Conclua a captura em andamento antes de instalar a atualização." };
    try {
      installing = true;
      const cancel = await startFileUpdate(downloadedPath, downloadedUpdate, process.execPath,
        join(process.resourcesPath, "portus-apply-update.ps1"));
      if (isActive()) {
        await cancel();
        installing = false;
        return { ok: false, error: "Conclua a captura em andamento antes de aplicar a atualização." };
      }
      logInfo("updates:apply", "Pacote validado. Aplicando arquivos na pasta atual após encerrar o PORTUS.");
      setImmediate(() => app.quit());
      return { ok: true, data: true };
    } catch (error) {
      installing = false;
      logError("updates:install", "Falha ao preparar atualização.", error);
      return { ok: false, error: "Não foi possível aplicar a atualização. Tente novamente." };
    }
  });
}
