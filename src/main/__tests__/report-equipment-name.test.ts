import { describe, expect, it } from "vitest";
import { reportEquipmentName } from "../db/traceability-report";

describe("nomes atuais de equipamentos nos relatorios", () => {
  it.each([
    ["Balança de Precisão", "Balança de Precisão"],
    ["Balança Analítica 2026", "Balança Analítica 2026"],
    ["Espectrofotômetro UV-Vis", "Espectrofotômetro UV-Vis"],
    ["pH-metro Laboratório", "pH-metro Laboratório"],
    ["RESERVA", "RESERVA"]
  ])("preserva %s", (input, expected) => {
    expect(reportEquipmentName(input)).toBe(expected);
  });

  it("remove somente espacos externos", () => {
    expect(reportEquipmentName("  Balança de Precisão  ")).toBe("Balança de Precisão");
  });
});
