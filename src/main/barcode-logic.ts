import type { Product } from "../shared/types";
import type { BarcodeScanResult, ServiceResult } from "../shared/ipc";
import type { BatchWithProduct } from "../shared/ipc";

export interface BarcodeDeps {
  barcode_regex: string | null;
  openBatchesLimit: number;
  getBatchByCode(code: string): BatchWithProduct | null;
  getProductByName(name: string): Product | null;
  countOpenBatches(): number;
  codeExists(code: string): boolean;
  createBatch(productId: number, code: string, userId: number): BatchWithProduct;
}

export function processBarcodeValue(
  barcodeValue: string,
  userId: number,
  deps: BarcodeDeps
): ServiceResult<BarcodeScanResult> {
  const raw = barcodeValue.trim();
  if (!raw) return { ok: false, error: "Código de barras vazio." };

  let productName: string | null = null;
  let batchCode = raw;

  if (deps.barcode_regex) {
    try {
      const re = new RegExp(deps.barcode_regex);
      const match = re.exec(raw);
      if (match?.groups) {
        if (match.groups["batch_code"]) batchCode = match.groups["batch_code"].trim();
        if (match.groups["product"]) productName = match.groups["product"].trim();
      } else if (match) {
        // Regex combinou mas não tem grupos nomeados — informa o usuário explicitamente
        return {
          ok: false,
          error:
            "A regex de código de barras não contém os grupos nomeados esperados (batch_code e/ou product)."
        };
      }
      // Sem match: usa raw como batch_code (fallback)
    } catch {
      return { ok: false, error: "Regex de código de barras inválida nas configurações." };
    }
  }

  const existing = deps.getBatchByCode(batchCode);
  if (existing) {
    if (existing.status === "closed") {
      return { ok: false, error: `Lote ${batchCode} está fechado.` };
    }
    return { ok: true, data: { batch: existing, created: false } };
  }

  if (!productName) {
    return {
      ok: false,
      error: `Lote "${batchCode}" não encontrado. Configure a regex do código de barras para incluir o produto e criar automaticamente.`
    };
  }

  const product = deps.getProductByName(productName);
  if (!product) {
    return { ok: false, error: `Produto "${productName}" não encontrado.` };
  }

  if (deps.countOpenBatches() >= deps.openBatchesLimit) {
    return {
      ok: false,
      error: `Já existem ${deps.openBatchesLimit} lotes abertos. Finalize um antes de criar outro.`
    };
  }

  if (deps.codeExists(batchCode)) {
    return { ok: false, error: "Já existe um lote com esse código." };
  }

  try {
    const batch = deps.createBatch(product.id, batchCode, userId);
    return { ok: true, data: { batch, created: true } };
  } catch {
    return { ok: false, error: "Erro ao criar lote." };
  }
}
