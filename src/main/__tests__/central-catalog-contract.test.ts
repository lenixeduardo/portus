import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("catálogo compartilhado entre servidor, produção e laboratório", () => {
  const migration = read("database/migrations/013_central_catalog_user_metadata.sql");
  const productHandlers = read("src/main/ipc/products-handlers.ts");
  const centralProducts = read("src/main/db/central-products-repo.ts");
  const centralHandlers = read("src/main/ipc/central-handlers.ts");
  const userHandlers = read("src/main/ipc/users-handlers.ts");
  const centralUsers = read("src/main/db/central-users-repo.ts");
  const importer = read("src/main/db/import-legacy-catalog.ts");
  const start = read("src/main/index.ts");
  const usersUI = read("src/renderer/screens/settings/UsersTab.tsx");

  it("migra o catálogo e a identificação dos usuários sem remover dados existentes", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS sector_code");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS barcode_value");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION portus_save_product(");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION portus_delete_product(");
    expect(migration).toContain("REVOKE ALL ON FUNCTION portus_save_product");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+(users|batches|readings|capture_sessions)/i);
    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect((migration.match(/\$\$/g) ?? []).length).toBe(6);
  });

  it("opera criação, alteração, exclusão e listagem de produtos via PostgreSQL", () => {
    expect(productHandlers).toContain("listCentralProducts()");
    expect(productHandlers).toContain("createCentralProduct(");
    expect(productHandlers).toContain("updateCentralProduct(");
    expect(productHandlers).toContain("deleteCentralProduct(");
    expect(productHandlers).not.toMatch(/(?:createProduct|updateProduct|deleteProduct|listProducts)\(/);
    expect(centralProducts).toContain("portus_save_product");
    expect(centralProducts).toContain("portus_delete_product");
  });

  it("utiliza ID central do produto também ao abrir lotes", () => {
    expect(centralHandlers).toContain("await getCentralProduct(input.productId)");
    expect(centralHandlers).not.toContain("const product = getProduct(input.productId)");
  });

  it("todos os usuários aparecem na listagem central e uma estação não edita IDs remotos locais", () => {
    expect(userHandlers).toContain("await listCentralUsers()");
    expect(centralUsers).toContain("FROM users WHERE active");
    expect(userHandlers).toContain("await ensureCentralUserAccess(user, {");
    expect(usersUI).toContain("Cadastrado em outra estação");
  });

  it("importa cadastros legados antes da interface e não indica sucesso prematuro", () => {
    expect(start).toContain("await importLegacyCatalogToCentral()");
    expect(importer).toContain("for (const user of users)");
    expect(importer).toContain("for (const product of listProducts())");
    expect(importer).toContain('setSetting(LEGACY_IMPORT_MARKER, "done")');
    expect(userHandlers).toContain("PostgreSQL central obrigatório para cadastrar usuários.");
  });
});
