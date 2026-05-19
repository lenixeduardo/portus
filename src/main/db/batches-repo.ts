import { all, get, run } from "./query";
import type { Batch } from "../../shared/types";
import type { BatchWithFormula } from "../../shared/ipc";

interface BatchRow {
  id: number;
  formula_id: number;
  code: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  created_by: number;
}

interface BatchJoinRow extends BatchRow {
  formula_name: string;
  operator_name: string;
  readings_count: number;
}

function rowToBatch(row: BatchRow): Batch {
  return {
    id: row.id,
    formulaId: row.formula_id,
    code: row.code,
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? undefined,
    createdBy: row.created_by
  };
}

function rowToBatchWithFormula(row: BatchJoinRow): BatchWithFormula {
  return {
    ...rowToBatch(row),
    formulaName: row.formula_name,
    operatorName: row.operator_name,
    readingsCount: row.readings_count
  };
}

const JOIN_SELECT = `
  SELECT b.*,
         f.name AS formula_name,
         u.username AS operator_name,
         (SELECT COUNT(*) FROM readings rd WHERE rd.batch_id = b.id) AS readings_count
    FROM batches b
    JOIN formulas f ON f.id = b.formula_id
    JOIN users u ON u.id = b.created_by
`;

export function listOpenBatches(): BatchWithFormula[] {
  return all<BatchJoinRow>(`${JOIN_SELECT} WHERE b.status = 'open' ORDER BY b.opened_at DESC`).map(
    rowToBatchWithFormula
  );
}

export function listAllBatches(): BatchWithFormula[] {
  return all<BatchJoinRow>(`${JOIN_SELECT} ORDER BY b.opened_at DESC`).map(rowToBatchWithFormula);
}

export function getBatchWithFormula(id: number): BatchWithFormula | null {
  const row = get<BatchJoinRow>(`${JOIN_SELECT} WHERE b.id = ?`, id);
  return row ? rowToBatchWithFormula(row) : null;
}

export function countOpenBatches(): number {
  return get<{ c: number }>("SELECT COUNT(*) AS c FROM batches WHERE status = 'open'")?.c ?? 0;
}

export function codeExists(code: string): boolean {
  return get("SELECT 1 AS x FROM batches WHERE code = ?", code) != null;
}

export function createBatch(formulaId: number, code: string, createdBy: number): BatchWithFormula {
  const id = run("INSERT INTO batches (formula_id, code, created_by) VALUES (?, ?, ?)", formulaId, code, createdBy);
  return getBatchWithFormula(id)!;
}

export function closeBatch(id: number): void {
  run(
    "UPDATE batches SET status = 'closed', closed_at = datetime('now') WHERE id = ? AND status = 'open'",
    id
  );
}

export function getBatchByCode(code: string): BatchWithFormula | null {
  const row = get<BatchJoinRow>(`${JOIN_SELECT} WHERE b.code = ?`, code);
  return row ? rowToBatchWithFormula(row) : null;
}

export function generateBatchCode(): string {
  const year = new Date().getFullYear();
  const c = get<{ c: number }>("SELECT COUNT(*) AS c FROM batches WHERE code LIKE ?", `${year}-%`)?.c ?? 0;
  const seq = String(c + 1).padStart(4, "0");
  return `${year}-${seq}`;
}
