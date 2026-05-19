import { all, get, run } from "./query";
import type { Formula } from "../../shared/types";

interface FormulaRow {
  id: number;
  name: string;
  description: string | null;
  created_by: number;
  created_at: string;
}

function rowToFormula(row: FormulaRow): Formula {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

export function listFormulas(): Formula[] {
  return all<FormulaRow>("SELECT * FROM formulas ORDER BY name COLLATE NOCASE").map(rowToFormula);
}

export function getFormulaByName(name: string): Formula | null {
  const row = get<FormulaRow>("SELECT * FROM formulas WHERE name = ? COLLATE NOCASE", name);
  return row ? rowToFormula(row) : null;
}

export function getFormula(id: number): Formula | null {
  const row = get<FormulaRow>("SELECT * FROM formulas WHERE id = ?", id);
  return row ? rowToFormula(row) : null;
}

export function createFormula(
  name: string,
  description: string | undefined,
  createdBy: number
): Formula {
  const id = run(
    "INSERT INTO formulas (name, description, created_by) VALUES (?, ?, ?)",
    name,
    description ?? null,
    createdBy
  );
  return getFormula(id)!;
}

export function updateFormula(
  id: number,
  name: string,
  description: string | undefined
): Formula | null {
  run("UPDATE formulas SET name = ?, description = ? WHERE id = ?", name, description ?? null, id);
  return getFormula(id);
}

export function deleteFormula(id: number): void {
  run("DELETE FROM formulas WHERE id = ?", id);
}

export function countBatchesForFormula(id: number): number {
  return get<{ c: number }>("SELECT COUNT(*) AS c FROM batches WHERE formula_id = ?", id)?.c ?? 0;
}
