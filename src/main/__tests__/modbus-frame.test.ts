import { describe, it, expect } from "vitest";
import {
  appendCrc,
  buildReadRegistersFrame,
  crc16Modbus,
  decodeRegisters,
  EXCEPTION_RESPONSE_LENGTH,
  expectedReadResponseLength,
  isValidCrc,
  ModbusException,
  parseReadRegistersResponse
} from "../serial/modbus-frame";
import { applyLinearScale } from "../serial/parse";

function hex(bytes: string): Buffer {
  return Buffer.from(bytes.replace(/\s+/g, ""), "hex");
}

describe("crc16Modbus / appendCrc", () => {
  it("calcula o CRC canônico de 01 03 00 00 00 02 → C4 0B", () => {
    const frame = appendCrc(hex("01 03 00 00 00 02"));
    expect(frame.toString("hex").toUpperCase()).toBe("010300000002C40B");
  });

  it("CRC do nó 0x10 difere do nó 0x01 (mesmo corpo restante)", () => {
    const a = crc16Modbus(hex("01 03 00 00 00 02"));
    const b = crc16Modbus(hex("10 03 00 00 00 02"));
    expect(a).not.toBe(b);
  });
});

describe("buildReadRegistersFrame", () => {
  it("monta a requisição do nó 0x10, função 03, 2 registradores com CRC válido", () => {
    const frame = buildReadRegistersFrame(0x10, 3, 0, 2);
    expect(frame.subarray(0, 6).toString("hex").toUpperCase()).toBe("100300000002");
    expect(isValidCrc(frame)).toBe(true);
  });
});

describe("expectedReadResponseLength", () => {
  it("5 + quantity*2", () => {
    expect(expectedReadResponseLength(2)).toBe(9);
    expect(EXCEPTION_RESPONSE_LENGTH).toBe(5);
  });
});

describe("parseReadRegistersResponse", () => {
  it("decodifica 01 03 04 00 64 00 C8 → [100, 200]", () => {
    const resp = appendCrc(hex("01 03 04 00 64 00 C8"));
    const { registers } = parseReadRegistersResponse(resp, 3);
    expect(registers).toEqual([100, 200]);
  });

  it("rejeita frame com CRC inválido", () => {
    const bad = hex("01 03 04 00 64 00 C8 00 00");
    expect(() => parseReadRegistersResponse(bad, 3)).toThrow(/CRC/);
  });

  it("lança ModbusException em resposta de exceção (fn | 0x80)", () => {
    const exc = appendCrc(hex("01 83 02"));
    expect(() => parseReadRegistersResponse(exc, 3)).toThrow(ModbusException);
  });
});

describe("decodeRegisters", () => {
  it("uint16 usa o primeiro registrador", () => {
    expect(decodeRegisters([5159, 200], "uint16")).toBe(5159);
  });
  it("int16 interpreta sinal", () => {
    expect(decodeRegisters([0xffff], "int16")).toBe(-1);
  });
  it("uint32_be combina high-low", () => {
    expect(decodeRegisters([0x0001, 0x0000], "uint32_be")).toBe(65536);
  });
  it("uint32_le combina low-high (word swap)", () => {
    expect(decodeRegisters([0x0000, 0x0001], "uint32_le")).toBe(65536);
  });
});

describe("applyLinearScale (linearização 339–9980 → 0–14)", () => {
  const cfg = { rawMin: 339, rawMax: 9980, outMin: 0, outMax: 14 };

  it("mapeia os extremos", () => {
    expect(applyLinearScale(339, cfg)).toBeCloseTo(0, 6);
    expect(applyLinearScale(9980, cfg)).toBeCloseTo(14, 6);
  });

  it("mapeia um ponto intermediário", () => {
    // (5159 - 339) * 14 / (9980 - 339) ≈ 6.9993
    expect(applyLinearScale(5159, cfg)).toBeCloseTo(6.9993, 3);
  });

  it("retorna null para faixa degenerada (rawMin === rawMax)", () => {
    expect(applyLinearScale(100, { rawMin: 5, rawMax: 5, outMin: 0, outMax: 1 })).toBeNull();
  });
});
