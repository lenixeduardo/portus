import type { BatchWithProduct } from "../../shared/ipc";

export type BatchFilter = "ALL" | "PRODUCTION" | "LABORATORY";
export type BatchSortDirection = "ASC" | "DESC";

export interface ActiveBatchListFilters {
  sector: BatchFilter;
  productId: "ALL" | string;
  openedOn: string;
  sortDirection: BatchSortDirection;
}

export interface ProductFilterOption {
  id: string;
  name: string;
}

export function parseBatchDate(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const normalized = trimmed.includes("T") || /Z$|[+-]\d\d:\d\d$/.test(trimmed)
    ? trimmed
    : `${trimmed.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getBatchCalendarDate(value: string | Date | null | undefined): string | null {
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const parsed = parseBatchDate(value);
  if (!parsed) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function batchMatchesOpenedDate(value: string | Date | null | undefined, openedOn: string): boolean {
  if (!openedOn) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(openedOn)) return true;
  return getBatchCalendarDate(value) === openedOn;
}

export function filterAndSortActiveBatches(
  batches: BatchWithProduct[],
  filters: ActiveBatchListFilters
): BatchWithProduct[] {
  const filtered = batches.filter((batch) => {
    if (filters.sector === "PRODUCTION" && batch.productionClosed) return false;
    if (filters.sector === "LABORATORY" && batch.laboratoryClosed) return false;
    if (filters.productId !== "ALL" && String(batch.productId) !== filters.productId) return false;
    return batchMatchesOpenedDate(batch.openedAt, filters.openedOn);
  });

  return filtered.sort((a, b) => {
    const aTime = parseBatchDate(a.openedAt)?.getTime() ?? 0;
    const bTime = parseBatchDate(b.openedAt)?.getTime() ?? 0;
    const byDate = filters.sortDirection === "ASC" ? aTime - bTime : bTime - aTime;
    if (byDate !== 0) return byDate;
    return a.code.localeCompare(b.code, "pt-BR", { numeric: true, sensitivity: "base" });
  });
}

export function getProductFilterOptions(batches: BatchWithProduct[]): ProductFilterOption[] {
  const products = new Map<string, string>();

  for (const batch of batches) {
    const id = String(batch.productId);
    const name = batch.productName?.trim() || `Produto ${id}`;
    if (!products.has(id)) products.set(id, name);
  }

  return Array.from(products.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true, sensitivity: "base" }));
}
