import { describe, expect, it } from "vitest";
import { isSectorCaptureClosed, type CentralCaptureBatchState } from "../db/central-capture-repo";

function batch(overrides: Partial<CentralCaptureBatchState> = {}): CentralCaptureBatchState {
  return {
    id: 1,
    status: "open",
    productionClosed: false,
    laboratoryClosed: false,
    ...overrides
  };
}

describe("bloqueio de nova captura por setor confirmado", () => {
  it("bloqueia nova leitura da Produção após sua confirmação", () => {
    expect(isSectorCaptureClosed(batch({ productionClosed: true }), "PRODUCTION")).toBe(true);
  });

  it("mantém o Laboratório disponível enquanto somente a Produção está confirmada", () => {
    expect(isSectorCaptureClosed(batch({ productionClosed: true }), "LABORATORY")).toBe(false);
  });

  it("bloqueia nova leitura do Laboratório após sua confirmação", () => {
    expect(isSectorCaptureClosed(batch({ laboratoryClosed: true }), "LABORATORY")).toBe(true);
  });
});
