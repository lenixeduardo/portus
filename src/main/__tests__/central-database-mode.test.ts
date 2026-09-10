import { afterEach, describe, expect, it } from "vitest";
import {
  getCentralDatabaseMode,
  isCentralDatabaseConfigured,
  isCentralDatabaseRequired
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
});
