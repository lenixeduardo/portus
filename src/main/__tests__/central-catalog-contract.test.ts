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
  const importer = read("scripts/import-legacy-to-postgres.mjs");
  const auth = read("src/main/auth/auth-service.ts");
  const stationMigration = read("database/migrations/014_station_profiles_audit_ledger.sql");
  const release = read("scripts/check-postgres-only-runtime.mjs");
  const start = read("src/main/index.ts");

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

  it("todos os usuários aparecem e são gerenciados pelo PostgreSQL", () => {
    expect(userHandlers).toContain("listCentralUsers()");
    expect(centralUsers).toContain("FROM users WHERE active");
    expect(userHandlers).toContain("await createCentralUser(");
    expect(userHandlers).toContain("await updateCentralUserPassword(");
    expect(userHandlers).toContain("await deactivateCentralUser(");
    expect(auth).toContain("await centralQuery<CentralCredentialRow>");
    expect(auth).not.toContain('from "../db/users-repo"');
  });

  it("importa todas as entidades com rollback, ledger e conciliação", () => {
    for (const entity of ["users","products","equipments","batches","capture_sessions",
                          "readings","audit_log","capture_error_logs"]) {
      expect(importer).toContain('transfer("'+entity+'"');
    }
    expect(importer).toContain('await pgClient.query("BEGIN")');
    expect(importer).toContain('await pgClient.query("COMMIT")');
    expect(importer).toContain('await pgClient.query("ROLLBACK")');
    expect(importer).toContain("source_hash");
    expect(importer).toContain("originalCounts");
  });

  it("desliga SQLite do Electron e configura estações e auditoria no PostgreSQL", () => {
    expect(start).not.toContain("openDb()");
    expect(start).not.toContain("runMigrations()");
    expect(start).not.toContain("seedInitialData()");
    expect(stationMigration).toContain("CREATE TABLE IF NOT EXISTS portus_station_settings");
    expect(stationMigration).toContain("CREATE TABLE IF NOT EXISTS portus_audit_log");
    expect(release).toContain("runtime ainda depende de SQLite");
  });

});
