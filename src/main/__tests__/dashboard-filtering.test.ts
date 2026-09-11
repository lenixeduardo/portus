import { describe, expect, it } from "vitest";
import type { BatchWithProduct } from "../../shared/ipc";
import {
  batchMatchesOpenedDate,
  filterAndSortActiveBatches,
  getProductFilterOptions,
  parseBatchDate
} from "../../renderer/screens/dashboard-filtering";

const batches: BatchWithProduct[] = [
  {
    id: 1,
    productId: 10,
    code: "LOT-002",
    status: "open",
    openedAt: "2026-09-11T13:00:00-03:00",
    createdBy: 1,
    productName: "Produto Beta",
    operatorName: "Operador B",
    readingsCount: 2,
    productionClosed: false,
    laboratoryClosed: true
  },
  {
    id: 2,
    productId: 20,
    code: "LOT-001",
    status: "open",
    openedAt: "2026-09-10T09:30:00-03:00",
    createdBy: 1,
    productName: "Produto Alfa",
    operatorName: "Operador A",
    readingsCount: 1,
    productionClosed: true,
    laboratoryClosed: false
  },
  {
    id: 3,
    productId: 10,
    code: "LOT-003",
    status: "open",
    openedAt: "2026-09-11T08:00:00-03:00",
    createdBy: 1,
    productName: "Produto Beta",
    operatorName: "Operador C",
    readingsCount: 0,
    productionClosed: false,
    laboratoryClosed: false
  }
];

describe("dashboard active batch filtering", () => {
  it("normaliza datas válidas e rejeita valores inválidos", () => {
    expect(parseBatchDate("2026-09-11 12:00:00")?.toISOString()).toBe("2026-09-11T12:00:00.000Z");
    expect(parseBatchDate("invalid")).toBeNull();
  });

  it("filtra por setor, produto e data de abertura", () => {
    const result = filterAndSortActiveBatches(batches, {
      sector: "PRODUCTION",
      productId: "10",
      openedOn: "2026-09-11",
      sortDirection: "DESC"
    });

    expect(result.map((batch) => batch.code)).toEqual(["LOT-002", "LOT-003"]);
  });

  it("ordena por abertura crescente e decrescente", () => {
    const ascending = filterAndSortActiveBatches(batches, {
      sector: "ALL",
      productId: "ALL",
      openedOn: "",
      sortDirection: "ASC"
    });
    const descending = filterAndSortActiveBatches(batches, {
      sector: "ALL",
      productId: "ALL",
      openedOn: "",
      sortDirection: "DESC"
    });

    expect(ascending.map((batch) => batch.code)).toEqual(["LOT-001", "LOT-003", "LOT-002"]);
    expect(descending.map((batch) => batch.code)).toEqual(["LOT-002", "LOT-003", "LOT-001"]);
  });

  it("compara a data de abertura pela data local exibida", () => {
    expect(batchMatchesOpenedDate("2026-09-11T13:00:00-03:00", "2026-09-11")).toBe(true);
    expect(batchMatchesOpenedDate("2026-09-10T23:00:00-03:00", "2026-09-11")).toBe(false);
  });

  it("gera opções únicas de produto em ordem alfabética", () => {
    expect(getProductFilterOptions(batches)).toEqual([
      { id: "20", name: "Produto Alfa" },
      { id: "10", name: "Produto Beta" }
    ]);
  });
});
