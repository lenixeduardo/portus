import { ipcMain } from "electron";
import { IPC, type ServiceResult } from "../../shared/ipc";
import type { Product } from "../../shared/types";
import { getCurrentUser } from "../auth/auth-service";
import {
  countOpenBatchesForProduct,
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct
} from "../db/products-repo";
import {
  createProductSchema,
  deleteProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type DeleteProductInput,
  type UpdateProductInput
} from "../validation/schemas";
import { compose, requireAuth, validateInput } from "./middleware";

export function registerProductsHandlers(): void {
  ipcMain.handle(IPC.productsList, (): Product[] => listProducts());

  ipcMain.handle(
    IPC.productsCreate,
    compose([requireAuth, validateInput(createProductSchema)])(
      (_e, input: CreateProductInput): ServiceResult<Product> => {
        const user = getCurrentUser();
        if (!user) return { ok: false, error: "Sessão expirada." };
        try {
          const product = createProduct(input.name.trim(), input.description?.trim() || undefined, user.id);
          return { ok: true, data: product };
        } catch (e: any) {
          if (String(e?.message).includes("UNIQUE")) {
            return { ok: false, error: "Já existe um produto com esse nome." };
          }
          return { ok: false, error: "Erro ao criar produto." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.productsUpdate,
    compose([requireAuth, validateInput(updateProductSchema)])(
      (_e, input: UpdateProductInput): ServiceResult<Product> => {
        if (!getProduct(input.id)) return { ok: false, error: "Produto não encontrado." };
        try {
          const product = updateProduct(
            input.id,
            input.name?.trim() || "",
            input.description?.trim() || undefined
          );
          return { ok: true, data: product! };
        } catch (e: any) {
          if (String(e?.message).includes("UNIQUE")) {
            return { ok: false, error: "Já existe um produto com esse nome." };
          }
          return { ok: false, error: "Erro ao atualizar produto." };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.productsDelete,
    compose([requireAuth, validateInput(deleteProductSchema)])(
      (_e, input: DeleteProductInput): ServiceResult<true> => {
        if (countOpenBatchesForProduct(input.id) > 0) {
          return { ok: false, error: "Produto possui lotes abertos e não pode ser excluído." };
        }
        deleteProduct(input.id);
        return { ok: true, data: true };
      }
    )
  );
}
