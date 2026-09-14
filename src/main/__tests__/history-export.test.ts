import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCsvContent } from "../db/history-repo";
import { buildExcelAutomationScript } from "../db/excel-report";
import type { BatchHistory } from "../../shared/ipc";

function sampleHistory(): BatchHistory {
  return {
    batch: {
      id: 1, productId: 1, code: "L-001", status: "open", openedAt: "2026-09-10T10:00:00Z",
      createdBy: 1, productName: "Produto", operatorName: "abertura", readingsCount: 2
    },
    sessions: [
      {
        id: 10, startedAt: "2026-09-10T10:01:00Z", timeoutSeconds: 30, status: "completed",
        sectorCode: "PRODUCTION", operatorName: "producao", readings: [
          { id: 1, equipmentId: 1, equipmentName: "Balança", slotIndex: 2, valueRaw: "1,25", valueParsed: "1.25", capturedAt: "2026-09-10T10:01:02Z" }
        ]
      },
      {
        id: 11, startedAt: "2026-09-10T10:02:00Z", timeoutSeconds: 30, status: "completed",
        sectorCode: "LABORATORY", operatorName: "laboratorio", readings: [
          { id: 2, equipmentId: 2, equipmentName: "pH", slotIndex: -1, valueRaw: "7,2", valueParsed: "7.2", capturedAt: "2026-09-10T10:02:02Z" }
        ]
      }
    ]
  };
}

describe("exportação unificada de leituras", () => {
  it("preserva setor, responsável e valor de cada sessão no CSV intermediário", () => {
    const csv = buildCsvContent(sampleHistory());
    expect(csv).toContain("Setor;Responsável");
    expect(csv).toContain("Produção;producao;Balança;3;1,25;1,25");
    expect(csv).toContain("Laboratório;laboratorio;pH;;7,2;7,2");
  });

  it("gera automação do Excel com cabeçalho, larguras, filtro, congelamento e formato XLSX", () => {
    const script = buildExcelAutomationScript();
    expect(script).toContain("FreezePanes = $true");
    expect(script).toContain("AutoFilter()");
    expect(script).toContain("SaveAs($destination, 51)");
    expect(script).toContain("@(16,18,14,20,10,18,18,18,14,16,16,12,16,16,22)");
    expect(script).toContain("$header.Interior.Color = Rgb 17 18 21");
    expect(script).toContain("$header.Font.Color = Rgb 255 255 255");
  });

  it("usa a cor atual do tema como padrão do código de barras", () => {
    const source = readFileSync(resolve(process.cwd(), "src/renderer/components/BarcodeDisplay.tsx"), "utf8");
    expect(source).toContain('lineColor = "currentColor"');
  });
});
