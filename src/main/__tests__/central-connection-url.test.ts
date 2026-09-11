import { describe, expect, it } from "vitest";
import { buildCentralDatabaseUrl } from "../db/central-connection";
import { toCentralTimestamp } from "../db/central-batches-repo";

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

describe("normalização de timestamps do PostgreSQL", () => {
  it("serializa Date para ISO antes de atravessar o IPC", () => {
    expect(toCentralTimestamp(new Date("2026-09-11T05:39:17.000Z")))
      .toBe("2026-09-11T05:39:17.000Z");
    expect(toCentralTimestamp("2026-09-11 05:39:17+00")).toBe("2026-09-11 05:39:17+00");
    expect(toCentralTimestamp(null)).toBe("");
  });
});
