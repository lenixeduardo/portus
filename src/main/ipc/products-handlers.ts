import { ipcMain } from "electron";
import { IPC, type ProductInput, type ServiceResult } from "../../shared/ipc";
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

function requireAuth(): number | null {
  const u = getCurrentUser();
  return u ? u.id : null;
}

function validateName(name: string): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "Informe um nome para o produto.";
  if (trimmed.length > 120) return "Nome muito longo (máx. 120 caracteres).";
  return null;
}

export function registerProductsHandlers(): void {
  ipcMain.handle(IPC.productsList, (): Product[] => listProducts());

  ipcMain.handle(IPC.productsCreate, (_e, input: ProductInput): ServiceResult<Product> => {
    const userId = requireAuth();
    if (!userId) return { ok: false, error: "Sessão expirada." };
    const err = validateName(input.name);
    if (err) return { ok: false, error: err };
    try {
      const product = createProduct(input.name.trim(), input.description?.trim() || undefined, userId);
      return { ok: true, data: product };
    } catch (e: any) {
      if (String(e?.message).includes("UNIQUE")) {
        return { ok: false, error: "Já existe um produto com esse nome." };
      }
      return { ok: false, error: "Erro ao criar produto." };
    }
  });

  ipcMain.handle(
    IPC.productsUpdate,
    (_e, id: number, input: ProductInput): ServiceResult<Product> => {
      if (!requireAuth()) return { ok: false, error: "Sessão expirada." };
      if (!getProduct(id)) return { ok: false, error: "Produto não encontrado." };
      const err = validateName(input.name);
      if (err) return { ok: false, error: err };
      try {
        const product = updateProduct(id, input.name.trim(), input.description?.trim() || undefined);
        return { ok: true, data: product! };
      } catch (e: any) {
        if (String(e?.message).includes("UNIQUE")) {
          return { ok: false, error: "Já existe um produto com esse nome." };
        }
        return { ok: false, error: "Erro ao atualizar produto." };
      }
    }
  );

  ipcMain.handle(IPC.productsDelete, (_e, id: number): ServiceResult<true> => {
    if (!requireAuth()) return { ok: false, error: "Sessão expirada." };
    if (countOpenBatchesForProduct(id) > 0) {
      return { ok: false, error: "Produto possui lotes abertos e não pode ser excluído." };
    }
    deleteProduct(id);
    return { ok: true, data: true };
  });
}
