import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { describeCapturePermissionError } from "../db/central-capture-repo";

const denied = () => Object.assign(
  new Error("Operação não autorizada para usuário/aplicação/setor"),
  { code: "42501" }
);

describe("regressão: captura entre setores", () => {
  it.each([
    ["laboratory", "LABORATORY", "PRODUCTION", "Laboratório", "Produção"],
    ["operator", "PRODUCTION", "LABORATORY", "Produção", "Laboratório"]
  ] as const)(
    "%s do setor %s recebe orientação quando a estação está em %s",
    (role, originSector, stationSector, sourceName, stationName) => {
      const error = describeCapturePermissionError(
        denied(), { user_role: role, user_sector_code: originSector }, stationSector
      );
      expect(error.message).toContain("PORTUS DB Utility");
      expect(error.message).toContain("024 e 025");
      expect(error.message).toContain(`vínculo com ${sourceName}`);
      expect(error.message).toContain(`configurada como ${stationName}`);
    }
  );

  it("não disfarça negação no próprio setor nem erros de outras naturezas", () => {
    const original = denied();
    expect(describeCapturePermissionError(
      original, { user_role: "laboratory", user_sector_code: "LABORATORY" }, "LABORATORY"
    )).toBe(original);

    const unavailable = Object.assign(new Error("Conexão indisponível"), { code: "08006" });
    expect(describeCapturePermissionError(
      unavailable, { user_role: "laboratory", user_sector_code: "LABORATORY" }, "PRODUCTION"
    )).toBe(unavailable);
  });

  it("mantém a escolha da aplicação pelo setor da estação, não pelo setor do usuário", () => {
    const source = readFileSync(resolve(process.cwd(), "src/main/db/central-capture-repo.ts"), "utf8");
    expect(source).toContain('const applicationCode = sectorCode === "LABORATORY" ? "PORTUS_LABORATORY" : "PORTUS"');
    expect(source).toContain('await assertCentralCapturePermission(context, sectorCode)');
  });

  it("a migration 025 só reconcilia captura para operadores previamente autorizados", () => {
    const sql = readFileSync(resolve(
      process.cwd(), "database/migrations/025_reconcile_cross_sector_capture_permissions.sql"
    ), "utf8");
    expect(sql).toContain("original_permission.can_capture = TRUE");
    expect(sql).toContain("u.active = TRUE");
    expect(sql).toContain("u.role IN ('operator', 'laboratory')");
    expect(sql).toContain("ON CONFLICT (user_id, sector_id) DO UPDATE");
    expect(sql).toContain("ON CONFLICT (application_id, sector_id) DO UPDATE");
    expect(sql).not.toMatch(/SET can_open\s*=|SET can_move\s*=|SET can_confirm_/);
    expect(sql).toContain("a.code = 'PORTUS' AND s.code = 'PRODUCTION'");
    expect(sql).toContain("a.code = 'PORTUS_LABORATORY' AND s.code = 'LABORATORY'");
  });
});
