import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCsvContent } from "../db/central-report-content";
import { buildBatchPrintHtml, buildTraceabilityRows } from "../db/traceability-report";
import type { BatchHistory } from "../../shared/ipc";

function sampleHistory(): BatchHistory {
  return {
    batch: {
      id: 1, productId: 1, code: "L-001", status: "open", openedAt: "2026-09-10T10:00:00Z",
      createdBy: 1, productName: "Produto", operatorName: "abertura", readingsCount: 2
    },
    auditEvents: [
      { id: 1, action: "BATCH_OPENED", timestamp: "2026-09-10T10:00:00Z", actorName: "João Operador", actorLogin: "producao", sectorCode: "PRODUCTION" },
      { id: 2, action: "BATCH_COMPLETED", timestamp: "2026-09-10T10:03:00Z", actorName: "Maria Analista", actorLogin: "laboratorio", sectorCode: "LABORATORY" }
    ],
    sessions: [
      {
        id: 10, startedAt: "2026-09-10T10:01:00Z", timeoutSeconds: 30, status: "completed",
        sectorCode: "PRODUCTION", operatorName: "João Operador", operatorLogin: "producao", stationCode: "PRODUCAO-01", readings: [
          { id: 1, equipmentId: 1, equipmentName: "Balança", slotIndex: 2, valueRaw: "1,25", valueParsed: "1.25", capturedAt: "2026-09-10T10:01:02Z" }
        ]
      },
      {
        id: 11, startedAt: "2026-09-10T10:02:00Z", timeoutSeconds: 30, status: "completed",
        sectorCode: "LABORATORY", operatorName: "Maria Analista", operatorLogin: "laboratorio", stationCode: "LABORATORIO-01", readings: [
          { id: 2, equipmentId: 2, equipmentName: "pH", slotIndex: -1, valueRaw: "7,2", valueParsed: "7.2", capturedAt: "2026-09-10T10:02:02Z" }
        ]
      }
    ]
  };
}

describe("exportação unificada de leituras", () => {
  it("preserva setor, responsável e valor de cada sessão no CSV intermediário", () => {
    const csv = buildCsvContent(sampleHistory());
    expect(csv).toContain("Setor;Responsável;Login;Computador");
    expect(csv).toContain("Produção;João Operador;producao;PRODUCAO-01;Balança;3;1,25;1,25");
    expect(csv).toContain("Laboratório;Maria Analista;laboratorio;LABORATORIO-01;pH;;7,2;7,2");
  });

  it("gera folha cronológica com login e computador de cada leitura", () => {
    const history = sampleHistory();
    const rows = buildTraceabilityRows(history);
    expect(rows.map((row) => row.event)).toEqual(["Lote aberto", "Balança", "pH", "Lote concluído"]);
    expect(rows[1]).toMatchObject({
      sector: "Produção",
      responsible: "João Operador",
      login: "producao",
      station: "PRODUCAO-01",
      result: "1.25"
    });

    const html = buildBatchPrintHtml(history);
    expect(html).toContain("Folha de rastreabilidade do lote");
    expect(html).toContain("Responsável");
    expect(html).toContain("Login");
    expect(html).toContain("Computador");
    expect(html).toContain("LABORATORIO-01");
  });

  it("usa a cor atual do tema como padrão do código de barras", () => {
    const source = readFileSync(resolve(process.cwd(), "src/renderer/components/BarcodeDisplay.tsx"), "utf8");
    expect(source).toContain('lineColor = "currentColor"');
  });
});
