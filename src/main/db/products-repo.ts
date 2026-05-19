import { all, get, run } from "./query";
import type { Product } from "../../shared/types";

interface ProductRow {
  id: number;
  name: string;
  description: string | null;
  created_by: number;
  created_at: string;
}

function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

export function listProducts(): Product[] {
  return all<ProductRow>("SELECT * FROM products ORDER BY name COLLATE NOCASE").map(rowToProduct);
}

export function getProductByName(name: string): Product | null {
  const row = get<ProductRow>("SELECT * FROM products WHERE name = ? COLLATE NOCASE", name);
  return row ? rowToProduct(row) : null;
}

export function getProduct(id: number): Product | null {
  const row = get<ProductRow>("SELECT * FROM products WHERE id = ?", id);
  return row ? rowToProduct(row) : null;
}

export function createProduct(
  name: string,
  description: string | undefined,
  createdBy: number
): Product {
  const id = run(
    "INSERT INTO products (name, description, created_by) VALUES (?, ?, ?)",
    name,
    description ?? null,
    createdBy
  );
  return getProduct(id)!;
}

export function updateProduct(
  id: number,
  name: string,
  description: string | undefined
): Product | null {
  run("UPDATE products SET name = ?, description = ? WHERE id = ?", name, description ?? null, id);
  return getProduct(id);
}

export function deleteProduct(id: number): void {
  run("DELETE FROM products WHERE id = ?", id);
}

export function countBatchesForProduct(id: number): number {
  return get<{ c: number }>("SELECT COUNT(*) AS c FROM batches WHERE product_id = ?", id)?.c ?? 0;
}
