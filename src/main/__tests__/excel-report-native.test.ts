import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { writeFormattedXlsx } from "../db/excel-report";

function unzipEntries(buffer: Buffer): Record<string, string> {
  const entries: Record<string, string> = {};
  for (let pos = 0; pos < buffer.length;) {
    if (buffer.readUInt32LE(pos) !== 0x04034b50) break;
    const compressed = buffer.readUInt32LE(pos + 18);
    const filenameLength = buffer.readUInt16LE(pos + 26);
    const extraLength = buffer.readUInt16LE(pos + 28);
    const name = buffer.subarray(pos + 30, pos + 30 + filenameLength).toString("utf8");
    const dataStart = pos + 30 + filenameLength + extraLength;
    entries[name] = inflateRawSync(buffer.subarray(dataStart, dataStart + compressed)).toString("utf8");
    pos = dataStart + compressed;
  }
  return entries;
}

describe("PORTUS XLSX without Microsoft Excel", () => {
  it("exports valid OOXML package with CSV escaping, heading style and frozen row", () => {
    const folder = mkdtempSync(join(tmpdir(), "portus-xlsx-test-"));
    try {
      const destination = join(folder, "report.xlsx");
      writeFormattedXlsx(destination, 'Lote;Produto;Operador\r\nX01;"Produto; A";João\r\nX02;"multi\nlinha";Maria');
      const files = unzipEntries(readFileSync(destination));
      expect(Object.keys(files)).toContain("[Content_Types].xml");
      expect(files["xl/workbook.xml"]).toContain("Relatório");
      expect(files["xl/worksheets/sheet1.xml"]).toContain("Produto; A");
      expect(files["xl/worksheets/sheet1.xml"]).toContain("multi\nlinha");
      expect(files["xl/worksheets/sheet1.xml"]).toContain("state=\"frozen\"");
      expect(files["xl/worksheets/sheet1.xml"]).toContain("autoFilter");
      expect(files["xl/styles.xml"]).toContain("FF111215");
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
