import { ipcMain } from "electron";
import { IPC, type AppSettings, type ServiceResult } from "../../shared/ipc";
import { all } from "../db/query";
import { setSetting } from "../db/settings-repo";
import { getCurrentUser } from "../auth/auth-service";

const ALLOWED_KEYS = new Set<string>(["capture_timeout_seconds"]);

function validate(key: string, value: string): string | null {
  if (!ALLOWED_KEYS.has(key)) return "Configuração desconhecida.";
  if (key === "capture_timeout_seconds") {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 5 || n > 600) {
      return "Tempo de captura deve estar entre 5 e 600 segundos.";
    }
  }
  return null;
}

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.settingsGetAll, (): AppSettings => {
    const rows = all<{ key: string; value: string }>("SELECT key, value FROM settings");
    const out: AppSettings = {};
    rows.forEach((r) => (out[r.key] = r.value));
    return out;
  });

  ipcMain.handle(
    IPC.settingsSet,
    (_e, key: string, value: string): ServiceResult<true> => {
      if (!getCurrentUser()) return { ok: false, error: "Sessão expirada." };
      const err = validate(key, value);
      if (err) return { ok: false, error: err };
      setSetting(key, value);
      return { ok: true, data: true };
    }
  );
}
