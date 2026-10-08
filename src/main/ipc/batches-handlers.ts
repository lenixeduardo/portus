import { randomUUID } from "node:crypto";
import { ipcMain } from "electron";
import {
  IPC, type BarcodeScanInput, type BarcodeScanResult,
  type BatchWithProduct, type ServiceResult
} from "../../shared/ipc";
import { getCurrentUser } from "../auth/auth-service";
import { logAudit } from "../db/audit-repo";
import {
  finalizeCentralBatch, findCentralBatchByCode,
  listCentralOpenBatches, openCentralBatch
} from "../db/central-batches-repo";
import { createCentralProduct, getCentralProduct, listCentralProducts } from "../db/central-products-repo";
import { getCentralStationSetting } from "../db/central-station-settings-repo";
import {
  barcodeSchema, closeBatchSchema, createBatchSchema,
  findBatchByCodeSchema, type CloseBatchInput, type CreateBatchInput
} from "../validation/schemas";
import { compose, requireAuth, validateInput } from "./middleware";

function current() {
  const user = getCurrentUser();
  if (!user) throw new Error("Sessão expirada.");
  return user;
}
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Falha no PostgreSQL central.";
}

export function registerBatchesHandlers(): void {
  ipcMain.handle(
    IPC.batchesListOpen,
    compose([requireAuth])(async (): Promise<BatchWithProduct[]> => {
      const user = current();
      return listCentralOpenBatches(user.username, user.sectorCode ?? "PRODUCTION");
    })
  );

  ipcMain.handle(
    IPC.batchesFindByCode,
    compose([requireAuth, validateInput(findBatchByCodeSchema)])(
      async (_e, code: string): Promise<BatchWithProduct | null> => {
        const user = current();
        return findCentralBatchByCode(code, user.username, user.sectorCode ?? "PRODUCTION");
      }
    )
  );

  ipcMain.handle(
    IPC.batchesCreate,
    compose([requireAuth, validateInput(createBatchSchema)])(
      async (_e, input: CreateBatchInput): Promise<ServiceResult<BatchWithProduct>> => {
        const user = current();
        if (user.role === "supervisor") {
          return { ok: false, error: "Supervisor não abre lotes operacionais." };
        }
        try {
          const product = await getCentralProduct(input.productId);
          if (!product) return { ok: false, error: "Produto não encontrado no PostgreSQL." };
          const code = input.code?.trim() || "CENTRAL-" + randomUUID().slice(0, 12);
          const batch = await openCentralBatch(
            product.name, product.description, code,
            user.username, user.sectorCode ?? "PRODUCTION"
          );
          await logAudit({
            actorUserId: user.id, action: "batches.create",
            resourceType: "batch", resourceId: batch.id
          });
          return { ok: true, data: batch };
        } catch (error) {
          return { ok: false, error: errorText(error) };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.batchesClose,
    compose([requireAuth, validateInput(closeBatchSchema)])(
      async (_e, input: CloseBatchInput): Promise<ServiceResult<true>> => {
        const user = current();
        if (user.role !== "master" && user.role !== "supervisor") {
          return { ok: false, error: "Somente Supervisor ou Master podem finalizar lotes." };
        }
        try {
          await finalizeCentralBatch(input.id, user.username, user.sectorCode ?? "PRODUCTION");
          await logAudit({
            actorUserId: user.id, action: "batches.close",
            resourceType: "batch", resourceId: input.id
          });
          return { ok: true, data: true };
        } catch (error) {
          return { ok: false, error: errorText(error) };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.batchesScanBarcode,
    compose([requireAuth, validateInput(barcodeSchema)])(
      async (_e, input: BarcodeScanInput): Promise<ServiceResult<BarcodeScanResult>> => {
        const user = current();
        if (user.role === "supervisor") {
          return { ok: false, error: "Supervisor não inicia lotes." };
        }
        try {
          const already = await findCentralBatchByCode(
            input.barcodeValue.trim(), user.username, user.sectorCode ?? "PRODUCTION"
          );
          if (already) return { ok: true, data: { batch: already, created: false } };
          const pattern = await getCentralStationSetting("barcode_regex");
          const regex = new RegExp(pattern || "^(?<product>.+)-(?<batch_code>[^-]+)$");
          const match = input.barcodeValue.trim().match(regex);
          if (!match) return { ok: false, error: "Etiqueta não corresponde ao formato definido no PostgreSQL." };
          const value = match.groups?.product?.trim() ?? "";
          const code = match.groups?.batch_code?.trim() ?? "";
          if (!value || !code) return { ok: false, error: "Etiqueta sem produto ou lote." };
          const products = await listCentralProducts();
          let product = products.find(p => p.description === value || p.name === value);
          if (!product && input.productName?.trim()) {
            product = await createCentralProduct(input.productName, value, user.username);
          }
          if (!product) return { ok: false, error: "Produto não cadastrado no catálogo central." };
          const batch = await openCentralBatch(
            product.name, product.description, code,
            user.username, user.sectorCode ?? "PRODUCTION"
          );
          await logAudit({
            actorUserId: user.id, action: "batches.create_barcode",
            resourceType: "batch", resourceId: batch.id
          });
          return { ok: true, data: { batch, created: true } };
        } catch (error) {
          return { ok: false, error: errorText(error) };
        }
      }
    )
  );
}
