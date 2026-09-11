import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createUserSchema } from "../validation/schemas";

describe("reabertura de lote pelo Master", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "database/migrations/008_master_reopen_batch.sql"),
    "utf8"
  );

  it("aceita o perfil master no cadastro local", () => {
    const parsed = createUserSchema.parse({
      username: "master.qa",
      password: "senha-segura-123",
      role: "master",
      sectorCode: "PRODUCTION"
    });
    expect(parsed.role).toBe("master");
  });

  it("restringe a função central ao papel master", () => {
    expect(migration).toContain("v_role IS DISTINCT FROM 'master'");
    expect(migration).toContain("ERRCODE = '42501'");
  });

  it("reinicia as duas confirmações sem excluir leituras", () => {
    expect(migration).toContain("production_closed = FALSE");
    expect(migration).toContain("laboratory_closed = FALSE");
    expect(migration).toContain("status = 'open'");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+(readings|capture_sessions)/i);
  });

  it("registra a reabertura na auditoria do lote", () => {
    expect(migration).toContain("BATCH_REOPENED_BY_MASTER");
    expect(migration).toContain("version = version + 1");
  });
});
