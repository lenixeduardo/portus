import type { Product } from "../../shared/types";
import { centralQuery } from "./central-connection";

interface CentralProductRow {
  id: number | string;
  name: string;
  description: string | null;
  created_by: number | string | null;
  created_at: Date | string;
}

function toProduct(row: CentralProductRow): Product {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description ?? undefined,
    createdBy: row.created_by == null ? undefined : Number(row.created_by),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

const SELECT_PRODUCT = "SELECT id, name, description, created_by, created_at FROM products";

export async function listCentralProducts(includeInactive = false): Promise<Product[]> {
  const result = await centralQuery<CentralProductRow>(
    SELECT_PRODUCT + (includeInactive ? "" : " WHERE active") + " ORDER BY lower(name), name"
  );
  return result.rows.map(toProduct);
}

export async function getCentralProduct(id: number): Promise<Product | null> {
  const result = await centralQuery<CentralProductRow>(
    SELECT_PRODUCT + " WHERE id = $1 AND active",
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

/** Código cadastrado do produto: exatamente os 12 dígitos iniciais da etiqueta. */
export async function findCentralProductByBarcodePrefix(prefix: string): Promise<Product | null> {
  if (!/^\d{12}$/.test(prefix)) throw new Error("Prefixo do produto inválido (12 dígitos).");
  const products = await listCentralProducts();
  const matched = products.filter(product =>
    [product.description, product.name].some(value =>
      typeof value === "string" && value.replace(/\D/g, "").slice(0, 12) === prefix
    )
  );
  if (matched.length > 1) throw new Error("Código de produto duplicado no cadastro central. Solicite correção.");
  return matched[0] ?? null;
}
