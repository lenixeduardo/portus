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
  forceCentralBatchClose,
  listCentralOpenBatches,
  listCentralAllBatches,
  openCentralBatch,
  reopenCentralBatch
} from "../db/central-batches-repo";
import { getProduct } from "../db/products-repo";
import { getCentralBatchHistory } from "../db/central-history-repo";
import { ensureCentralUserAccess } from "../db/central-users-repo";
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

  ipcMain.handle(
    IPC.centralBatchesForceClose,
    compose([requireAuth, validateInput(closeBatchSchema)])(
      async (_e, input: { id: number }): Promise<ServiceResult<BatchWithProduct>> => {
        const user = getCurrentUser();
        if (!user || !isCentralDatabaseConfigured()) return unavailable();
        await ensureCentralUserAccess(user);
        if (user.role !== "admin" && user.role !== "master") return { ok: false, error: "Somente administradores podem finalizar um lote sem confirmações setoriais." };
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
        if (user.role !== "master") {
          return { ok: false, error: "Somente o usuário Master pode reabrir um lote encerrado." };
        }
        await ensureCentralUserAccess(user);
        try {
          return { ok: true, data: await reopenCentralBatch(input.id, user.username) };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Erro ao reabrir lote." };
        }
      }
    )
  );
}
