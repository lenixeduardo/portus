import { describe, it, expect } from "vitest";
import { delimiterChars, normalizeNumeric, parseReading } from "../serial/parse";

describe("delimiterChars", () => {
  it("mapeia tokens para caracteres", () => {
    expect(delimiterChars("crlf")).toBe("\r\n");
    expect(delimiterChars("lf")).toBe("\n");
    expect(delimiterChars("cr")).toBe("\r");
  });
  it("default tolerante (\\n) para token ausente/desconhecido", () => {
    expect(delimiterChars(undefined)).toBe("\n");
    expect(delimiterChars("xpto")).toBe("\n");
  });
});

describe("normalizeNumeric", () => {
  it("converte vírgula decimal simples", () => {
    expect(normalizeNumeric("1,234")).toBe("1.234");
    expect(normalizeNumeric("-0,5")).toBe("-0.5");
  });
  it("converte formato agrupado pt-BR", () => {
    expect(normalizeNumeric("1.234,56")).toBe("1234.56");
  });
  it("preserva números já canônicos", () => {
    expect(normalizeNumeric("12.5")).toBe("12.5");
    expect(normalizeNumeric(" 42 ")).toBe("42");
  });
  it("não mexe em texto não-numérico", () => {
    expect(normalizeNumeric("ABS")).toBe("ABS");
  });
});

describe("parseReading", () => {
  it("sem regex devolve o valor cru normalizado", () => {
    expect(parseReading("1,5", null, false)).toEqual({ parsed: "1.5", failureReason: null });
  });

  it("prioriza o grupo nomeado <value> (espectrofotômetro multi-campo)", () => {
    const regex = /ABS[:\s]*(?<value>\d+[.,]\d+)/;
    const out = parseReading("WL:540 ABS:1,234", regex, false);
    expect(out).toEqual({ parsed: "1.234", failureReason: null });
  });

  it("usa o primeiro grupo posicional quando não há grupo nomeado", () => {
    const regex = /=\s*([\d.,]+)/;
    expect(parseReading("pH = 7,01", regex, false)).toEqual({ parsed: "7.01", failureReason: null });
  });

  it("reporta no_match quando a regex não casa", () => {
    expect(parseReading("ERRO", /(?<value>\d+)/, false)).toEqual({
      parsed: null,
      failureReason: "no_match"
    });
  });

  it("reporta invalid_regex quando marcada inválida", () => {
    expect(parseReading("1.0", null, true)).toEqual({ parsed: null, failureReason: "invalid_regex" });
  });
});
