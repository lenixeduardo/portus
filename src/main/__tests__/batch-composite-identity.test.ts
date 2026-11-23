import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("identidade composta dos lotes (produto + código)", () => {
  it("substitui a unicidade global pela chave composta sem apagar lotes", () => {
    const sql = source("database/migrations/026_batch_product_composite_identity.sql");
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS batches_code_key");
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ux_batches_product_code\s+ON public\.batches \(product_id, code\)/);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+batches\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("busca por código e produto, recusando resultado ambíguo sem produto", () => {
    const repo = source("src/main/db/central-batches-repo.ts");
    expect(repo).toContain("WHERE b.code = $1 AND b.product_id = $2");
    expect(repo).toContain("LIMIT 2");
    expect(repo).toContain("result.rows.length > 1");
    expect(repo).toContain('code === "23505"');
  });

  it("valida a identidade na leitura da etiqueta completa", () => {
    const modal = source("src/renderer/components/BarcodeModal.tsx");
    const handlers = source("src/main/ipc/batches-handlers.ts");
    expect(modal).toContain("findByCode(code, matches[0].id)");
    expect(modal).toContain("findByCode(code, productId)");
    expect(handlers).toContain("getUserOperationalSector(user), product.id");
  });
});
