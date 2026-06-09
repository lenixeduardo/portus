import { ipcMain } from "electron";
import { z } from "zod";
import { IPC } from "../../shared/ipc";
import { getCurrentUser } from "../auth/auth-service";
import { cancelCapture, getState, isActive, startCapture } from "../serial/capture-service";
import { compose, requireAuth, validateInput } from "./middleware";

const startCaptureSchema = z.object({
  batchId: z.number().positive("ID do lote deve ser um número positivo")
});

export function registerCaptureHandlers(): void {
  ipcMain.handle(
    IPC.captureStart,
    compose([requireAuth, validateInput(startCaptureSchema)])(
      async (_e, input: z.infer<typeof startCaptureSchema>) => {
        return startCapture(input.batchId);
      }
    )
  );

  ipcMain.handle(
    IPC.captureCancel,
    compose([requireAuth])(async () => {
      return cancelCapture();
    })
  );

  ipcMain.handle(
    IPC.captureIsActive,
    compose([requireAuth])((): boolean => isActive())
  );

  ipcMain.handle(
    IPC.captureGetState,
    compose([requireAuth])(() => getState())
  );
}
