import type { Product, User } from "../../shared/types";
import { centralQuery } from "./central-connection";
import { ensureCentralUserAccess } from "./central-users-repo";

interface CentralProductRow {
  id: number | string;
  name: string;
  description: string | null;
  created_at: Date | string;
}

interface CentralUserRow {
  id: number | string;
  username: string;
  display_name: string | null;
  role: string;
  created_at: Date | string;
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function remoteId(id: string | number): number {
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Identificador central inválido.");
  }
  // IDs negativos nunca são confundidos com chaves primárias SQLite locais.
  return -value;
}

export async function listCentralCatalogProducts(): Promise<Product[]> {
  const result = await centralQuery<CentralProductRow>(
    "SELECT id, name, description, created_at FROM products ORDER BY name"
  );
  return result.rows.map((row) => ({
    id: remoteId(row.id),
    name: row.name,
    description: row.description ?? undefined,
    createdBy: 0,
    createdAt: timestamp(row.created_at),
    centralOnly: true
  }));
}

export async function listCentralCatalogUsers(): Promise<User[]> {
  const result = await centralQuery<CentralUserRow>(
    "SELECT id, username, display_name, role, created_at FROM users WHERE active = TRUE ORDER BY display_name NULLS LAST, username"
  );
  return result.rows.map((row) => ({
    id: remoteId(row.id),
    username: row.username,
    displayName: row.display_name ?? undefined,
    role: row.role === "master" || row.role === "supervisor" || row.role === "admin"
      ? row.role : "operator",
    sectorCode: row.role === "laboratory" ? "LABORATORY" : "PRODUCTION",
    laboratoryProfile: row.role === "laboratory" ? "capture" : undefined,
    createdAt: timestamp(row.created_at),
    centralOnly: true
  }));
}

/** Publica um produto local no catálogo central antes de considerá-lo sincronizado.
 * Não altera o histórico de produtos já usados por lotes.
 */
export async function ensureCentralCatalogProduct(
  product: Pick<Product, "name" | "description">,
  user: User
): Promise<void> {
  await ensureCentralUserAccess(user);
  const sectorCode = user.sectorCode === "LABORATORY" ? "LABORATORY" : "PRODUCTION";
  const applicationCode = sectorCode === "LABORATORY" ? "PORTUS_LABORATORY" : "PORTUS";
  const result = await centralQuery<{ id: number | string }>(
    `SELECT ensure_product($1, $2, u.id, a.id, s.id) AS id
       FROM users u CROSS JOIN applications a CROSS JOIN sectors s
      WHERE u.username = $3 AND a.code = $4 AND s.code = $5
        AND u.active AND a.active AND s.active`,
    [product.name, product.description ?? null, user.username, applicationCode, sectorCode]
  );
  if (!result.rows[0]?.id) throw new Error("O servidor não confirmou o cadastro do produto.");
}
