import { ipcMain } from "electron";
import {
  IPC,
  type BarcodeScanInput,
  type BarcodeScanResult,
  type BatchInput,
  type BatchWithProduct,
  type ServiceResult
} from "../../shared/ipc";
import { getCurrentUser } from "../auth/auth-service";
import { processBarcodeValue } from "../barcode-logic";
import {
  closeBatch,
  codeExists,
  countOpenBatches,
  createBatch,
  generateBatchCode,
  getBatchByCode,
  getBatchWithProduct,
  listOpenBatches
} from "../db/batches-repo";
import { getProduct, getProductByName } from "../db/products-repo";
import { getSetting } from "../db/settings-repo";

const OPEN_BATCHES_SOFT_LIMIT = 6;

export function registerBatchesHandlers(): void {
  ipcMain.handle(IPC.batchesListOpen, (): BatchWithProduct[] => listOpenBatches());

  ipcMain.handle(IPC.batchesCreate, (_e, input: BatchInput): ServiceResult<BatchWithProduct> => {
    const user = getCurrentUser();
    if (!user) return { ok: false, error: "Sessão expirada." };
    if (!input?.productId || !getProduct(input.productId)) {
      return { ok: false, error: "Produto inválido." };
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
      const batch = createBatch(input.productId, code, user.id);
      return { ok: true, data: batch };
    } catch {
      return { ok: false, error: "Erro ao criar lote." };
    }
  });

  ipcMain.handle(IPC.batchesClose, (_e, id: number): ServiceResult<true> => {
    if (!getCurrentUser()) return { ok: false, error: "Sessão expirada." };
    const batch = getBatchWithProduct(id);
    if (!batch) return { ok: false, error: "Lote não encontrado." };
    if (batch.status === "closed") return { ok: false, error: "Lote já está fechado." };
    closeBatch(id);
    return { ok: true, data: true };
  });

  ipcMain.handle(
    IPC.batchesScanBarcode,
    (_e, input: BarcodeScanInput): ServiceResult<BarcodeScanResult> => {
      const user = getCurrentUser();
      if (!user) return { ok: false, error: "Sessão expirada." };

      return processBarcodeValue(input?.barcodeValue ?? "", user.id, {
        barcode_regex: getSetting("barcode_regex"),
        openBatchesLimit: OPEN_BATCHES_SOFT_LIMIT,
        getBatchByCode,
        getProductByName,
        countOpenBatches,
        codeExists,
        createBatch
      });
    }
  );
}
