import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import type { BatchHistory } from "../../shared/ipc";
import { excelReportRows, writeBatchReportXlsx } from "../db/excel-report";

function contents(path: string): Record<string, Buffer> {
  const output: Record<string, Buffer> = {};
  const raw = readFileSync(path);
  for (let pos = 0; pos < raw.length && raw.readUInt32LE(pos) === 0x04034b50;) {
    const length = raw.readUInt32LE(pos + 18);
    const nameLength = raw.readUInt16LE(pos + 26);
    const extras = raw.readUInt16LE(pos + 28);
    const name = raw.subarray(pos + 30, pos + 30 + nameLength).toString("utf8");
    const start = pos + 30 + nameLength + extras;
    output[name] = inflateRawSync(raw.subarray(start, start + length));
    pos = start + length;
  }
  return output;
}

function sample(status: "open" | "closed" = "closed", count = 2): BatchHistory {
  return {
    batch: {
      id: 1, productId: 1, code: "SIM-2026-2629", productName: "Produto Teste",
      operatorName: "usuario", status, openedAt: "2026-10-09T20:00:00Z",
      closedAt: status === "closed" ? "2026-10-10T16:00:00Z" : undefined,
      readingsCount: count
    },
    auditEvents: [
      { id: 1, action: "BATCH_OPENED", timestamp: "2026-10-09T20:00:00Z", actorName: "Operador A" },
      ...(status === "closed"
        ? [{ id: 2, action: "BATCH_FINALIZED", timestamp: "2026-10-10T16:00:00Z", actorName: "Supervisor B" }]
        : [])
    ],
    sessions: [{
      id: 2, startedAt: "2026-10-09T20:00:00Z",
      timeoutSeconds: 30, status: "completed",
      operatorLogin: "lab", stationCode: "DESKTOP-LAB",
      readings: Array.from({ length: count }, (_, i) => ({
        id: i + 1, equipmentId: 1, equipmentName: "Balança",
        slotIndex: -1, valueRaw: i === 0 ? "=1+1" : "11.25",
        capturedAt: "2026-10-09T20:01:00Z"
      }))
    }]
  };
}
describe("modelo Excel EPA no historico PORTUS", () => {
  it("mapeia somente oito campos conhecidos, sem inventar unidade/status/observacao", () => {
    const rows = excelReportRows(sample());
    expect(rows[0]).toEqual([
      "DESKTOP-LAB", "lab", "Balança", "=1+1", "", "",
      expect.any(String), ""
    ]);
    expect(rows[0]).toHaveLength(8);
  });
  it("abre como OOXML com layout, logotipo, codigo de barras e rodape dinamico", () => {
    const folder = mkdtempSync(join(tmpdir(), "portus-epa-"));
    try {
      const path = join(folder, "lote.xlsx");
      writeBatchReportXlsx(path, sample("closed", 25));
      const files = contents(path);
      const sheet = files["xl/worksheets/sheet1.xml"].toString("utf8");
      expect(files["xl/media/epa-logo.png"].length).toBeGreaterThan(1000);
      expect(files["xl/media/code39.png"].subarray(0, 8).toString("hex"))
        .toBe("89504e470d0a1a0a");
      expect(sheet).toContain("Observação");
      expect(sheet).toContain("DESKTOP-LAB");
      expect(sheet).toContain("Supervisor B");
      expect(sheet).toContain("Balança");
      expect(sheet).toContain("<mergeCell ref=\"A40:B40\"/>");
      expect(sheet).not.toContain("autoFilter");
      expect(sheet).not.toContain("Valor Numérico");
      expect(sheet).not.toContain("<f>");
      expect(sheet).toContain("=1+1");
      expect(sheet).toContain('fitToWidth="1"');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
  it("mantem o fechamento vazio enquanto o lote nao estiver finalizado", () => {
    const folder = mkdtempSync(join(tmpdir(), "portus-epa-"));
    try {
      const path = join(folder, "lote.xlsx");
      writeBatchReportXlsx(path, sample("open"));
      const sheet = contents(path)["xl/worksheets/sheet1.xml"].toString("utf8");
      expect(sheet).toContain("Em andamento");
      expect(sheet).not.toContain("Supervisor B");
      expect(sheet).toContain("LOTE FECHADO POR");
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
