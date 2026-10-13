import { getUserOperationalSector } from "../../shared/user-sector";
import { canReopenFinalizedBatch, canSetBatchCompleted, canFinalizeBatch } from "../../shared/batch-permissions";
import { ipcMain } from "electron";
import { hostname } from "node:os";
import { z } from "zod";
import { IPC, type BatchInput, type BatchWithProduct, type ServiceResult } from "../../shared/ipc";
import { getCurrentUser } from "../auth/auth-service";
import {
  checkCentralDatabase,
  getCentralDatabaseMode,
  isCentralDatabaseRequired,
  isCentralDatabaseConfigured,
  centralQuery
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
import { getCentralProduct, findCentralProductByBarcodePrefix } from "../db/central-products-repo";
import { getCentralBatchHistory } from "../db/central-history-repo";
import { administrativeBatchSchema, closeBatchSchema, createBatchSchema } from "../validation/schemas";
import { compose, requireAuth, validateInput } from "./middleware";

async function auditAdministrativeReason(userId: number, batchId: number, action: string, justification: string): Promise<void> {
  await centralQuery(
    `INSERT INTO portus_audit_log (actor_user_id, station_code, action, resource_type, resource_id, details)
      VALUES ($1, $2, $3, 'batch', $4, jsonb_build_object('justification', $5))`,
    [userId, hostname(), action, String(batchId), justification]
  );
}


// Registra a estação que executou o encerramento legado.
async function auditClosingStation(userId: number, batchId: number): Promise<void> {
  await centralQuery(
    `INSERT INTO portus_audit_log (actor_user_id, station_code, action, resource_type, resource_id, details)
     VALUES ($1, $2, 'BATCH_CLOSED', 'batch', $3, '{}'::jsonb)`,
    [userId, hostname(), String(batchId)]
  );
}

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
      return listCentralOpenBatches(user.username, getUserOperationalSector(user));
    })
  );

  ipcMain.handle(
    IPC.centralBatchesListAll,
    compose([requireAuth])(async (): Promise<BatchWithProduct[]> => {
      const user = getCurrentUser();
      if (!user || !isCentralDatabaseConfigured()) return [];
      return listCentralAllBatches(user.username, getUserOperationalSector(user));
    })
  );

  ipcMain.handle(
    IPC.centralHistoryGetBatch,
    compose([requireAuth, validateInput(closeBatchSchema)])(
      async (_e, input: { id: number }): Promise<ServiceResult<import("../../shared/ipc").BatchHistory>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
          try {
          const history = await getCentralBatchHistory(input.id, user.username, getUserOperationalSector(user));
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
      const { findCentralBatchByCode } = await import("../db/central-batches-repo");
      return findCentralBatchByCode(code, user.username, getUserOperationalSector(user));
    })
  );

  ipcMain.handle(
    IPC.centralBatchesCreate,
    compose([requireAuth, validateInput(createBatchSchema)])(
      async (_e, input: BatchInput): Promise<ServiceResult<BatchWithProduct>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
          if (user.role === "supervisor") {
          return { ok: false, error: "Supervisor não abre lotes operacionais." };
        }
        try {
          const scanned = input.barcodeValue?.trim();
          let product = await getCentralProduct(input.productId);
          if (scanned) {
            const digits = scanned.replace(/\\D/g, "");
            if (!/^\\d{16}$/.test(digits)) {
              return { ok: false, error: "Etiqueta inválida: esperado código de produto (12 dígitos) e lote (4 dígitos)." };
            }
            const identified = await findCentralProductByBarcodePrefix(digits.slice(0, 12));
            if (!identified) return { ok: false, error: "Produto não localizado pelo código de barras. Solicite o cadastro do código no catálogo central." };
            if (product?.id !== identified.id) {
              return { ok: false, error: "Produto divergente do código lido. A criação foi bloqueada." };
            }
          }
          if (!product) return { ok: false, error: "Produto não encontrado no catálogo PostgreSQL." };
          const code = input.code?.trim() || `CENTRAL-${Date.now()}`;
          return { ok: true, data: await openCentralBatch(product.name, product.description, code, user.username, getUserOperationalSector(user)) };
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
        if (!canSetBatchCompleted(user.role, getUserOperationalSector(user), input.completed)) {
          return { ok: false, error: "Somente operadores podem concluir lotes; apenas o Laboratório pode desmarcar a conclusão." };
        }
          try {
          return {
            ok: true,
            data: await setCentralBatchCompleted(input.id, user.username, getUserOperationalSector(user), input.completed)
          };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao atualizar conclusão do lote." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.centralBatchesFinalize,
    compose([requireAuth, validateInput(administrativeBatchSchema)])(
      async (_e, input: { id: number; justification: string }): Promise<ServiceResult<BatchWithProduct>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
        if (!canFinalizeBatch(user.role, getUserOperationalSector(user))) {
          return { ok: false, error: "Somente a credencial Laboratório pode finalizar o lote." };
        }
          try {
          return {
            ok: true,
            data: await finalizeCentralBatch(input.id, user.username, getUserOperationalSector(user)).then(async batch => { await auditAdministrativeReason(user.id, input.id, "BATCH_FINALIZED", input.justification); return batch; })
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
          if (user.sectorCode !== "PRODUCTION") {
          return { ok: false, error: "Somente a visão Produção pode registrar esta confirmação." };
        }
        try {
          const batch = await confirmCentralProductionClose(input.id, user.username);
          if (batch.status === "closed") await auditClosingStation(user.id, input.id).catch(error => console.error("Falha ao registrar estação:", error));
          return { ok: true, data: batch };
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
          try {
          const batch = await confirmCentralLaboratoryClose(input.id, user.username);
          if (batch.status === "closed") await auditClosingStation(user.id, input.id).catch(error => console.error("Falha ao registrar estação:", error));
          return { ok: true, data: batch };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao confirmar fechamento do Laboratório." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.centralBatchesForceClose,
    compose([requireAuth, validateInput(administrativeBatchSchema)])(
      async (_e, input: { id: number; justification: string }): Promise<ServiceResult<BatchWithProduct>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
          if (user.role !== "supervisor" && user.role !== "master") return { ok: false, error: "Somente Supervisor ou Master podem finalizar o lote." };
        try {
          const batch = await forceCentralBatchClose(input.id, user.username);
          await auditAdministrativeReason(user.id, input.id, "MASTER_BATCH_CLOSED", input.justification);
          return { ok: true, data: batch };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao finalizar o lote." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.centralBatchesReopen,
    compose([requireAuth, validateInput(administrativeBatchSchema)])(
      async (_e, input: { id: number; justification: string }): Promise<ServiceResult<BatchWithProduct>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
        if (!canReopenFinalizedBatch(user.role)) {
          return { ok: false, error: "Somente Supervisor ou Master podem reabrir um lote finalizado." };
        }
          try {
          const batch = await reopenCentralBatch(input.id, user.username, getUserOperationalSector(user), input.justification);
          await auditAdministrativeReason(user.id, input.id, "BATCH_REOPENED", input.justification);
          return { ok: true, data: batch };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao reabrir lote." };
        }
      }
    )
  );
}
