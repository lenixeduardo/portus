import { ipcMain } from "electron";
import { IPC, type ServiceResult } from "../../shared/ipc";
import type { Product } from "../../shared/types";
import { getCurrentUser } from "../auth/auth-service";
import { logAudit } from "../db/audit-repo";
import {
  createCentralProduct,
  deleteCentralProduct,
  listCentralProducts,
  updateCentralProduct
} from "../db/central-products-repo";
import { ensureCentralUserAccess } from "../db/central-users-repo";
import {
  createProductSchema,
  deleteProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type DeleteProductInput,
  type UpdateProductInput
} from "../validation/schemas";
import { compose, requireAuth, validateInput } from "./middleware";

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Erro ao acessar o catálogo central de produtos.";
  const databaseError = error as Error & { code?: string };
  if (databaseError.code === "23505") return "Já existe um produto com esse nome.";
  if (databaseError.code === "23503") return "Produto com histórico de lotes não pode ser excluído.";
  return error.message;
}

export function registerProductsHandlers(): void {
  // Não consulta mais SQLite: as três estações leem o mesmo catálogo central.
  ipcMain.handle(
    IPC.productsList,
    compose([requireAuth])(async (): Promise<Product[]> => listCentralProducts())
  );

  ipcMain.handle(
    IPC.productsCreate,
    compose([requireAuth, validateInput(createProductSchema)])(
      async (_e, input: CreateProductInput): Promise<ServiceResult<Product>> => {
        const user = getCurrentUser();
        if (!user) return { ok: false, error: "Sessão expirada." };
        try {
          await ensureCentralUserAccess(user);
          const product = await createCentralProduct(input.name, input.description, user.username);
          await logAudit({ actorUserId: user.id, action: "products.create", resourceType: "product", resourceId: product.id, details: { name: product.name } });
          return { ok: true, data: product };
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.productsUpdate,
    compose([requireAuth, validateInput(updateProductSchema)])(
      async (_e, input: UpdateProductInput): Promise<ServiceResult<Product>> => {
        const user = getCurrentUser();
        if (!user) return { ok: false, error: "Sessão expirada." };
        try {
          await ensureCentralUserAccess(user);
          const product = await updateCentralProduct(input.id, input.name ?? "", input.description, user.username);
          await logAudit({ actorUserId: user.id, action: "products.update", resourceType: "product", resourceId: product.id });
          return { ok: true, data: product };
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.productsDelete,
    compose([requireAuth, validateInput(deleteProductSchema)])(
      async (_e, input: DeleteProductInput): Promise<ServiceResult<true>> => {
        const user = getCurrentUser();
        if (!user) return { ok: false, error: "Sessão expirada." };
        try {
          await ensureCentralUserAccess(user);
          await deleteCentralProduct(input.id, user.username);
          await logAudit({ actorUserId: user.id, action: "products.delete", resourceType: "product", resourceId: input.id });
          return { ok: true, data: true };
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
      }
    )
  );
}
