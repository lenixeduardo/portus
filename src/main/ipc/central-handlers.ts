import { ipcMain } from "electron";
import { IPC, type BatchInput, type BatchWithProduct, type ServiceResult } from "../../shared/ipc";
import { getCurrentUser } from "../auth/auth-service";
import {
  checkCentralDatabase,
  isCentralDatabaseConfigured
} from "../db/central-connection";
import {
  confirmCentralLaboratoryClose,
  confirmCentralProductionClose,
  listCentralOpenBatches,
  openCentralBatch
} from "../db/central-batches-repo";
import { getProduct } from "../db/products-repo";
import { closeBatchSchema, createBatchSchema } from "../validation/schemas";
import { compose, requireAuth, validateInput } from "./middleware";

function unavailable<T>(): ServiceResult<T> {
  return { ok: false, error: "Base central indisponível ou não configurada." };
}

export function registerCentralHandlers(): void {
  ipcMain.handle(IPC.centralStatus, async () => {
    if (!isCentralDatabaseConfigured()) return { configured: false, available: false };
    try {
      await checkCentralDatabase();
      return { configured: true, available: true };
    } catch {
      return { configured: true, available: false };
    }
  });

  ipcMain.handle(
    IPC.centralBatchesListOpen,
    compose([requireAuth])(async (): Promise<BatchWithProduct[]> => {
      if (!isCentralDatabaseConfigured()) return [];
      return listCentralOpenBatches();
    })
  );

  ipcMain.handle(
    IPC.centralBatchesCreate,
    compose([requireAuth, validateInput(createBatchSchema)])(
      async (_e, input: BatchInput): Promise<ServiceResult<BatchWithProduct>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
        const product = getProduct(input.productId);
        if (!product) return { ok: false, error: "Produto local inválido." };
        try {
          const code = input.code?.trim() || `CENTRAL-${Date.now()}`;
          return { ok: true, data: await openCentralBatch(product.name, code, user.username) };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao criar lote na base central." };
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
        try {
          return { ok: true, data: await confirmCentralLaboratoryClose(input.id, user.username) };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao confirmar fechamento do Laboratório." };
        }
      }
    )
  );
}
