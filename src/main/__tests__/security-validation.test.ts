import { describe, expect, it } from "vitest";
import { createUserSchema, isSafeOperationalRegex, updateEquipmentSchema } from "../validation/schemas";

describe("hardening de entrada operacional", () => {
  it("exige senha de pelo menos oito caracteres para novos usuários", () => {
    expect(createUserSchema.safeParse({ username: "operador", password: "1234567" }).success).toBe(false);
    expect(createUserSchema.safeParse({ username: "operador", password: "12345678" }).success).toBe(true);
  });

  it("aceita regex de leitura simples e rejeita padrões com backtracking perigoso", () => {
    expect(isSafeOperationalRegex("(?<value>[-+]?\\d+(?:[.,]\\d+)?)")).toBe(true);
    expect(isSafeOperationalRegex("(a+)+$")).toBe(false);
    expect(isSafeOperationalRegex("(a)\\1+")).toBe(false);
    expect(updateEquipmentSchema.safeParse({ id: 1, parseRegex: "(a+)+$" }).success).toBe(false);
  });
});
