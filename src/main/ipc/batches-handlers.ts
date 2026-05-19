import { ipcMain } from "electron";
import {
  IPC,
  type BarcodeScanInput,
  type BarcodeScanResult,
  type BatchInput,
  type BatchWithFormula,
  type ServiceResult
} from "../../shared/ipc";
import { getCurrentUser } from "../auth/auth-service";
import {
  closeBatch,
  codeExists,
  countOpenBatches,
  createBatch,
  generateBatchCode,
  getBatchByCode,
  getBatchWithFormula,
  listOpenBatches
} from "../db/batches-repo";
import { getFormula, getFormulaByName } from "../db/formulas-repo";
import { getSetting } from "../db/settings-repo";

const OPEN_BATCHES_SOFT_LIMIT = 6;

export function registerBatchesHandlers(): void {
  ipcMain.handle(IPC.batchesListOpen, (): BatchWithFormula[] => listOpenBatches());

  ipcMain.handle(IPC.batchesCreate, (_e, input: BatchInput): ServiceResult<BatchWithFormula> => {
    const user = getCurrentUser();
    if (!user) return { ok: false, error: "Sessão expirada." };
    if (!input?.formulaId || !getFormula(input.formulaId)) {
      return { ok: false, error: "Fórmula inválida." };
    }
    if (countOpenBatches() >= OPEN_BATCHES_SOFT_LIMIT) {
      return {
        ok: false,
        error: `Já existem ${OPEN_BATCHES_SOFT_LIMIT} lotes abertos. Finalize um antes de criar outro.`
      };
    }
    let code = (input.code ?? "").trim();
    if (!code) code = generateBatchCode();
    if (codeExists(code)) return { ok: false, error: "Já existe um lote com esse código." };

    try {
      const batch = createBatch(input.formulaId, code, user.id);
      return { ok: true, data: batch };
    } catch {
      return { ok: false, error: "Erro ao criar lote." };
    }
  });

  ipcMain.handle(IPC.batchesClose, (_e, id: number): ServiceResult<true> => {
    if (!getCurrentUser()) return { ok: false, error: "Sessão expirada." };
    const batch = getBatchWithFormula(id);
    if (!batch) return { ok: false, error: "Lote não encontrado." };
    if (batch.status === "closed") return { ok: false, error: "Lote já está fechado." };
    closeBatch(id);
    return { ok: true, data: true };
  });

  ipcMain.handle(
    IPC.batchesScanBarcode,
    (_e, input: BarcodeScanInput): ServiceResult<BarcodeScanResult> => {
      const user = getCurrentUser();
      if (!user) return { ok: false, error: "Sessão expirada." };

      const raw = (input?.barcodeValue ?? "").trim();
      if (!raw) return { ok: false, error: "Código de barras vazio." };

      let formulaName: string | null = null;
      let batchCode: string = raw;

      const regexSetting = getSetting("barcode_regex");
      if (regexSetting) {
        try {
          const re = new RegExp(regexSetting);
          const match = re.exec(raw);
          if (match?.groups) {
            if (match.groups["batch_code"]) batchCode = match.groups["batch_code"].trim();
            if (match.groups["formula"]) formulaName = match.groups["formula"].trim();
          }
        } catch {
          return { ok: false, error: "Regex de código de barras inválida nas configurações." };
        }
      }

      const existing = getBatchByCode(batchCode);
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

      const formula = getFormulaByName(formulaName);
      if (!formula) {
        return { ok: false, error: `Fórmula "${formulaName}" não encontrada.` };
      }

      if (countOpenBatches() >= OPEN_BATCHES_SOFT_LIMIT) {
        return {
          ok: false,
          error: `Já existem ${OPEN_BATCHES_SOFT_LIMIT} lotes abertos. Finalize um antes de criar outro.`
        };
      }

      if (codeExists(batchCode)) {
        return { ok: false, error: "Já existe um lote com esse código." };
      }

      try {
        const batch = createBatch(formula.id, batchCode, user.id);
        return { ok: true, data: { batch, created: true } };
      } catch {
        return { ok: false, error: "Erro ao criar lote." };
      }
    }
  );
}
