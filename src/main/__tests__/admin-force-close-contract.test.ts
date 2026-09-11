import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("finalização administrativa de lote", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "database/migrations/007_admin_force_close.sql"),
    "utf8"
  );
  const dashboard = readFileSync(
    resolve(process.cwd(), "src/renderer/screens/Dashboard.tsx"),
    "utf8"
  );

  it("permite a exceção somente para Admin e Master", () => {
    expect(migration).toContain("v_role NOT IN ('admin', 'master')");
    expect(migration).toContain("ERRCODE = '42501'");
  });

  it("encerra ambos os setores sem consultar leituras", () => {
    expect(migration).toContain("production_closed = TRUE");
    expect(migration).toContain("laboratory_closed = TRUE");
    expect(migration).toContain("status = 'closed'");
    expect(migration).not.toMatch(/FROM\s+(readings|capture_sessions)/i);
  });

  it("usa o encerramento forçado e identifica a ação como Finalizar lote", () => {
    expect(dashboard).toContain("window.api.central.batches.forceClose(b.id)");
    expect(dashboard).toContain('? "Finalizar lote"');
  });
});
