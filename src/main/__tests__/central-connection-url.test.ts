import { describe, expect, it } from "vitest";
import { buildCentralDatabaseUrl } from "../db/central-connection";
import { toBatch, toCentralTimestamp } from "../db/central-batches-repo";

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

  it("expõe as leituras concluídas por setor no lote", () => {
    const batch = toBatch({
      id: "123",
      code: "LOT-123",
      status: "open",
      opened_at: "2026-09-11 05:39:17+00",
      closed_at: null,
      closed_by: null,
      created_by: "7",
      product_id: "4",
      product_name: "Produto",
      readings_count: "3",
      production_readings_count: "2",
      laboratory_readings_count: "1",
      operator_name: "admin",
      production_closed: false,
      laboratory_closed: false,
      stage: "production",
      reading_previews: []
    });

    expect(batch.productionReadingsCount).toBe(2);
    expect(batch.laboratoryReadingsCount).toBe(1);
  });
});
