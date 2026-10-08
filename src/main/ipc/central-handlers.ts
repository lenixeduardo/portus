import { ipcMain } from "electron";
import { z } from "zod";
import { IPC, type BatchInput, type BatchWithProduct, type ServiceResult } from "../../shared/ipc";
import { getCurrentUser } from "../auth/auth-service";
import {
  checkCentralDatabase,
  getCentralDatabaseMode,
  isCentralDatabaseRequired,
  isCentralDatabaseConfigured
} from "../db/central-connection";
import {
  confirmCentralLaboratoryClose,
  confirmCentralProductionClose,
  finalizeCentralBatch,
  forceCentralBatchClose,
  listCentralOpenBatches,
  listCentralAllBatches,
  openCentralBatch,
  reopenCentralBatch,
  setCentralBatchCompleted
} from "../db/central-batches-repo";
import { getCentralProduct } from "../db/central-products-repo";
import { getCentralBatchHistory } from "../db/central-history-repo";
import { ensureCentralUserAccess } from "../db/central-users-repo";
import { closeBatchSchema, createBatchSchema } from "../validation/schemas";
import { compose, requireAuth, validateInput } from "./middleware";

const setCompletedSchema = z.object({
  id: z.number().positive("ID do lote deve ser um número positivo"),
  completed: z.boolean()
});

function unavailable<T>(): ServiceResult<T> {
  return { ok: false, error: "Base central indisponível ou não configurada." };
}

export function registerCentralHandlers(): void {
  ipcMain.handle(IPC.centralStatus, async () => {
    const mode = getCentralDatabaseMode();
    const required = isCentralDatabaseRequired();
    if (!isCentralDatabaseConfigured()) return { configured: false, available: false, required, mode };
    try {
      await checkCentralDatabase();
      return { configured: true, available: true, required, mode };
    } catch (error) {
      return {
        configured: true, available: false, required, mode,
        error: error instanceof Error ? error.message : "Falha ao validar PostgreSQL central."
      };
    }
  });

  ipcMain.handle(
    IPC.centralBatchesListOpen,
    compose([requireAuth])(async (): Promise<BatchWithProduct[]> => {
      const user = getCurrentUser();
      if (!user || !isCentralDatabaseConfigured()) return [];
      await ensureCentralUserAccess(user);
      return listCentralOpenBatches(user.username, user.sectorCode ?? "PRODUCTION");
    })
  );

  ipcMain.handle(
    IPC.centralBatchesListAll,
    compose([requireAuth])(async (): Promise<BatchWithProduct[]> => {
      const user = getCurrentUser();
      if (!user || !isCentralDatabaseConfigured()) return [];
      await ensureCentralUserAccess(user);
      return listCentralAllBatches(user.username, user.sectorCode ?? "PRODUCTION");
    })
  );

  ipcMain.handle(
    IPC.centralHistoryGetBatch,
    compose([requireAuth, validateInput(closeBatchSchema)])(
      async (_e, input: { id: number }): Promise<ServiceResult<import("../../shared/ipc").BatchHistory>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
        await ensureCentralUserAccess(user);
        try {
          const history = await getCentralBatchHistory(input.id, user.username, user.sectorCode ?? "PRODUCTION");
          return history ? { ok: true, data: history } : { ok: false, error: "Lote não encontrado na base central." };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao carregar histórico central." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.centralBatchesFindByCode,
    compose([requireAuth])(async (_e, code: string): Promise<BatchWithProduct | null> => {
      const user = getCurrentUser();
      if (!user || !isCentralDatabaseConfigured()) return null;
      await ensureCentralUserAccess(user);
      const { findCentralBatchByCode } = await import("../db/central-batches-repo");
      return findCentralBatchByCode(code, user.username, user.sectorCode ?? "PRODUCTION");
    })
  );

  ipcMain.handle(
    IPC.centralBatchesCreate,
    compose([requireAuth, validateInput(createBatchSchema)])(
      async (_e, input: BatchInput): Promise<ServiceResult<BatchWithProduct>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
        await ensureCentralUserAccess(user);
        if (user.role === "supervisor") {
          return { ok: false, error: "Supervisor não abre lotes operacionais." };
        }
        const product = await getCentralProduct(input.productId);
        if (!product) return { ok: false, error: "Produto local inválido." };
        try {
          const code = input.code?.trim() || `CENTRAL-${Date.now()}`;
          return { ok: true, data: await openCentralBatch(product.name, product.description, code, user.username, user.sectorCode ?? "PRODUCTION") };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao criar lote na base central." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.centralBatchesSetCompleted,
    compose([requireAuth, validateInput(setCompletedSchema)])(
      async (_e, input: { id: number; completed: boolean }): Promise<ServiceResult<BatchWithProduct>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
        if (user.role === "supervisor") {
          return { ok: false, error: "Supervisor não altera a conclusão operacional do lote." };
        }
        await ensureCentralUserAccess(user);
        try {
          return {
            ok: true,
            data: await setCentralBatchCompleted(input.id, user.username, user.sectorCode ?? "PRODUCTION", input.completed)
          };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao atualizar conclusão do lote." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.centralBatchesFinalize,
    compose([requireAuth, validateInput(closeBatchSchema)])(
      async (_e, input: { id: number }): Promise<ServiceResult<BatchWithProduct>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
        if (user.role !== "supervisor" && user.role !== "master") {
          return { ok: false, error: "Somente Supervisor ou Master podem finalizar o lote." };
        }
        await ensureCentralUserAccess(user);
        try {
          return {
            ok: true,
            data: await finalizeCentralBatch(input.id, user.username, user.sectorCode ?? "PRODUCTION")
          };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao finalizar o lote." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.centralBatchesConfirmProduction,
    compose([requireAuth, validateInput(closeBatchSchema)])(
      async (_e, input: { id: number }): Promise<ServiceResult<BatchWithProduct>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
        await ensureCentralUserAccess(user);
        if (user.sectorCode !== "PRODUCTION") {
          return { ok: false, error: "Somente a visão Produção pode registrar esta confirmação." };
        }
        try {
          return { ok: true, data: await confirmCentralProductionClose(input.id, user.username) };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao confirmar fechamento da Produção." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.centralBatchesConfirmLaboratory,
    compose([requireAuth, validateInput(closeBatchSchema)])(
      async (_e, input: { id: number }): Promise<ServiceResult<BatchWithProduct>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
        await ensureCentralUserAccess(user);
        try {
          return { ok: true, data: await confirmCentralLaboratoryClose(input.id, user.username) };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao confirmar fechamento do Laboratório." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.centralBatchesForceClose,
    compose([requireAuth, validateInput(closeBatchSchema)])(
      async (_e, input: { id: number }): Promise<ServiceResult<BatchWithProduct>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
        await ensureCentralUserAccess(user);
        if (user.role !== "supervisor" && user.role !== "master") return { ok: false, error: "Somente Supervisor ou Master podem finalizar o lote." };
        try {
          return { ok: true, data: await forceCentralBatchClose(input.id, user.username) };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao finalizar o lote." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.centralBatchesReopen,
    compose([requireAuth, validateInput(closeBatchSchema)])(
      async (_e, input: { id: number }): Promise<ServiceResult<BatchWithProduct>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
        if (user.role !== "supervisor" && user.role !== "master") {
          return { ok: false, error: "Somente Supervisor ou Master podem reabrir um lote finalizado." };
        }
        await ensureCentralUserAccess(user);
        try {
          return { ok: true, data: await reopenCentralBatch(input.id, user.username, user.sectorCode ?? "PRODUCTION") };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao reabrir lote." };
        }
      }
    )
  );
}
