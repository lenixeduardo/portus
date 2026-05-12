import { ipcMain } from "electron";
import { IPC, type BatchInput, type BatchWithRecipe, type ServiceResult } from "../../shared/ipc";
import { getCurrentUser } from "../auth/auth-service";
import {
  closeBatch,
  codeExists,
  countOpenBatches,
  createBatch,
  generateBatchCode,
  getBatchWithRecipe,
  listOpenBatches
} from "../db/batches-repo";
import { getRecipe } from "../db/recipes-repo";

const OPEN_BATCHES_SOFT_LIMIT = 6;

export function registerBatchesHandlers(): void {
  ipcMain.handle(IPC.batchesListOpen, (): BatchWithRecipe[] => listOpenBatches());

  ipcMain.handle(IPC.batchesCreate, (_e, input: BatchInput): ServiceResult<BatchWithRecipe> => {
    const user = getCurrentUser();
    if (!user) return { ok: false, error: "Sessão expirada." };
    if (!input?.recipeId || !getRecipe(input.recipeId)) {
      return { ok: false, error: "Receita inválida." };
    }
    if (countOpenBatches() >= OPEN_BATCHES_SOFT_LIMIT) {
      return {
        ok: false,
        error: `Já existem ${OPEN_BATCHES_SOFT_LIMIT} lotes abertos. Finalize um antes de criar outro.`
      };
    }
    let code = (input.code ?? "").trim();
    if (!code) code = generateBatchCode();
    if (codeExists(code)) return { ok: false, error: "Já existe um lote com esse código." };

    try {
      const batch = createBatch(input.recipeId, code, user.id);
      return { ok: true, data: batch };
    } catch {
      return { ok: false, error: "Erro ao criar lote." };
    }
  });

  ipcMain.handle(IPC.batchesClose, (_e, id: number): ServiceResult<true> => {
    if (!getCurrentUser()) return { ok: false, error: "Sessão expirada." };
    const batch = getBatchWithRecipe(id);
    if (!batch) return { ok: false, error: "Lote não encontrado." };
    if (batch.status === "closed") return { ok: false, error: "Lote já está fechado." };
    closeBatch(id);
    return { ok: true, data: true };
  });
}
