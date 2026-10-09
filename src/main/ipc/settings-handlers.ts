import { app, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { IPC, type AppSettings, type ServiceResult } from "../../shared/ipc";
import { listCentralStationSettings, setCentralStationSetting, getCentralStationSetting, getRuntimeStationCode } from "../db/central-station-settings-repo";
import { runBackup } from "../db/backup";
import { getCurrentUser } from "../auth/auth-service";
import { logAudit } from "../db/audit-repo";
import { updateSettingSchema, type UpdateSettingInput } from "../validation/schemas";
import { compose, requireAdmin, validateInput } from "./middleware";

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
  ipcMain.handle(
    IPC.settingsGetAll,
    compose([requireAdmin])(async (): Promise<AppSettings> => {
      const settings = await listCentralStationSettings();
      return { ...settings, station_code: getRuntimeStationCode() };
    })
  );

  ipcMain.handle(
    IPC.settingsSelectExportFolder,
    compose([requireAdmin])(async (): Promise<string | null> => {
      return selectExportFolderDialog();
    })
  );

  ipcMain.handle(
    IPC.settingsSelectBackupFolder,
    compose([requireAdmin])(async (): Promise<string | null> => {
      const role = await getCentralStationSetting("installation_mode");
      return role === "server" ? selectBackupFolderDialog() : null;
    })
  );

  ipcMain.handle(
    IPC.settingsBackupNow,
    compose([requireAdmin])(async (): Promise<ServiceResult<{ path: string }>> => {
      const role = await getCentralStationSetting("installation_mode");
      if (role !== "server") {
        return { ok: false, error: "Backup disponível somente na máquina servidor central. Esta estação não está configurada como servidor." };
      }
      const folder = DEFAULT_BACKUP_FOLDER();
      const retention = DEFAULT_BACKUP_RETENTION;
      const result = runBackup(folder, retention);
      if (!result.backedUp || !result.path) {
        return { ok: false, error: result.errors.join("; ") || "Falha desconhecida ao gerar o backup." };
      }
      return { ok: true, data: { path: result.path } };
    })
  );

  ipcMain.handle(
    IPC.settingsSet,
    compose([requireAdmin, validateInput(updateSettingSchema)])(
      async (_e, input: UpdateSettingInput): Promise<ServiceResult<true>> => {
        if (input.key === "station_code" && input.value.trim().toUpperCase() !== getRuntimeStationCode()) {
          return { ok: false, error: "A identidade física da máquina deve ser definida por PORTUS_STATION_CODE na instalação." };
        }
        try {
          await setCentralStationSetting(input.key, input.value);
          await logAudit({ actorUserId: getCurrentUser()?.id, action: "settings.update", resourceType: "setting", resourceId: input.key });
          return { ok: true, data: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Falha ao salvar configuração central." };
        }
      }
    )
  );
}
