import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("contrato de rastreabilidade do lote único", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "database/migrations/012_unified_batch_traceability.sql"),
    "utf8"
  );
  const captureRepo = readFileSync(
    resolve(process.cwd(), "src/main/db/central-capture-repo.ts"),
    "utf8"
  );
  const historyRepo = readFileSync(
    resolve(process.cwd(), "src/main/db/central-history-repo.ts"),
    "utf8"
  );
  const captureHandlers = readFileSync(
    resolve(process.cwd(), "src/main/ipc/capture-handlers.ts"),
    "utf8"
  );
  const settings = readFileSync(
    resolve(process.cwd(), "src/main/db/settings-repo.ts"),
    "utf8"
  );

  it("mantém lote concluído separado de lote finalizado", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS completed BOOLEAN");
    expect(migration).toContain("'BATCH_COMPLETED'");
    expect(migration).toContain("'BATCH_FINALIZED'");
    expect(migration).toContain("IF NOT v_before.completed THEN");
  });

  it("persiste a estação física na sessão independentemente do setor do usuário", () => {
    expect(captureRepo).toContain("station_id");
    expect(captureRepo).toContain("ensure_station($1, $2, $3)");
    expect(captureRepo).toContain("station.sectorCode");
    expect(settings).toContain('"station_code"');
    expect(settings).toContain('"station_sector_code"');
  });

  it("expõe responsável, login e computador no histórico", () => {
    expect(historyRepo).toContain("operator_login");
    expect(historyRepo).toContain("station_code");
    expect(historyRepo).toContain("station_name");
    expect(historyRepo).toContain("auditEvents");
  });

  it("bloqueia Supervisor de capturar e mantém Master fora desse bloqueio", () => {
    expect(captureHandlers).toContain('user.role === "supervisor"');
    expect(captureHandlers).toContain("Supervisor não realiza análises ou leituras.");
    expect(captureHandlers).not.toContain('user.role === "master") return { ok: false');
  });

  it("reabertura preserva leituras existentes", () => {
    expect(migration).toContain("'BATCH_REOPENED'");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+(readings|capture_sessions)/i);
  });
});
