import { describe, expect, it } from "vitest";
import { buildCentralDatabaseUrl } from "../db/central-connection";

describe("conexão de estação cliente", () => {
  it("monta URL segura para o servidor central", () => {
    expect(buildCentralDatabaseUrl({
      databaseHost: "192.168.0.10",
      port: 5432,
      databaseName: "portus",
      appUser: "portus_admin",
      appPassword: "senha@segura"
    })).toBe("postgresql://portus_admin:senha%40segura@192.168.0.10:5432/portus");
  });
});
