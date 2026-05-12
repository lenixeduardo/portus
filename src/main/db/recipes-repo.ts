import { getDb } from "../db/connection";
import type { Recipe } from "../../shared/types";

interface RecipeRow {
  id: number;
  name: string;
  description: string | null;
  created_by: number;
  created_at: string;
}

function rowToRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

export function listRecipes(): Recipe[] {
  const rows = getDb()
    .prepare("SELECT * FROM recipes ORDER BY name COLLATE NOCASE")
    .all() as RecipeRow[];
  return rows.map(rowToRecipe);
}

export function getRecipe(id: number): Recipe | null {
  const row = getDb()
    .prepare("SELECT * FROM recipes WHERE id = ?")
    .get(id) as RecipeRow | undefined;
  return row ? rowToRecipe(row) : null;
}

export function createRecipe(
  name: string,
  description: string | undefined,
  createdBy: number
): Recipe {
  const info = getDb()
    .prepare("INSERT INTO recipes (name, description, created_by) VALUES (?, ?, ?)")
    .run(name, description ?? null, createdBy);
  return getRecipe(Number(info.lastInsertRowid))!;
}

export function updateRecipe(id: number, name: string, description: string | undefined): Recipe | null {
  getDb()
    .prepare("UPDATE recipes SET name = ?, description = ? WHERE id = ?")
    .run(name, description ?? null, id);
  return getRecipe(id);
}

export function deleteRecipe(id: number): void {
  getDb().prepare("DELETE FROM recipes WHERE id = ?").run(id);
}

export function countBatchesForRecipe(id: number): number {
  const r = getDb()
    .prepare("SELECT COUNT(*) AS c FROM batches WHERE recipe_id = ?")
    .get(id) as { c: number };
  return r.c;
}
