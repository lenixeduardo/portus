import { describe, expect, it } from "vitest";
import { reportEquipmentName } from "../db/traceability-report";

describe("nomes de equipamentos nos relatorios", () => {
  it.each([
    ["Espectrofotômetro", "Espectrofotometro"],
    ["EspectrofotÃ´metro", "Espectrofotometro"],
    ["Balança", "Balanca"],
    ["BalanÃ§a", "Balanca"],
    ["Viscosímetro", "Viscosimetro"],
    ["ViscosÃmetro", "Viscosimetro"],
    ["Refratômetro", "Refratometro"],
    ["RefratÃ´metro", "Refratometro"],
    ["pHmetro", "pHmetro"],
    ["RESERVA", "RESERVA"]
  ])("normaliza %s para %s", (input, expected) => {
    expect(reportEquipmentName(input)).toBe(expected);
  });
});
