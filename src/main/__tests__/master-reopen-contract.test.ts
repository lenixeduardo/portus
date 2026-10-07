import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createUserSchema } from "../validation/schemas";

describe("reabertura supervisionada de lote", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "database/migrations/012_unified_batch_traceability.sql"),
    "utf8"
  );

  it("aceita os perfis supervisor e master no cadastro local", () => {
    const supervisor = createUserSchema.parse({
      username: "supervisor.qa",
      password: "senha-segura-123",
      role: "supervisor",
      sectorCode: "PRODUCTION"
    });
    const master = createUserSchema.parse({
      username: "master.qa",
      password: "senha-segura-123",
      role: "master",
      sectorCode: "PRODUCTION"
    });

    expect(supervisor.role).toBe("supervisor");
    expect(master.role).toBe("master");
  });

  it("restringe a reabertura a Supervisor ou Master", () => {
    expect(migration).toContain("v_role NOT IN ('supervisor', 'master')");
    expect(migration).toContain("Somente Supervisor ou Master podem reabrir lotes");
    expect(migration).toContain("ERRCODE = '42501'");
  });

  it("preserva leituras e reinicia apenas o estado do lote", () => {
    expect(migration).toContain("status = 'open'");
    expect(migration).toContain("completed = FALSE");
    expect(migration).toContain("BATCH_REOPENED");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+(readings|capture_sessions)/i);
  });
});
