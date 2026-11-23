import type { BarcodeScanResponse, BatchInput, BatchWithProduct } from "../../shared/ipc";
import type { Product } from "../../shared/types";

export interface BarcodeScanApi {
  products: { list(): Promise<Product[]> };
  batches: { scanBarcode(input: { barcodeValue: string }): Promise<BarcodeScanResponse> };
  central: {
    batches: {
      findByCode(code: string, productId?: number): Promise<BatchWithProduct | null>;
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

  // Não associar uma etiqueta ao primeiro produto do catálogo por padrão.
  if (productId == null) {
    return { ok: false, error: "Identifique o produto para localizar ou criar o lote." };
  }
  const selectedProductId = productId;
  const existing = await api.central.batches.findByCode(barcodeValue, selectedProductId);
  if (existing) return { ok: true, data: { batch: existing, created: false } };

  const created = await api.central.batches.create({ productId: selectedProductId, code: barcodeValue });
  return created.ok
    ? { ok: true, data: { batch: created.data, created: true } }
    : created;
}
