import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/central-connection", () => ({ centralQuery: vi.fn() }));
import { centralQuery } from "../db/central-connection";
import {
  createCentralCaptureSession,
  describeCapturePermissionError
} from "../db/central-capture-repo";

const query = vi.mocked(centralQuery);
const denied = () => Object.assign(
  new Error("Operação não autorizada para usuário/aplicação/setor"),
  { code: "42501" }
);

describe("regressão: captura entre setores", () => {
  beforeEach(() => query.mockReset());

  it.each([
    ["laboratory", "LABORATORY", "PRODUCTION", "PORTUS"],
    ["operator", "PRODUCTION", "LABORATORY", "PORTUS_LABORATORY"]
  ] as const)(
    "%s com origem %s usa a aplicação da estação %s e orienta corrigir permissões",
    async (role, originSector, stationSector, expectedApplication) => {
      query.mockImplementation(async (sql) => {
        const statement = String(sql);
        if (statement.includes("FROM users u")) {
          return { rows: [{
            user_id: 17,
            application_id: 5,
            sector_id: 3,
            user_role: role,
            user_sector_code: originSector
          }] } as any;
        }
        if (statement.includes("ensure_station(")) {
          return { rows: [{ id: 12 }] } as any;
        }
        if (statement.includes("portus_assert_permission(")) {
          throw denied();
        }
        throw new Error("Consulta inesperada: " + statement);
      });

      await expect(createCentralCaptureSession(
        99, 30, "operador.qa", stationSector,
        { code: "PC-QA", name: "Estação QA", sectorCode: stationSector }
      )).rejects.toThrow(/PORTUS DB Utility.*024 e 025/);

      expect(query).toHaveBeenCalledTimes(3);
      expect(query.mock.calls[0][1]).toEqual(["operador.qa", expectedApplication, stationSector]);
      expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO capture_sessions"))).toBe(false);
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
