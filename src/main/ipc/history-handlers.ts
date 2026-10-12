import { getUserOperationalSector } from "../../shared/user-sector";
import { BrowserWindow, dialog, ipcMain } from "electron";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { IPC, type ServiceResult, type BatchHistory, type BatchWithProduct } from "../../shared/ipc";
import { getCurrentUser } from "../auth/auth-service";
import { getCentralBatchHistory } from "../db/central-history-repo";
import { listCentralAllBatches } from "../db/central-batches-repo";
import { buildCsvContent } from "../db/central-report-content";
import { writeFormattedXlsx } from "../db/excel-report";
import { buildBatchPrintHtml } from "../db/traceability-report";
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

async function loadHistoryForCurrentUser(batchId: number): Promise<BatchHistory | null> {
  const user = getCurrentUser();
  if (!user) throw new Error("Sessão expirada.");
  return getCentralBatchHistory(batchId, user.username, getUserOperationalSector(user));
}

async function printTraceabilityHtml(html: string): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true }
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise<void>((resolve, reject) => {
      win.webContents.print({ printBackground: true }, (success, failureReason) => {
        if (success) resolve();
        else reject(new Error(failureReason || "Falha ao imprimir."));
      });
    });
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

async function exportTraceabilityPdf(html: string, suggestedName: string): Promise<boolean> {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: "Exportar relatório em PDF",
    defaultPath: suggestedName,
    filters: [{ name: "PDF", extensions: ["pdf"] }]
  });
  if (canceled || !filePath) return false;
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true }
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4"
    });
    await writeFile(filePath, pdf);
    return true;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

export function registerHistoryHandlers(): void {
  ipcMain.handle(
    IPC.batchesListAll,
    compose([requireAuth])(async (): Promise<BatchWithProduct[]> => {
      const user = getCurrentUser();
      if (!user) throw new Error("Sessão expirada.");
      return listCentralAllBatches(user.username, getUserOperationalSector(user));
    })
  );

  ipcMain.handle(
    IPC.historyGetBatch,
    compose([requireAuth, validateInput(getBatchHistorySchema)])(
      async (_e, input: z.infer<typeof getBatchHistorySchema>): Promise<ServiceResult<BatchHistory>> => {
        try {
          const history = await loadHistoryForCurrentUser(input.batchId);
          return history ? { ok: true, data: history }
            : { ok: false, error: "Lote não encontrado no PostgreSQL." };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Falha ao consultar histórico." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.historyPrintBatch,
    compose([requireAuth, validateInput(getBatchHistorySchema)])(
      async (_e, input: z.infer<typeof getBatchHistorySchema>): Promise<ServiceResult<true>> => {
        try {
          const history = await loadHistoryForCurrentUser(input.batchId);
          if (!history) return { ok: false, error: "Lote não encontrado." };
          await printTraceabilityHtml(buildBatchPrintHtml(history));
          return { ok: true, data: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Não foi possível imprimir a folha do lote." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.historyExportPdf,
    compose([requireAuth, validateInput(getBatchHistorySchema)])(
      async (_e, input: z.infer<typeof getBatchHistorySchema>): Promise<ServiceResult<true>> => {
        try {
          const history = await loadHistoryForCurrentUser(input.batchId);
          if (!history) return { ok: false, error: "Lote não encontrado." };
          const safeCode = history.batch.code.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
          const saved = await exportTraceabilityPdf(buildBatchPrintHtml(history), `relatorio-lote-${safeCode}.pdf`);
          return saved ? { ok: true, data: true } : { ok: false, error: "Exportação cancelada." };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Falha ao exportar o relatório PDF." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.historyExportCsv,
    compose([requireAuth, validateInput(exportCsvSchema)])(
      async (_e, input: z.infer<typeof exportCsvSchema>): Promise<ServiceResult<true>> => {
        const user = getCurrentUser();
        if (!user) return { ok: false, error: "Sessão expirada." };
        let history;
        try {
          history = await loadHistoryForCurrentUser(input.batchId);
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Não foi possível carregar o histórico central." };
        }
        if (!history) return { ok: false, error: "Lote não encontrado." };
        const filters = input.filters;

        if (filters) {
          history.sessions = history.sessions.map((session) => {
            const filteredReadings = session.readings.filter((r) => {
              if (filters.equipmentId && r.equipmentId !== filters.equipmentId) return false;

              const rDate = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(r.capturedAt) ? r.capturedAt : r.capturedAt.replace(" ", "T") + "Z");
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

            return { ...session, readings: filteredReadings };
          }).filter((session) => {
            const hasActiveFilters = !!(filters.equipmentId || filters.startDate || filters.endDate);
            return !hasActiveFilters || session.readings.length > 0;
          });
        }

        const { filePath, canceled } = await dialog.showSaveDialog({
          title: "Exportar histórico em Excel",
          defaultPath: `lote-${history.batch.code}.xlsx`,
          filters: [{ name: "Excel", extensions: ["xlsx"] }]
        });

        if (canceled || !filePath) return { ok: false, error: "Exportação cancelada." };

        try {
          writeFormattedXlsx(filePath, buildCsvContent(history));
          return { ok: true, data: true };
        } catch (err) {
          return { ok: false, error: `Erro ao salvar arquivo: ${String(err)}` };
        }
      }
    )
  );
}
