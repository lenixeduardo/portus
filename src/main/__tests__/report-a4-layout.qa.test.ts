import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { buildBatchPrintHtml } from "../db/traceability-report";
import type { BatchHistory, ReadingRecord } from "../../shared/ipc";

const active = process.env.PORTUS_QA_E2E === "1";
const root = mkdtempSync(join(tmpdir(), "portus-print-a4-"));
let browser: Browser | undefined;

beforeAll(async () => {
  if (active) browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  rmSync(root, { recursive: true, force: true });
});

function fixture(count: number): BatchHistory {
  const initial = new Date("2026-11-05T09:00:00.000Z").getTime();
  const readings: ReadingRecord[] = Array.from({ length: count }, (_, i) => ({
    id: i + 1, equipmentId: 1,
    equipmentName: i % 3 === 0
      ? "Balança de Precisão — Linha de Produção Caramelo"
      : "Viscosímetro de Produção",
    slotIndex: -1, valueRaw: `${(i + 1) * 1.5}`,
    valueParsed: `${((i + 1) * 1.5).toFixed(2)}`,
    capturedAt: new Date(initial + i * 60_000).toISOString()
  }));
  return {
    batch: {
      id: 101, productId: 1, code: "QA-A4-0001", status: "closed",
      openedAt: "2026-11-05T08:50:00.000Z",
      closedAt: "2026-11-05T11:00:00.000Z",
      createdBy: 1, productName: "Lote de Caramelo — Inspeção de Qualidade",
      operatorName: "Operador QA", readingsCount: count
    },
    sessions: [{
      id: 1, startedAt: "2026-11-05T08:59:00.000Z",
      timeoutSeconds: 30, status: "completed",
      sectorCode: "PRODUCTION", operatorName: "Operador QA",
      operatorLogin: "operador.qa", stationCode: "PRODUCAO-01", readings
    }],
    auditEvents: [
      { id: 1, action: "BATCH_OPENED", timestamp: "2026-11-05T08:50:00.000Z", actorName: "Operador QA" },
      { id: 2, action: "BATCH_FINALIZED", timestamp: "2026-11-05T11:00:00.000Z", actorName: "Supervisor QA" }
    ]
  };
}

describe.skipIf(!active)("Auditoria visual de impressão A4 — relatório PORTUS", () => {
  it.each([8, 26, 42])("mantém %i capturas legíveis em uma única página A4", async count => {
    const page = await browser!.newPage({ viewport: { width: 1100, height: 900 } });
    const filename = join(root, `relatorio-${count}.pdf`);
    try {
      await page.setContent(buildBatchPrintHtml(fixture(count)), { waitUntil: "load" });
      await page.evaluate(() => (window as any).fitEquipmentNames?.());
      const bounds = await page.evaluate(() => {
        const cells = [...document.querySelectorAll<HTMLTableCellElement>(".equipment-name")];
        return {
          cells: cells.length,
          columnOverflow: cells.filter(cell => {
            const text = cell.querySelector("span")!.getBoundingClientRect();
            const box = cell.getBoundingClientRect();
            return text.right > box.right - 1 || text.left < box.left - 1;
          }).length,
          horizontalOverflow: document.body.scrollWidth > document.body.clientWidth + 1
        };
      });
      expect(bounds.cells).toBe(count);
      expect(bounds.horizontalOverflow).toBe(false);
      expect(bounds.columnOverflow).toBe(0);

      await page.pdf({ path: filename, format: "A4", printBackground: true, preferCSSPageSize: true });
      const info = execFileSync("pdfinfo", [filename], { encoding: "utf8" });
      const pages = Number(info.match(/^Pages:\s*(\d+)/m)?.[1]);
      expect(info).toMatch(/Page size:\s*595\.\d+ x 841\.\d+ pts \(A4\)/);
      expect(pages).toBe(1);
      const text = execFileSync("pdftotext", [filename, "-"], { encoding: "utf8" });
      expect(text).toContain("RELATÓRIO DO LOTE");
      expect(text).toContain("Lote iniciado por:");
      expect(text).toContain("Lote finalizado por:");
      expect((text.match(/Viscosímetro de Produção|Balança de Precisão/g) ?? []).length).toBe(count);
    } finally {
      await page.close();
    }
  }, 60000);

  it("preserva todas as leituras quando um lote exige mais de uma folha", async () => {
    const page = await browser!.newPage();
    const filename = join(root, "relatorio-100.pdf");
    try {
      await page.setContent(buildBatchPrintHtml(fixture(100)), { waitUntil: "load" });
      await page.pdf({ path: filename, format: "A4", printBackground: true, preferCSSPageSize: true });
      const text = execFileSync("pdftotext", [filename, "-"], { encoding: "utf8" });
      expect((text.match(/Viscosímetro de Produção|Balança de Precisão/g) ?? []).length).toBe(100);
      expect(Number(execFileSync("pdfinfo", [filename], { encoding: "utf8" }).match(/^Pages:\s*(\d+)/m)?.[1])).toBeGreaterThan(1);
    } finally {
      await page.close();
    }
  }, 60000);
});
