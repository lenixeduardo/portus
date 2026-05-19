import { describe, it, expect } from "vitest";
import { processBarcodeValue, type BarcodeDeps } from "../barcode-logic";
import type { BatchWithProduct } from "../../shared/ipc";
import type { Product } from "../../shared/types";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeBatch(overrides: Partial<BatchWithProduct> = {}): BatchWithProduct {
  return {
    id: 1,
    productId: 10,
    code: "2026-0001",
    status: "open",
    openedAt: "2026-01-01 08:00:00",
    createdBy: 99,
    productName: "Tinta Base A",
    operatorName: "admin",
    readingsCount: 0,
    ...overrides
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 10,
    name: "Tinta Base A",
    createdBy: 99,
    createdAt: "2026-01-01 08:00:00",
    ...overrides
  };
}

function makeDeps(overrides: Partial<BarcodeDeps> = {}): BarcodeDeps {
  return {
    barcode_regex: null,
    openBatchesLimit: 6,
    getBatchByCode: () => null,
    getProductByValue: () => null,
    countOpenBatches: () => 0,
    codeExists: () => false,
    createBatch: () => makeBatch(),
    ...overrides
  };
}

// ─── Teste 1 ─────────────────────────────────────────────────────────────────
// Cenário: código de barras contém o código de um lote já aberto.
// Esperado: retorna o lote existente com created=false, sem tocar no banco.
describe("Teste 1 — lote existente aberto", () => {
  it("retorna o lote aberto sem criar novo", () => {
    const existingBatch = makeBatch({ code: "2026-0001", status: "open" });
    const deps = makeDeps({
      barcode_regex: null,
      getBatchByCode: (code) => (code === "2026-0001" ? existingBatch : null)
    });

    const result = processBarcodeValue("2026-0001", 99, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.created).toBe(false);
    expect(result.data.batch.code).toBe("2026-0001");
    expect(result.data.batch.status).toBe("open");
  });

  it("retorna erro quando o lote encontrado está fechado", () => {
    const closedBatch = makeBatch({ code: "2026-0001", status: "closed" });
    const deps = makeDeps({
      getBatchByCode: () => closedBatch
    });

    const result = processBarcodeValue("2026-0001", 99, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("fechado");
  });
});

// ─── Teste 2 ─────────────────────────────────────────────────────────────────
// Cenário: regex extrai product + batch_code de um barcode composto.
// O lote não existe ainda → sistema cria automaticamente.
// Esperado: retorna o novo lote com created=true.
describe("Teste 2 — criação automática de lote via regex", () => {
  it("cria lote quando regex extrai product e batch_code válidos", () => {
    const newBatch = makeBatch({ id: 2, code: "2026-0042", productName: "Verniz UV" });
    const product = makeProduct({ id: 10, name: "Verniz UV" });

    const deps = makeDeps({
      barcode_regex: "^(?<product>.+)\\|(?<batch_code>.+)$",
      getBatchByCode: () => null,
      getProductByValue: (name) => (name === "Verniz UV" ? product : null),
      codeExists: () => false,
      createBatch: (_pId, code, _uid) => ({ ...newBatch, code })
    });

    const result = processBarcodeValue("Verniz UV|2026-0042", 99, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.created).toBe(true);
    expect(result.data.batch.code).toBe("2026-0042");
    expect(result.data.batch.productName).toBe("Verniz UV");
  });

  it("retorna erro quando regex captura product que não existe", () => {
    const deps = makeDeps({
      barcode_regex: "^(?<product>.+)\\|(?<batch_code>.+)$",
      getBatchByCode: () => null,
      getProductByValue: () => null
    });

    const result = processBarcodeValue("Produto Inexistente|2026-0099", 99, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("não encontrado");
  });

  it("retorna erro quando regex válida não tem grupos nomeados", () => {
    const deps = makeDeps({
      barcode_regex: "^(.+)\\|(.+)$",  // grupos posicionais, sem nome
      getBatchByCode: () => null
    });

    const result = processBarcodeValue("ProdutoA|2026-0001", 99, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("grupos nomeados");
  });
});

// ─── Teste 3 ─────────────────────────────────────────────────────────────────
// Cenário: barcode simples (sem regex) para lote inexistente e sem info de produto.
// Também testa limite de lotes abertos ao tentar criar.
describe("Teste 3 — barcode sem regex e casos de limite", () => {
  it("retorna erro quando lote não existe e não há produto no barcode", () => {
    const deps = makeDeps({
      barcode_regex: null,
      getBatchByCode: () => null
    });

    const result = processBarcodeValue("2026-9999", 99, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("não encontrado");
  });

  it("retorna erro quando limite de lotes abertos é atingido ao criar via barcode", () => {
    const product = makeProduct({ name: "Tinta Base A" });
    const deps = makeDeps({
      barcode_regex: "^(?<product>.+)\\|(?<batch_code>.+)$",
      getBatchByCode: () => null,
      getProductByValue: () => product,
      countOpenBatches: () => 6,  // já no limite
      openBatchesLimit: 6
    });

    const result = processBarcodeValue("Tinta Base A|2026-0010", 99, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("6 lotes abertos");
  });

  it("retorna erro para barcode vazio ou só espaços", () => {
    const deps = makeDeps();

    expect(processBarcodeValue("", 99, deps).ok).toBe(false);
    expect(processBarcodeValue("   ", 99, deps).ok).toBe(false);
  });
});
