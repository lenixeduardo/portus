import { dialog, ipcMain } from "electron";
import { IPC, type ServiceResult } from "../../shared/ipc";
import { getCurrentUser } from "../auth/auth-service";
import { listAllBatches } from "../db/batches-repo";
import { buildCsvContent, getBatchHistory, writeCsvFile } from "../db/history-repo";

export function registerHistoryHandlers(): void {
  ipcMain.handle(IPC.batchesListAll, (): ReturnType<typeof listAllBatches> => listAllBatches());

  ipcMain.handle(IPC.historyGetBatch, (_e, batchId: number): ServiceResult<ReturnType<typeof getBatchHistory>> => {
    if (!getCurrentUser()) return { ok: false, error: "Sessão expirada." };
    const history = getBatchHistory(batchId);
    if (!history) return { ok: false, error: "Lote não encontrado." };
    return { ok: true, data: history };
  });

  ipcMain.handle(IPC.historyExportCsv, async (_e, batchId: number): Promise<ServiceResult<true>> => {
    if (!getCurrentUser()) return { ok: false, error: "Sessão expirada." };
    const history = getBatchHistory(batchId);
    if (!history) return { ok: false, error: "Lote não encontrado." };

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: "Exportar histórico",
      defaultPath: `lote-${history.batch.code}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }]
    });

    if (canceled || !filePath) return { ok: false, error: "Exportação cancelada." };

    try {
      writeCsvFile(filePath, buildCsvContent(history));
      return { ok: true, data: true };
    } catch (err) {
      return { ok: false, error: `Erro ao salvar arquivo: ${String(err)}` };
    }
  });
}
