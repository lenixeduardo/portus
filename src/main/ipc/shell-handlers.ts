import { ipcMain, shell } from "electron";
import { z } from "zod";
import { IPC } from "../../shared/ipc";
import { compose, requireAdmin, requireAuth, validateInput } from "./middleware";
import { launchPortusDbUtility } from "../utility-launcher";
import type { ServiceResult } from "../../shared/ipc";

const ALLOWED_PROTOCOLS = new Set(["https:", "http:"]);

const openExternalSchema = z.object({
  url: z.string().url("URL inválida").refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return ALLOWED_PROTOCOLS.has(parsed.protocol);
      } catch {
        return false;
      }
    },
    "Protocolo não permitido"
  )
});

export function registerShellHandlers() {
  ipcMain.handle(
    IPC.shellOpenDbUtility,
    compose([requireAdmin])(async (): Promise<ServiceResult<true>> => {
      try {
        await launchPortusDbUtility();
        return { ok: true, data: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Não foi possível abrir o PORTUS DB Utility."
        };
      }
    })
  );

  ipcMain.handle(
    IPC.shellOpenExternal,
    compose([requireAuth, validateInput(openExternalSchema)])(
      async (_event, input: z.infer<typeof openExternalSchema>) => {
        return shell.openExternal(input.url);
      }
    )
  );
}
