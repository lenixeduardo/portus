import { existsSync, rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { databaseDirectory } = vi.hoisted(() => {
  const { mkdirSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const directory = join(tmpdir(), `portus-barcode-users-${process.pid}-${Date.now()}`);
  mkdirSync(directory, { recursive: true });
  return { databaseDirectory: directory };
});

vi.mock("electron", () => ({
  app: { getPath: () => databaseDirectory },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showMessageBoxSync: () => 0 }
}));

import { closeDb, openDb } from "../db/connection";
import { runMigrations } from "../db/migrate";
import {
  createUser,
  getUserByBarcodeValue,
  listUsers
} from "../db/users-repo";
import { generateUniqueUsername } from "../users/barcode-user-registration";
import { loginByBarcode, logout } from "../auth/auth-service";

describe("criação dos três usuários operacionais pelas etiquetas reais", () => {
  beforeAll(async () => {
    process.env.PORTUS_DATABASE_MODE = "local";
    delete process.env.PORTUS_DATABASE_URL;

    await openDb();
    runMigrations();
  });

  afterAll(() => {
    logout();
    closeDb();
    if (existsSync(databaseDirectory)) {
      rmSync(databaseDirectory, { recursive: true, force: true });
    }
    delete process.env.PORTUS_DATABASE_MODE;
  });

  it("cria ANALISTA 01, ANALISTA 02 e PRODUCAO 01 sem criar ADEMIR", () => {
    const exists = (username: string) => listUsers().some((user) => user.username === username);

    const analyst01Username = generateUniqueUsername("Analista 01", exists);
    const analyst01 = createUser(
      analyst01Username,
      "TesteAnalista01#2026",
      "operator",
      "LABORATORY",
      "capture",
      "Analista 01",
      "ANALISTA 01"
    );

    const analyst02Username = generateUniqueUsername("Analista 02", exists);
    const analyst02 = createUser(
      analyst02Username,
      "TesteAnalista02#2026",
      "operator",
      "LABORATORY",
      "closure",
      "Analista 02",
      "ANALISTA 02"
    );

    const production01Username = generateUniqueUsername("Producao 01", exists);
    const production01 = createUser(
      production01Username,
      "TesteProducao01#2026",
      "operator",
      "PRODUCTION",
      undefined,
      "Producao 01",
      "PRODUCAO 01"
    );

    expect(analyst01).toMatchObject({
      username: "analista.01",
      displayName: "Analista 01",
      role: "operator",
      sectorCode: "LABORATORY",
      laboratoryProfile: "capture"
    });
    expect(analyst02).toMatchObject({
      username: "analista.02",
      displayName: "Analista 02",
      role: "operator",
      sectorCode: "LABORATORY",
      laboratoryProfile: "closure"
    });
    expect(production01).toMatchObject({
      username: "producao.01",
      displayName: "Producao 01",
      role: "operator",
      sectorCode: "PRODUCTION"
    });

    const users = listUsers();
    expect(users).toHaveLength(3);
    expect(users.map((user) => user.username).sort()).toEqual([
      "analista.01",
      "analista.02",
      "producao.01"
    ]);
    expect(users.some((user) => user.username.toLowerCase() === "ademir")).toBe(false);
    expect(getUserByBarcodeValue("ADEMIR")).toBeNull();
  });

  it("resolve os três usuários pelos valores exatos das etiquetas", () => {
    expect(getUserByBarcodeValue("ANALISTA 01")?.username).toBe("analista.01");
    expect(getUserByBarcodeValue("ANALISTA 02")?.username).toBe("analista.02");
    expect(getUserByBarcodeValue("PRODUCAO 01")?.username).toBe("producao.01");
  });

  it("faz login somente pela leitura do código de barras para os três usuários", () => {
    for (const [barcode, expectedUsername] of [
      ["ANALISTA 01", "analista.01"],
      ["ANALISTA 02", "analista.02"],
      ["PRODUCAO 01", "producao.01"]
    ] as const) {
      logout();
      const user = loginByBarcode(barcode);
      expect(user?.username).toBe(expectedUsername);
    }
  });

  it("rejeita duplicidade de barcode_value", () => {
    expect(() =>
      createUser(
        "analista.duplicado",
        "TesteDuplicado#2026",
        "operator",
        "LABORATORY",
        "capture",
        "Duplicado",
        "analista 01"
      )
    ).toThrow();
  });
});
