import { all, get, run } from "./query";
import type { Batch } from "../../shared/types";
import type { BatchWithProduct } from "../../shared/ipc";

interface BatchRow {
  id: number;
  product_id: number;
  code: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  created_by: number;
}

interface BatchJoinRow extends BatchRow {
  product_name: string | null;
  operator_name: string;
  readings_count: number;
}

function rowToBatch(row: BatchRow): Batch {
  return {
    id: row.id,
    productId: row.product_id,
    code: row.code,
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? undefined,
    createdBy: row.created_by
  };
}

function rowToBatchWithProduct(row: BatchJoinRow): BatchWithProduct {
  return {
    ...rowToBatch(row),
    productName: row.product_name ?? "—",
    operatorName: row.operator_name,
    readingsCount: row.readings_count
  };
}

const JOIN_SELECT = `
  SELECT b.*,
         p.name AS product_name,
         u.username AS operator_name,
         (SELECT COUNT(*) FROM readings rd WHERE rd.batch_id = b.id) AS readings_count
    FROM batches b
    LEFT JOIN products p ON p.id = b.product_id
    JOIN users u ON u.id = b.created_by
`;

export function listOpenBatches(): BatchWithProduct[] {
  return all<BatchJoinRow>(`${JOIN_SELECT} WHERE b.status = 'open' ORDER BY b.opened_at DESC`).map(
    rowToBatchWithProduct
  );
}

export function listAllBatches(): BatchWithProduct[] {
  return all<BatchJoinRow>(`${JOIN_SELECT} ORDER BY b.opened_at DESC`).map(rowToBatchWithProduct);
}

export function getBatchWithProduct(id: number): BatchWithProduct | null {
  const row = get<BatchJoinRow>(`${JOIN_SELECT} WHERE b.id = ?`, id);
  return row ? rowToBatchWithProduct(row) : null;
}

export function countOpenBatches(): number {
  return get<{ c: number }>("SELECT COUNT(*) AS c FROM batches WHERE status = 'open'")?.c ?? 0;
}

export function codeExists(code: string): boolean {
  return get("SELECT 1 AS x FROM batches WHERE code = ?", code) != null;
}

export function createBatch(productId: number, code: string, createdBy: number): BatchWithProduct {
  const id = run("INSERT INTO batches (product_id, code, created_by) VALUES (?, ?, ?)", productId, code, createdBy);
  return getBatchWithProduct(id)!;
}

export function closeBatch(id: number): void {
  run(
    "UPDATE batches SET status = 'closed', closed_at = datetime('now') WHERE id = ? AND status = 'open'",
    id
  );
}

export function findBatchByCode(code: string): BatchWithProduct | null {
  const row = get<BatchJoinRow>(`${JOIN_SELECT} WHERE b.code = ?`, code.trim());
  return row ? rowToBatchWithProduct(row) : null;
}

export const getBatchByCode = findBatchByCode;

export function listClosedUnexportedBatches(): BatchWithProduct[] {
  return all<BatchJoinRow>(
    `${JOIN_SELECT} WHERE b.status = 'closed' AND b.auto_exported_at IS NULL ORDER BY b.closed_at ASC`
  ).map(rowToBatchWithProduct);
}

export function markBatchAutoExported(id: number): void {
  run("UPDATE batches SET auto_exported_at = datetime('now') WHERE id = ?", id);
}

export function generateBatchCode(): string {
  const year = new Date().getFullYear();
  const c = get<{ c: number }>("SELECT COUNT(*) AS c FROM batches WHERE code LIKE ?", `${year}-%`)?.c ?? 0;
  const seq = String(c + 1).padStart(4, "0");
  return `${year}-${seq}`;
}
