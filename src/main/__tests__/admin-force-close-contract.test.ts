import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("finalização supervisionada de lote", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "database/migrations/012_unified_batch_traceability.sql"),
    "utf8"
  );
  const dashboard = readFileSync(
    resolve(process.cwd(), "src/renderer/screens/Dashboard.tsx"),
    "utf8"
  );
  const handlers = readFileSync(
    resolve(process.cwd(), "src/main/ipc/central-handlers.ts"),
    "utf8"
  );

  it("restringe finalização a Supervisor ou Master", () => {
    expect(migration).toContain("v_role NOT IN ('supervisor', 'master')");
    expect(migration).toContain("Somente Supervisor ou Master podem finalizar o lote");
    expect(handlers).toContain('user.role !== "supervisor" && user.role !== "master"');
  });

  it("exige o checkbox de lote concluído antes da finalização", () => {
    expect(migration).toContain("IF NOT v_before.completed THEN");
    expect(migration).toContain("Marque Lote concluído");
    expect(migration).toContain("'BATCH_FINALIZED'");
  });

  it("usa a finalização supervisionada no dashboard", () => {
    expect(dashboard).toContain("window.api.central.batches.finalize(b.id)");
    expect(dashboard).toContain("Lote concluído");
    expect(dashboard).not.toContain("window.api.central.batches.forceClose(b.id)");
  });
});
