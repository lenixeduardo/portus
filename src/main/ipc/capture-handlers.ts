import { ipcMain } from "electron";
import { z } from "zod";
import { IPC } from "../../shared/ipc";
import { getCurrentUser } from "../auth/auth-service";
import { cancelCapture, getState, injectManualReading, isActive, skipFirstReading, startCapture } from "../serial/capture-service";
import { compose, requireAuth, validateInput } from "./middleware";

const startCaptureSchema = z.object({
  batchId: z.number().positive("ID do lote deve ser um número positivo"),
  equipmentIds: z.array(z.number().positive()).optional()
});

const injectReadingSchema = z.object({
  slotIndex: z.number().int().min(1).max(6),
  rawValue: z.string().min(1, "O valor não pode ser vazio")
});

export function registerCaptureHandlers(): void {
  ipcMain.handle(
    IPC.captureStart,
    compose([requireAuth, validateInput(startCaptureSchema)])(
      async (_e, input: z.infer<typeof startCaptureSchema>) => {
        return startCapture(input.batchId, input.equipmentIds);
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
    IPC.captureSkipFirstReading,
    compose([requireAuth])(() => {
      return skipFirstReading();
    })
  );

  ipcMain.handle(
    IPC.captureInjectReading,
    compose([requireAuth, validateInput(injectReadingSchema)])(
      (_e, input: z.infer<typeof injectReadingSchema>) => {
        return injectManualReading(input.slotIndex, input.rawValue);
      }
    )
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
