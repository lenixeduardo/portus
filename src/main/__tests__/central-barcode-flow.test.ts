import { describe, expect, it, vi } from "vitest";
import type { BatchWithProduct } from "../../shared/ipc";
import { scanBarcodeByMode, type BarcodeScanApi } from "../../renderer/services/barcode-scan";

function batch(code: string): BatchWithProduct {
  return {
    id: 12,
    productId: 3,
    code,
    status: "open",
    openedAt: "2026-09-11T00:00:00Z",
    createdBy: 1,
    productName: "Produto teste",
    operatorName: "admin",
    readingsCount: 0
  };
}

function api(existing: BatchWithProduct | null = null): BarcodeScanApi {
  return {
    products: { list: vi.fn(async () => [{ id: 3, name: "Produto teste", createdBy: 1, createdAt: "2026-09-11" }]) },
    batches: { scanBarcode: vi.fn(async () => ({ ok: false as const, error: "API local não deveria ser chamada" })) },
    central: {
      batches: {
        findByCode: vi.fn(async () => existing),
        create: vi.fn(async ({ code }) => ({ ok: true as const, data: batch(code ?? "") }))
      }
    }
  };
}

describe("scanner de lote no modo PostgreSQL central", () => {
  it("abre o lote central existente sem chamar a API local", async () => {
    const mockApi = api(batch("LOTE-001"));
    const result = await scanBarcodeByMode(mockApi, "LOTE-001", true, 3);

    expect(result.ok).toBe(true);
    expect(mockApi.batches.scanBarcode).not.toHaveBeenCalled();
    expect(mockApi.central.batches.create).not.toHaveBeenCalled();
  });

  it("cria um lote central com o produto selecionado sem chamar a API local", async () => {
    const mockApi = api();
    const result = await scanBarcodeByMode(mockApi, "LOTE-002", true, 3);

    expect(result.ok).toBe(true);
    expect(mockApi.central.batches.create).toHaveBeenCalledWith({ productId: 3, code: "LOTE-002" });
    expect(mockApi.batches.scanBarcode).not.toHaveBeenCalled();
  });
});
