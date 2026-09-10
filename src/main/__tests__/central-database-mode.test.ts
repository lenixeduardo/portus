import { afterEach, describe, expect, it } from "vitest";
import {
  getCentralDatabaseMode,
  isCentralDatabaseConfigured,
  isCentralDatabaseRequired,
  parseCentralDatabaseConfig,
  parseWindowsRegistryValue
} from "../db/central-connection";

const originalMode = process.env.PORTUS_DATABASE_MODE;
const originalUrl = process.env.PORTUS_DATABASE_URL;

afterEach(() => {
  if (originalMode === undefined) delete process.env.PORTUS_DATABASE_MODE;
  else process.env.PORTUS_DATABASE_MODE = originalMode;
  if (originalUrl === undefined) delete process.env.PORTUS_DATABASE_URL;
  else process.env.PORTUS_DATABASE_URL = originalUrl;
});

describe("modo do banco central", () => {
  it("usa PostgreSQL central como modo autoritativo por padrão", () => {
    delete process.env.PORTUS_DATABASE_MODE;
    expect(getCentralDatabaseMode()).toBe("central");
    expect(isCentralDatabaseRequired()).toBe(true);
  });

  it("permite SQLite somente quando o modo local é explícito", () => {
    process.env.PORTUS_DATABASE_MODE = "local";
    expect(getCentralDatabaseMode()).toBe("local");
    expect(isCentralDatabaseRequired()).toBe(false);
  });

  it("não considera uma URL vazia como configuração válida", () => {
    process.env.PORTUS_DATABASE_URL = "   ";
    expect(isCentralDatabaseConfigured()).toBe(false);
    process.env.PORTUS_DATABASE_URL = "postgresql://portus_admin:secret@127.0.0.1:5432/portus";
    expect(isCentralDatabaseConfigured()).toBe(true);
  });

  it("lê a configuração persistida no Registro do Windows", () => {
    const output = [
      "",
      "HKEY_CURRENT_USER\\Environment",
      "    PORTUS_DATABASE_URL    REG_SZ    postgresql://portus_admin:p%40ss@127.0.0.1:5432/portus",
      ""
    ].join("\r\n");

    expect(parseWindowsRegistryValue(output, "PORTUS_DATABASE_URL")).toBe(
      "postgresql://portus_admin:p%40ss@127.0.0.1:5432/portus"
    );
    expect(parseWindowsRegistryValue(output, "PORTUS_DATABASE_MODE")).toBeUndefined();
  });

  it("lê o arquivo de configuração persistente do instalador", () => {
    expect(parseCentralDatabaseConfig(JSON.stringify({
      PORTUS_DATABASE_URL: " postgresql://portus_admin:p%40ss@127.0.0.1:5432/portus ",
      PORTUS_DATABASE_MODE: " central "
    }))).toEqual({
      PORTUS_DATABASE_URL: "postgresql://portus_admin:p%40ss@127.0.0.1:5432/portus",
      PORTUS_DATABASE_MODE: "central"
    });
  });

  it("ignora arquivo de configuração inválido", () => {
    expect(parseCentralDatabaseConfig("{inválido")).toEqual({});
    expect(parseCentralDatabaseConfig("[]")).toEqual({});
  });
});
