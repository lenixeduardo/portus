import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  resolve(root, "database/migrations/012_unified_batch_traceability.sql"),
  "utf8"
);
const installer = readFileSync(
  resolve(root, "database/install-portus-database.ps1"),
  "utf8"
);
const releaseValidator = readFileSync(
  resolve(root, "scripts/validate-release-readiness.mjs"),
  "utf8"
);
const centralConnection = readFileSync(
  resolve(root, "src/main/db/central-connection.ts"),
  "utf8"
);

describe("upgrade do banco central para a migration 012", () => {
  it("não contém delimitadores PL/pgSQL inválidos que abortariam a transaction", () => {
    const openings = migration.match(/(?:AS|DO)\s+\$\$/g) ?? [];
    expect(openings).toHaveLength(5);
    expect(migration.match(/\$\$/g)).toHaveLength(openings.length * 2);
    expect(migration).not.toMatch(/(?:AS|DO)\s+\$(?!\$)/);
    expect(migration).not.toMatch(/^\s*\$;\s*$/m);
    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
  });

  it("cria o campo completed e as funções do novo fluxo", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS completed BOOLEAN");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION set_batch_completed(");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION supervisor_finalize_batch(");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION ensure_station(");
    expect(migration).toContain("REVOKE ALL ON FUNCTION set_batch_completed");
    expect(migration).toContain("REVOKE ALL ON FUNCTION supervisor_finalize_batch");
    expect(migration).toContain("REVOKE ALL ON FUNCTION ensure_station");
  });

  it("valida o schema físico após as migrations, inclusive no modo MigrationsOnly", () => {
    expect(installer).toContain("column_name = 'completed'");
    expect(installer).toContain("to_regprocedure('public.set_batch_completed");
    expect(installer).toContain('Invoke-Psql $AdminUser $adminPassword $DatabaseName @("-c", $schemaCheck)');
    expect(releaseValidator).toContain("database/migrations/011_operational_closure_rules.sql");
    expect(releaseValidator).toContain("database/migrations/012_unified_batch_traceability.sql");
  });

  it("traduz o erro 42703 em orientação explícita de atualização do servidor", () => {
    expect(centralConnection).toContain('postgresError?.code === "42703"');
    expect(centralConnection).toContain("install-portus-database.ps1 -MigrationsOnly");
  });
});
