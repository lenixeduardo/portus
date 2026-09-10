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
import { logAudit } from "../db/audit-repo";
import { processBarcodeValue } from "../barcode-logic";
import {
  closeBatch,
  codeExists,
  countOpenBatches,
  createBatch,
  findBatchByCode,
  generateBatchCode,
  getBatchByCode,
  getBatchWithProduct,
  listOpenBatches
} from "../db/batches-repo";
import { createProduct, getProduct, getProductByValue } from "../db/products-repo";
import { getSetting } from "../db/settings-repo";
import { isCentralDatabaseRequired } from "../db/central-connection";
import {
  barcodeSchema,
  closeBatchSchema,
  createBatchSchema,
  findBatchByCodeSchema,
  type CloseBatchInput,
  type CreateBatchInput
} from "../validation/schemas";
import { compose, requireAdmin, requireAuth, validateInput } from "./middleware";

const OPEN_BATCHES_SOFT_LIMIT = 6;

function centralRequired<T>(): ServiceResult<T> | null {
  return isCentralDatabaseRequired()
    ? { ok: false, error: "O PostgreSQL central é obrigatório. Configure PORTUS_DATABASE_URL ou use PORTUS_DATABASE_MODE=local somente para desenvolvimento." }
    : null;
}

export function registerBatchesHandlers(): void {
  ipcMain.handle(
    IPC.batchesListOpen,
    compose([requireAuth])((): BatchWithProduct[] => isCentralDatabaseRequired() ? [] : listOpenBatches())
  );

  ipcMain.handle(
    IPC.batchesCreate,
    compose([requireAuth, validateInput(createBatchSchema)])(
      (_e, input: CreateBatchInput): ServiceResult<BatchWithProduct> => {
        const blocked = centralRequired<BatchWithProduct>();
        if (blocked) return blocked;
        const user = getCurrentUser();
        if (!user) return { ok: false, error: "Sessão expirada." };
        if (user.sectorCode === "LABORATORY") {
          return { ok: false, error: "O Laboratório consulta lotes existentes na base central." };
        }
        if (!getProduct(input.productId)) {
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
          logAudit({ actorUserId: user.id, action: "batches.create", resourceType: "batch", resourceId: batch.id, details: { code: batch.code, productId: input.productId } });
          return { ok: true, data: batch };
        } catch {
          return { ok: false, error: "Erro ao criar lote." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.batchesFindByCode,
    compose([requireAuth, validateInput(findBatchByCodeSchema)])(
      (_e, code: string): BatchWithProduct | null => {
        return isCentralDatabaseRequired() ? null : findBatchByCode(code);
      }
    )
  );

  ipcMain.handle(
    IPC.batchesClose,
    compose([requireAuth, validateInput(closeBatchSchema)])(
      (_e, input: CloseBatchInput): ServiceResult<true> => {
        const blocked = centralRequired<true>();
        if (blocked) return blocked;
        const user = getCurrentUser();
        if (!user) return { ok: false, error: "Sessão expirada." };
        if (user.sectorCode === "LABORATORY") {
          return { ok: false, error: "O Laboratório não pode finalizar lotes no banco local." };
        }
        const batch = getBatchWithProduct(input.id);
        if (!batch) return { ok: false, error: "Lote não encontrado." };
        if (batch.status === "closed") return { ok: false, error: "Lote já está fechado." };
        closeBatch(input.id, user.id);
        logAudit({ actorUserId: user.id, action: "batches.close", resourceType: "batch", resourceId: input.id });
        return { ok: true, data: true };
      }
    )
  );

  ipcMain.handle(
    IPC.batchesScanBarcode,
    compose([requireAuth, validateInput(barcodeSchema)])(
      (_e, input: BarcodeScanInput): ServiceResult<BarcodeScanResult> => {
        const blocked = centralRequired<BarcodeScanResult>();
        if (blocked) return blocked;
        const user = getCurrentUser();
        if (!user) return { ok: false, error: "Sessão expirada." };
        if (user.sectorCode === "LABORATORY") {
          return { ok: false, error: "O Laboratório consulta lotes existentes na base central." };
        }

        const result = processBarcodeValue(input.barcodeValue, user.id, {
          barcode_regex: getSetting("barcode_regex"),
          openBatchesLimit: OPEN_BATCHES_SOFT_LIMIT,
          getBatchByCode,
          getProductByValue,
          countOpenBatches,
          codeExists,
          createBatch,
          createProduct
        }, input.productName);
        if (result.ok && result.data.created) {
          logAudit({ actorUserId: user.id, action: "batches.create_barcode", resourceType: "batch", resourceId: result.data.batch.id, details: { code: result.data.batch.code } });
        }
        return result;
      }
    )
  );
}
