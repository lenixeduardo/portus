import { app, ipcMain, net } from "electron";
import { spawn } from "node:child_process";
import { win32 } from "node:path";
import { access } from "node:fs/promises";
import { IPC, type AvailableUpdate, type ServiceResult } from "../../shared/ipc";
import { checkForUpdate } from "../updates";
import { downloadUpdate } from "../update-download";
import { isActive } from "../serial/capture-service";
import { logError, logInfo } from "../logger";

export function registerUpdateHandlers() {
  let checking: Promise<AvailableUpdate | null> | undefined;
  let downloading: Promise<ServiceResult<true>> | undefined;
  let downloadedPath: string | undefined;
  let announcedUpdate: AvailableUpdate | null = null;
  let installing = false;
  // Coalesce concurrent requests, but never cache a failed/no-release result forever.
  const check = (): Promise<AvailableUpdate | null> => {
    if (!app.isPackaged || process.platform !== "win32") return Promise.resolve(null);
    return checking ??= checkForUpdate(app.getVersion(), net.fetch.bind(net)).finally(() => { checking = undefined; });
  };

  ipcMain.handle(IPC.updatesCheck, async () => {
    const result = await check();
    announcedUpdate = result;
    return result;
  });
  ipcMain.handle(IPC.updatesDownload, (event): Promise<ServiceResult<true>> => {
    if (installing) return Promise.resolve({ ok: false, error: "A atualização já está sendo instalada." });
    if (downloading) return downloading;
    logInfo("updates:download", "Solicitação de download recebida.");
    downloading = (async (): Promise<ServiceResult<true>> => {
      try {
        // Reuse the already announced release; an intermittent second check must not block a click.
        const update = announcedUpdate ?? await check();
        if (!update) return { ok: false, error: "Não foi possível confirmar a atualização no GitHub. Verifique sua conexão e tente novamente." };
        downloadedPath = undefined;
        logInfo("updates:download", `Iniciando download da versão ${update.version}.`);
        downloadedPath = await downloadUpdate(update, app.getPath("downloads"), net.fetch.bind(net), progress => {
          if (!event.sender.isDestroyed()) event.sender.send(IPC.updatesProgress, progress);
        });
        logInfo("updates:download", `Instalador ${update.version} baixado com sucesso.`);
        return { ok: true, data: true };
      } catch (error) {
        logError("updates:download", "Falha ao baixar atualização.", error);
        const detail = error instanceof Error ? error.message : String(error);
        return { ok: false, error: `Não foi possível baixar a atualização: ${detail}` };
      }
    })().finally(() => { downloading = undefined; });
    return downloading;
  });

  ipcMain.handle(IPC.updatesInstall, async (): Promise<ServiceResult<true>> => {
    if (!app.isPackaged || process.platform !== "win32" || !downloadedPath || installing) {
      return { ok: false, error: "Baixe a atualização antes de instalar." };
    }
    if (isActive()) return { ok: false, error: "Conclua a captura em andamento antes de instalar a atualização." };
    try {
      installing = true;
      await access(downloadedPath);
      // NSIS requires /D last and unquoted, even for paths containing spaces.
      const child = spawn(downloadedPath, ["/S", "--updated", "--force-run", `/D=${win32.dirname(process.execPath)}`], {
        detached: true, stdio: "ignore", windowsHide: true, windowsVerbatimArguments: true
      });
      await new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("spawn", resolve); });
      child.unref();
      logInfo("updates:install", "Instalador iniciado para atualizar a pasta atual do PORTUS.");
      // The NSIS updater waits for PORTUS to close and relaunches it after installation.
      setImmediate(() => app.quit());
      return { ok: true, data: true };
    } catch (error) {
      installing = false;
      logError("updates:install", "Falha ao iniciar instalador.", error);
      return { ok: false, error: "Não foi possível iniciar a instalação. Tente novamente." };
    }
  });
}
