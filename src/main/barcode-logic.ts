import type { Formula } from "../shared/types";
import type { BarcodeScanResult, ServiceResult } from "../shared/ipc";
import type { BatchWithFormula } from "../shared/ipc";

export interface BarcodeDeps {
  barcode_regex: string | null;
  openBatchesLimit: number;
  getBatchByCode(code: string): BatchWithFormula | null;
  getFormulaByName(name: string): Formula | null;
  countOpenBatches(): number;
  codeExists(code: string): boolean;
  createBatch(formulaId: number, code: string, userId: number): BatchWithFormula;
}

export function processBarcodeValue(
  barcodeValue: string,
  userId: number,
  deps: BarcodeDeps
): ServiceResult<BarcodeScanResult> {
  const raw = barcodeValue.trim();
  if (!raw) return { ok: false, error: "Código de barras vazio." };

  let formulaName: string | null = null;
  let batchCode = raw;

  if (deps.barcode_regex) {
    try {
      const re = new RegExp(deps.barcode_regex);
      const match = re.exec(raw);
      if (match?.groups) {
        if (match.groups["batch_code"]) batchCode = match.groups["batch_code"].trim();
        if (match.groups["formula"]) formulaName = match.groups["formula"].trim();
      } else if (match) {
        // Regex combinou mas não tem grupos nomeados — informa o usuário explicitamente
        return {
          ok: false,
          error:
            "A regex de código de barras não contém os grupos nomeados esperados (batch_code e/ou formula)."
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

  if (!formulaName) {
    return {
      ok: false,
      error: `Lote "${batchCode}" não encontrado. Configure a regex do código de barras para incluir a fórmula e criar automaticamente.`
    };
  }

  const formula = deps.getFormulaByName(formulaName);
  if (!formula) {
    return { ok: false, error: `Fórmula "${formulaName}" não encontrada.` };
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
    const batch = deps.createBatch(formula.id, batchCode, userId);
    return { ok: true, data: { batch, created: true } };
  } catch {
    return { ok: false, error: "Erro ao criar lote." };
  }
}
