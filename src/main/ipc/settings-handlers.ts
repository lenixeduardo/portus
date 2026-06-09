import { dialog, ipcMain } from "electron";
import { IPC, type AppSettings, type ServiceResult } from "../../shared/ipc";
import { all } from "../db/query";
import { setSetting } from "../db/settings-repo";
import { getCurrentUser } from "../auth/auth-service";
import { updateSettingSchema, type UpdateSettingInput } from "../validation/schemas";
import { compose, requireAuth, validateInput } from "./middleware";

async function selectExportFolderDialog(): Promise<string | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Selecionar pasta de exportação automática",
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
