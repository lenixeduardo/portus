import { ipcMain } from "electron";
import { IPC, type BatchInput, type BatchWithFormula, type ServiceResult } from "../../shared/ipc";
import { getCurrentUser } from "../auth/auth-service";
import {
  closeBatch,
  codeExists,
  countOpenBatches,
  createBatch,
  findBatchByCode,
  generateBatchCode,
  getBatchWithFormula,
  listOpenBatches
} from "../db/batches-repo";
import { getFormula } from "../db/formulas-repo";

const OPEN_BATCHES_SOFT_LIMIT = 6;

export function registerBatchesHandlers(): void {
  ipcMain.handle(IPC.batchesListOpen, (): BatchWithFormula[] => listOpenBatches());

  ipcMain.handle(IPC.batchesCreate, (_e, input: BatchInput): ServiceResult<BatchWithFormula> => {
    const user = getCurrentUser();
    if (!user) return { ok: false, error: "Sessão expirada." };
    if (!input?.formulaId || !getFormula(input.formulaId)) {
      return { ok: false, error: "Fórmula inválida." };
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
      const batch = createBatch(input.formulaId, code, user.id);
      return { ok: true, data: batch };
    } catch {
      return { ok: false, error: "Erro ao criar lote." };
    }
  });

  ipcMain.handle(IPC.batchesFindByCode, (_e, code: string): BatchWithFormula | null => {
    if (!getCurrentUser()) return null;
    return findBatchByCode(code);
  });

  ipcMain.handle(IPC.batchesClose, (_e, id: number): ServiceResult<true> => {
    if (!getCurrentUser()) return { ok: false, error: "Sessão expirada." };
    const batch = getBatchWithFormula(id);
    if (!batch) return { ok: false, error: "Lote não encontrado." };
    if (batch.status === "closed") return { ok: false, error: "Lote já está fechado." };
    closeBatch(id);
    return { ok: true, data: true };
  });
}
