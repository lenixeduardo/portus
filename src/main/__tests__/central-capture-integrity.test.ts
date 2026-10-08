import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/central-connection", () => ({ centralQuery: vi.fn() }));
import { centralQuery } from "../db/central-connection";
import {
  insertCentralReading,
  validateCentralEquipmentMapping
} from "../db/central-capture-repo";

const mockQuery = vi.mocked(centralQuery);

describe("integridade da captura PostgreSQL após o merge", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("resolve o equipamento pelo ID central, mesmo quando a estação altera o nome", async () => {
    mockQuery.mockImplementation(async (sql, params) => {
      const query = String(sql);
      if (query.includes("FROM users u")) {
        return { rows: [{ user_id: 1, application_id: 1, sector_id: 1 }] } as any;
      }
      if (query.includes("FROM equipments WHERE id = $1")) {
        expect(params).toEqual([42]);
        return { rows: [{ id: 42 }] } as any;
      }
      if (query.includes("register_reading(")) {
        expect(params?.[1]).toBe(42);
        return { rows: [{
          id: 100, batch_id: 9, equipment_id: 42,
          value_raw: "10.5", value_parsed: "10.5",
          captured_at: "2026-10-08T12:00:00.000Z", capture_session_id: 5
        }] } as any;
      }
      throw new Error("Consulta inesperada: " + query);
    });

    const reading = await insertCentralReading({
      batchId: 9,
      equipmentId: 42,
      equipmentName: "Balança da Produção (nome local editado)",
      valueRaw: "10.5",
      valueParsed: "10.5",
      captureSessionId: 5,
      username: "operador.teste",
      sectorCode: "PRODUCTION"
    });

    expect(reading).toMatchObject({
      batchId: 9, equipmentId: 42, captureSessionId: 5
    });
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it("rejeita ID inexistente ou desabilitado, sem gravar leitura em equipamento diferente", async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (String(sql).includes("FROM users u")) {
        return { rows: [{ user_id: 1, application_id: 1, sector_id: 1 }] } as any;
      }
      return { rows: [] } as any;
    });
    await expect(insertCentralReading({
      batchId: 9,
      equipmentId: 999,
      equipmentName: "Nome duplicado",
      valueRaw: "11",
      valueParsed: "11",
      captureSessionId: 5,
      username: "operador.teste",
      sectorCode: "PRODUCTION"
    })).rejects.toThrow(/Equipamento ID 999/);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("compara a lista de equipamentos exclusivamente por IDs globais", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 42 }, { id: 51 }]
    } as any);
    expect(await validateCentralEquipmentMapping([42, 51, 99])).toEqual([99]);
    expect(mockQuery.mock.calls[0][1]).toEqual([[42, 51, 99]]);
  });

  it("registra falhas de gravações concluídas e impede falso sucesso no encerramento", () => {
    const capture = readFileSync(
      resolve(process.cwd(), "src/main/serial/capture-service.ts"), "utf8"
    );
    expect(capture).toContain("centralReadErrors.push(message)");
    expect(capture).toContain("const failedCentralWrites = centralReadErrors.length;");
    expect(capture).toContain('const finalReason = failedCentralWrites > 0 || sessionCloseError ? "cancelled" : reason');
    expect(capture).toContain("if (result.failedReads || result.sessionCloseError)");
    expect(capture).toContain("A sessão não foi marcada como concluída.");
  });
});
