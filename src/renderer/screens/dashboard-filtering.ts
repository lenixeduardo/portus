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

export function batchMatchesOpenedDate(value: string | Date | null | undefined, openedOn: string): boolean {
  if (!openedOn) return true;
  const parsed = parseBatchDate(value);
  if (!parsed) return false;

  const [year, month, day] = openedOn.split("-").map(Number);
  if (!year || !month || !day) return true;

  return parsed.getFullYear() === year
    && parsed.getMonth() + 1 === month
    && parsed.getDate() === day;
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
