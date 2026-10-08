import type { Product } from "../../shared/types";
import { centralQuery } from "./central-connection";

interface CentralProductRow {
  id: number | string;
  name: string;
  description: string | null;
  created_by: number | string;
  created_at: Date | string;
}

function toProduct(row: CentralProductRow): Product {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description ?? undefined,
    createdBy: Number(row.created_by),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

const SELECT_PRODUCT = "SELECT id, name, description, created_by, created_at FROM products";

export async function listCentralProducts(): Promise<Product[]> {
  const result = await centralQuery<CentralProductRow>(
    SELECT_PRODUCT + " ORDER BY lower(name), name"
  );
  return result.rows.map(toProduct);
}

export async function getCentralProduct(id: number): Promise<Product | null> {
  const result = await centralQuery<CentralProductRow>(
    SELECT_PRODUCT + " WHERE id = $1",
    [id]
  );
  return result.rows[0] ? toProduct(result.rows[0]) : null;
}

export async function createCentralProduct(
  name: string,
  description: string | undefined,
  username: string
): Promise<Product> {
  return saveCentralProduct(null, name, description, username);
}

export async function updateCentralProduct(
  id: number,
  name: string,
  description: string | undefined,
  username: string
): Promise<Product> {
  return saveCentralProduct(id, name, description, username);
}

async function saveCentralProduct(
  id: number | null,
  name: string,
  description: string | undefined,
  username: string
): Promise<Product> {
  const saved = await centralQuery<{ id: number | string }>(
    "SELECT portus_save_product($1, $2, $3, $4) AS id",
    [id, name.trim(), description?.trim() ?? null, username]
  );
  const productId = Number(saved.rows[0]?.id);
  const product = await getCentralProduct(productId);
  if (!product) throw new Error("Produto não encontrado após salvar no PostgreSQL central.");
  return product;
}

export async function deleteCentralProduct(id: number, username: string): Promise<void> {
  await centralQuery("SELECT portus_delete_product($1, $2)", [id, username]);
}
