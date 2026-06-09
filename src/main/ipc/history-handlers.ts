import { dialog, ipcMain } from "electron";
import { z } from "zod";
import { IPC, type ServiceResult, type HistoryFilterInput } from "../../shared/ipc";
import { getCurrentUser } from "../auth/auth-service";
import { listAllBatches } from "../db/batches-repo";
import { buildCsvContent, getBatchHistory, writeCsvFile } from "../db/history-repo";
import { compose, requireAuth, validateInput } from "./middleware";

const getBatchHistorySchema = z.object({
  batchId: z.number().positive("ID do lote deve ser um número positivo")
});

const exportCsvSchema = z.object({
  batchId: z.number().positive("ID do lote deve ser um número positivo"),
  filters: z.object({
    equipmentId: z.number().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional()
  }).optional()
});

export function registerHistoryHandlers(): void {
  ipcMain.handle(IPC.batchesListAll, (): ReturnType<typeof listAllBatches> => listAllBatches());

  ipcMain.handle(
    IPC.historyGetBatch,
    compose([requireAuth, validateInput(getBatchHistorySchema)])(
      (_e, input: z.infer<typeof getBatchHistorySchema>): ServiceResult<ReturnType<typeof getBatchHistory>> => {
        const history = getBatchHistory(input.batchId);
        if (!history) return { ok: false, error: "Lote não encontrado." };
        return { ok: true, data: history };
      }
    )
  );

  ipcMain.handle(
    IPC.historyExportCsv,
    compose([requireAuth, validateInput(exportCsvSchema)])(
      async (_e, input: z.infer<typeof exportCsvSchema>): Promise<ServiceResult<true>> => {
        const history = getBatchHistory(input.batchId);
        if (!history) return { ok: false, error: "Lote não encontrado." };
        const filters = input.filters;

        // Aplica filtros se fornecidos
        if (filters) {
          history.sessions = history.sessions.map((session) => {
            const filteredReadings = session.readings.filter((r) => {
              if (filters.equipmentId && r.equipmentId !== filters.equipmentId) return false;

              const rDate = new Date(r.capturedAt.replace(" ", "T") + "Z");
              if (filters.startDate) {
                const start = new Date(filters.startDate + "T00:00:00");
                if (rDate < start) return false;
              }
              if (filters.endDate) {
                const end = new Date(filters.endDate + "T23:59:59");
                if (rDate > end) return false;
              }
              return true;
            });

            return {
              ...session,
              readings: filteredReadings
            };
          }).filter((session) => {
            // Oculta sessões sem leituras quando houver qualquer filtro ativo
            const hasActiveFilters = !!(filters.equipmentId || filters.startDate || filters.endDate);
            if (hasActiveFilters) {
              return session.readings.length > 0;
            }
            return true;
          });
        }

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
      }
    )
  );
}
