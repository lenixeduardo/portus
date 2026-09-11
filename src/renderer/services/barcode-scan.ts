import type { BarcodeScanResponse, BatchInput, BatchWithProduct } from "../../shared/ipc";
import type { Product } from "../../shared/types";

export interface BarcodeScanApi {
  products: { list(): Promise<Product[]> };
  batches: { scanBarcode(input: { barcodeValue: string }): Promise<BarcodeScanResponse> };
  central: {
    batches: {
      findByCode(code: string): Promise<BatchWithProduct | null>;
      create(input: BatchInput): Promise<{ ok: true; data: BatchWithProduct } | { ok: false; error: string }>;
    };
  };
}

export async function scanBarcodeByMode(
  api: BarcodeScanApi,
  barcodeValue: string,
  centralMode: boolean,
  productId: number | null
): Promise<BarcodeScanResponse> {
  if (!centralMode) return api.batches.scanBarcode({ barcodeValue });

  const existing = await api.central.batches.findByCode(barcodeValue);
  if (existing) return { ok: true, data: { batch: existing, created: false } };

  let selectedProductId = productId;
  if (selectedProductId == null) {
    selectedProductId = (await api.products.list())[0]?.id ?? null;
  }
  if (selectedProductId == null) {
    return { ok: false, error: "Cadastre um produto antes de criar o lote." };
  }

  const created = await api.central.batches.create({ productId: selectedProductId, code: barcodeValue });
  return created.ok
    ? { ok: true, data: { batch: created.data, created: true } }
    : created;
}
