/**
 * Teste 3 — Código: 2026-TEST3 | Produto: Resina Epóxi
 *   findBatchByCode deve retornar o BatchWithFormula correto,
 *   incluindo o nome do produto (formulaName) associado ao lote.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do módulo query antes de importar o repo
vi.mock("../main/db/query", () => ({
  get: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
}));

import { get } from "../main/db/query";
import { findBatchByCode } from "../main/db/batches-repo";

const mockedGet = vi.mocked(get);

describe("findBatchByCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Teste 3 ─────────────────────────────────────────────────────────────
  it(
    "TESTE 3 | Código: 2026-TEST3 | Produto: Resina Epóxi" +
      " — retorna BatchWithFormula com nome do produto correto para código existente",
    () => {
      const BARCODE = "2026-TEST3";
      const PRODUCT = "Resina Epóxi";

      mockedGet.mockReturnValue({
        id: 3,
        formula_id: 7,
        code: BARCODE,
        status: "open",
        opened_at: "2026-05-19 10:00:00",
        closed_at: null,
        created_by: 1,
        formula_name: PRODUCT,
        operator_name: "admin",
        readings_count: 0,
      });

      const result = findBatchByCode(BARCODE);

      // Código de barras escaneado deve ser encontrado
      expect(result).not.toBeNull();
      expect(result!.code).toBe(BARCODE);

      // Nome do produto deve estar vinculado ao lote
      expect(result!.formulaName).toBe(PRODUCT);

      // Lote deve estar aberto para aceitar captura
      expect(result!.status).toBe("open");

      // Confirma que a query foi chamada com o código correto
      expect(mockedGet).toHaveBeenCalledWith(
        expect.stringContaining("WHERE b.code = ?"),
        BARCODE
      );
    }
  );
});
