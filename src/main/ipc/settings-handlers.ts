import { app, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { IPC, type AppSettings, type ServiceResult } from "../../shared/ipc";
import { all } from "../db/query";
import { getAutoBackupFolder, getAutoBackupRetention, setSetting } from "../db/settings-repo";
import { runBackup } from "../db/backup";
import { getCurrentUser } from "../auth/auth-service";
import { updateSettingSchema, type UpdateSettingInput } from "../validation/schemas";
import { compose, requireAuth, validateInput } from "./middleware";

const DEFAULT_BACKUP_FOLDER = (): string => join(app.getPath("documents"), "PORTUS", "backups");
const DEFAULT_BACKUP_RETENTION = 10;

async function selectExportFolderDialog(): Promise<string | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Selecionar pasta de exportação automática",
    properties: ["openDirectory", "createDirectory"]
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
}

async function selectBackupFolderDialog(): Promise<string | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Selecionar pasta de backup do banco de dados",
    properties: ["openDirectory", "createDirectory"]
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
}

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.settingsGetAll, (): AppSettings => {
    const rows = all<{ key: string; value: string }>("SELECT key, value FROM settings");
    const out: AppSettings = {};
    rows.forEach((r) => (out[r.key] = r.value));
    return out;
  });

  ipcMain.handle(IPC.settingsSelectExportFolder, async (): Promise<string | null> => {
    if (!getCurrentUser()) return null;
    return selectExportFolderDialog();
  });

  ipcMain.handle(IPC.settingsSelectBackupFolder, async (): Promise<string | null> => {
    if (!getCurrentUser()) return null;
    return selectBackupFolderDialog();
  });

  ipcMain.handle(
    IPC.settingsBackupNow,
    compose([requireAuth])((): ServiceResult<{ path: string }> => {
      const folder = getAutoBackupFolder(DEFAULT_BACKUP_FOLDER());
      const retention = getAutoBackupRetention(DEFAULT_BACKUP_RETENTION);
      const result = runBackup(folder, retention);
      if (!result.backedUp || !result.path) {
        return { ok: false, error: result.errors.join("; ") || "Falha desconhecida ao gerar o backup." };
      }
      return { ok: true, data: { path: result.path } };
    })
  );

  ipcMain.handle(
    IPC.settingsSet,
    compose([requireAuth, validateInput(updateSettingSchema)])(
      (_e, input: UpdateSettingInput): ServiceResult<true> => {
        setSetting(input.key, input.value);
        return { ok: true, data: true };
      }
    )
  );
}
