import { describe, expect, it } from "vitest";
import { createUserSchema, isSafeOperationalRegex, updateEquipmentSchema } from "../validation/schemas";

describe("hardening de entrada operacional", () => {
  it("exige senha de pelo menos oito caracteres para novos usuários com mensagem clara", () => {
    const invalid = createUserSchema.safeParse({ username: "operador", password: "1234567" });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues.find((issue) => issue.path[0] === "password")?.message)
        .toBe("A senha precisa ter pelo menos 8 caracteres.");
    }

    expect(createUserSchema.safeParse({ username: "operador", password: "12345678" }).success).toBe(true);
  });

  it("explica claramente formatos inválidos de nome de usuário", () => {
    const withSpace = createUserSchema.safeParse({ username: "operador teste", password: "12345678" });
    expect(withSpace.success).toBe(false);
    if (!withSpace.success) {
      expect(withSpace.error.issues.find((issue) => issue.path[0] === "username")?.message)
        .toBe("O usuário não pode conter espaços. Use apenas letras sem acento, números, ponto (.), _ ou -.");
    }

    const withAccent = createUserSchema.safeParse({ username: "josé", password: "12345678" });
    expect(withAccent.success).toBe(false);
    if (!withAccent.success) {
      expect(withAccent.error.issues.find((issue) => issue.path[0] === "username")?.message)
        .toBe("Formato de usuário inválido. Use apenas letras sem acento, números, ponto (.), _ ou -.");
    }

    expect(createUserSchema.safeParse({ username: "operador.teste_01", password: "12345678" }).success).toBe(true);
  });

  it("aceita regex de leitura simples e rejeita padrões com backtracking perigoso", () => {
    expect(isSafeOperationalRegex("(?<value>[-+]?\\d+(?:[.,]\\d+)?)")).toBe(true);
    expect(isSafeOperationalRegex("(a+)+$")).toBe(false);
    expect(isSafeOperationalRegex("(a)\\1+")).toBe(false);
    expect(updateEquipmentSchema.safeParse({ id: 1, parseRegex: "(a+)+$" }).success).toBe(false);
  });
});
