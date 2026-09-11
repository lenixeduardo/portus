import { ipcMain } from "electron";
import { IPC, type BatchInput, type BatchWithProduct, type ServiceResult } from "../../shared/ipc";
import { canCloseLaboratory, isLaboratoryUser } from "../../shared/laboratory-access";
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
  listCentralOpenBatches,
  listCentralAllBatches,
  openCentralBatch
} from "../db/central-batches-repo";
import { getProduct } from "../db/products-repo";
import { getCentralBatchHistory } from "../db/central-history-repo";
import { closeBatchSchema, createBatchSchema } from "../validation/schemas";
import { compose, requireAuth, validateInput } from "./middleware";

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
    } catch {
      return { configured: true, available: false, required, mode };
    }
  });

  ipcMain.handle(
    IPC.centralBatchesListOpen,
    compose([requireAuth])(async (): Promise<BatchWithProduct[]> => {
      const user = getCurrentUser();
      if (!user || !isCentralDatabaseConfigured()) return [];
      return listCentralOpenBatches(user.username, user.sectorCode ?? "PRODUCTION");
    })
  );

  ipcMain.handle(
    IPC.centralBatchesListAll,
    compose([requireAuth])(async (): Promise<BatchWithProduct[]> => {
      const user = getCurrentUser();
      if (!user || !isCentralDatabaseConfigured()) return [];
      return listCentralAllBatches(user.username, user.sectorCode ?? "PRODUCTION");
    })
  );

  ipcMain.handle(
    IPC.centralHistoryGetBatch,
    compose([requireAuth, validateInput(closeBatchSchema)])(
      async (_e, input: { id: number }): Promise<ServiceResult<import("../../shared/ipc").BatchHistory>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
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
        if (isLaboratoryUser(user)) {
          return { ok: false, error: "O Laboratório consulta lotes abertos pela Produção; não cria novos lotes." };
        }
        const product = getProduct(input.productId);
        if (!product) return { ok: false, error: "Produto local inválido." };
        try {
          const code = input.code?.trim() || `CENTRAL-${Date.now()}`;
          return { ok: true, data: await openCentralBatch(product.name, product.description, code, user.username) };
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
        if (!canCloseLaboratory(user)) {
          return { ok: false, error: "Seu perfil não possui permissão de fechamento do Laboratório." };
        }
        try {
          return { ok: true, data: await confirmCentralLaboratoryClose(input.id, user.username) };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao confirmar fechamento do Laboratório." };
        }
      }
    )
  );
}
