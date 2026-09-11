import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createUserSchema } from "../validation/schemas";

describe("reabertura administrativa de lote", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "database/migrations/010_admin_reopen_batch.sql"),
    "utf8"
  );

  it("aceita os perfis master e admin no cadastro local", () => {
    const master = createUserSchema.parse({
      username: "master.qa",
      password: "senha-segura-123",
      role: "master",
      sectorCode: "PRODUCTION"
    });
    const admin = createUserSchema.parse({
      username: "admin.qa",
      password: "senha-segura-123",
      role: "admin",
      sectorCode: "PRODUCTION"
    });

    expect(master.role).toBe("master");
    expect(admin.role).toBe("admin");
  });

  it("restringe a função central a perfis administrativos", () => {
    expect(migration).toContain("v_role NOT IN ('master', 'admin')");
    expect(migration).toContain("ERRCODE = '42501'");
  });

  it("reinicia as duas confirmações sem excluir leituras", () => {
    expect(migration).toContain("production_closed = FALSE");
    expect(migration).toContain("laboratory_closed = FALSE");
    expect(migration).toContain("status = 'open'");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+(readings|capture_sessions)/i);
  });

  it("normaliza e registra a reabertura para iniciar um novo ciclo de leituras", () => {
    expect(migration).toContain("BATCH_REOPENED_BY_MASTER");
    expect(migration).toContain("BATCH_REOPENED");
    expect(migration).toContain("version = version + 1");
  });
});
