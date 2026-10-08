import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery, mockEnd } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockEnd: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("pg", () => ({
  Pool: class {
    query = mockQuery;
    end = mockEnd;
  }
}));

import {
  centralQuery, checkCentralDatabase, closeCentralDatabase
} from "../db/central-connection";

describe("pré-validação do login PostgreSQL (migration 013)", () => {
  const previousUrl = process.env.PORTUS_DATABASE_URL;

  beforeEach(async () => {
    process.env.PORTUS_DATABASE_URL =
      "postgresql://portus_admin:password@127.0.0.1:5432/portus";
    await closeCentralDatabase();
    mockQuery.mockReset();
    mockEnd.mockClear();
  });

  afterEach(async () => {
    await closeCentralDatabase();
    if (previousUrl === undefined) delete process.env.PORTUS_DATABASE_URL;
    else process.env.PORTUS_DATABASE_URL = previousUrl;
  });

  it("bloqueia a autenticação se users.sector_code não existir e indica migration 013", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ ready: false }] })
      .mockResolvedValueOnce({ rows: [
        { column_name: "barcode_value" },
        { column_name: "laboratory_profile" }
      ] });

    await expect(checkCentralDatabase()).rejects.toThrow(/users\.sector_code.*migration 013/i);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(String(mockQuery.mock.calls[0][0])).toContain(
      "table_name = 'users' AND column_name = 'sector_code'"
    );
  });

  it("aceita schema completo sem alterar o PostgreSQL", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ready: true }] });
    await expect(checkCentralDatabase()).resolves.toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(String(mockQuery.mock.calls[0][0])).toContain(
      "column_name = 'laboratory_profile'"
    );
  });

  it("traduz o erro real de coluna PostgreSQL 42703 em ação de reparo", async () => {
    mockQuery.mockRejectedValueOnce(
      Object.assign(new Error('coluna "sector_code" não existe'), { code: "42703" })
    );
    await expect(centralQuery(
      "SELECT sector_code FROM users"
    )).rejects.toThrow(/users\.sector_code ausente.*migration 013/i);
  });

  it("garante que o script de migrations tenha DO $$ válido e valide sector_code", () => {
    const script = readFileSync(
      resolve(process.cwd(), "database/install-portus-database.ps1"), "utf8"
    );
    const normalized = script.replace(/\r\n/g, "\n");
    expect(normalized).toContain("DO $");
    expect(normalized).toContain("END;\n$;\n'@");
    expect(script).toContain("column_name = 'sector_code'");
    expect(script).toContain("column_name = 'laboratory_profile'");
  });

  it("nunca autentica em tabela users de outro schema", () => {
    const connection = readFileSync(
      resolve(process.cwd(), "src/main/db/central-connection.ts"), "utf8"
    );
    const auth = readFileSync(
      resolve(process.cwd(), "src/main/auth/auth-service.ts"), "utf8"
    );
    expect(connection).toContain('options: "-c search_path=public"');
    expect((auth.match(/FROM public\.users WHERE/g) ?? []).length).toBe(2);
  });

  it("verifica a estrutura antes do login por senha e etiqueta", () => {
    const script = readFileSync(
      resolve(process.cwd(), "src/main/ipc/auth-handlers.ts"), "utf8"
    );
    expect(script).toMatch(/await checkCentralDatabase\(\);\s*const user = await login\(/);
    expect(script).toMatch(/await checkCentralDatabase\(\);\s*const user = await loginByBarcode\(/);
  });
});
