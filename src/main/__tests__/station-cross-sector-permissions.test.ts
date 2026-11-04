import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("permissão de leitura pela máquina física", () => {
  it("habilita a captura dos operadores autorizados nos dois setores, sem ampliar outras permissões", () => {
    const migration = source("database/migrations/024_cross_sector_station_capture.sql");
    expect(migration).toContain("original_permission.can_capture = TRUE");
    expect(migration).toContain("u.role IN ('operator', 'laboratory')");
    expect(migration).toContain("u.active = TRUE");
    expect(migration).toContain("target_sector.code IN ('PRODUCTION', 'LABORATORY')");
    expect(migration).toContain("SET can_capture = EXCLUDED.can_capture");
    expect(migration).not.toMatch(/SET can_open\s*=|SET can_move\s*=|SET can_confirm_/);
  });

  it("concede captura em ambos os setores para novos operadores, preservando abertura e movimentação", () => {
    const permissions = source("src/main/db/central-users-repo.ts");
    expect(permissions).toContain("CASE WHEN $2 OR $3 OR $4 OR $5 OR $6 THEN TRUE ELSE FALSE END");
    expect(permissions).toContain("($5 AND s.code = 'PRODUCTION') OR ($6 AND s.code = 'LABORATORY')");
    expect(permissions).toContain("($5 AND s.code = 'PRODUCTION') THEN TRUE ELSE FALSE END");
  });

  it("bloqueia discrepância entre setor da sessão e setor da máquina", () => {
    const capture = source("src/main/serial/capture-service.ts");
    expect(capture).toContain("stationIdentity.sectorCode !== sectorCode");
  });
});
