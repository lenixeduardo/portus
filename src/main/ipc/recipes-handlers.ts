import { ipcMain } from "electron";
import { IPC, type RecipeInput, type ServiceResult } from "../../shared/ipc";
import type { Recipe } from "../../shared/types";
import { getCurrentUser } from "../auth/auth-service";
import {
  countBatchesForRecipe,
  createRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
  updateRecipe
} from "../db/recipes-repo";

function requireAuth(): number | null {
  const u = getCurrentUser();
  return u ? u.id : null;
}

function validateName(name: string): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "Informe um nome para a receita.";
  if (trimmed.length > 120) return "Nome muito longo (máx. 120 caracteres).";
  return null;
}

export function registerRecipesHandlers(): void {
  ipcMain.handle(IPC.recipesList, (): Recipe[] => listRecipes());

  ipcMain.handle(IPC.recipesCreate, (_e, input: RecipeInput): ServiceResult<Recipe> => {
    const userId = requireAuth();
    if (!userId) return { ok: false, error: "Sessão expirada." };
    const err = validateName(input.name);
    if (err) return { ok: false, error: err };
    try {
      const recipe = createRecipe(input.name.trim(), input.description?.trim() || undefined, userId);
      return { ok: true, data: recipe };
    } catch (e: any) {
      if (String(e?.message).includes("UNIQUE")) {
        return { ok: false, error: "Já existe uma receita com esse nome." };
      }
      return { ok: false, error: "Erro ao criar receita." };
    }
  });

  ipcMain.handle(
    IPC.recipesUpdate,
    (_e, id: number, input: RecipeInput): ServiceResult<Recipe> => {
      if (!requireAuth()) return { ok: false, error: "Sessão expirada." };
      if (!getRecipe(id)) return { ok: false, error: "Receita não encontrada." };
      const err = validateName(input.name);
      if (err) return { ok: false, error: err };
      try {
        const recipe = updateRecipe(id, input.name.trim(), input.description?.trim() || undefined);
        return { ok: true, data: recipe! };
      } catch (e: any) {
        if (String(e?.message).includes("UNIQUE")) {
          return { ok: false, error: "Já existe uma receita com esse nome." };
        }
        return { ok: false, error: "Erro ao atualizar receita." };
      }
    }
  );

  ipcMain.handle(IPC.recipesDelete, (_e, id: number): ServiceResult<true> => {
    if (!requireAuth()) return { ok: false, error: "Sessão expirada." };
    if (countBatchesForRecipe(id) > 0) {
      return { ok: false, error: "Receita possui lotes vinculados e não pode ser excluída." };
    }
    deleteRecipe(id);
    return { ok: true, data: true };
  });
}
