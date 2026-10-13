import { describe, expect, it } from "vitest";
import { isSectorCaptureClosed, type CentralCaptureBatchState } from "../db/central-capture-repo";

function batch(overrides: Partial<CentralCaptureBatchState> = {}): CentralCaptureBatchState {
  return {
    id: 1,
    status: "open",
    productionClosed: false,
    laboratoryClosed: false,
    completed: false,
    ...overrides
  };
}

describe("lote único compartilhado entre setores", () => {
  it("não bloqueia Produção por confirmação setorial legada", () => {
    expect(isSectorCaptureClosed(batch({ productionClosed: true }), "PRODUCTION")).toBe(false);
  });

  it("não bloqueia Laboratório por confirmação setorial legada", () => {
    expect(isSectorCaptureClosed(batch({ laboratoryClosed: true }), "LABORATORY")).toBe(false);
  });

  it("mantém as flags antigas sem usá-las como trava de captura", () => {
    expect(isSectorCaptureClosed(batch({ productionClosed: true, laboratoryClosed: true }), "PRODUCTION")).toBe(false);
    expect(isSectorCaptureClosed(batch({ productionClosed: true, laboratoryClosed: true }), "LABORATORY")).toBe(false);
  });
});

describe("bloqueio de leituras após conclusão", () => {
  it("bloqueia Produção quando concluído", () => {
    expect(isSectorCaptureClosed(batch({ completed: true }), "PRODUCTION")).toBe(true);
  });
  it("permite ao Laboratório continuar leituras enquanto não finalizado", () => {
    expect(isSectorCaptureClosed(batch({ completed: true }), "LABORATORY")).toBe(false);
  });
  it("bloqueia ambos os setores após finalização", () => {
    expect(isSectorCaptureClosed(batch({ status: "closed" }), "PRODUCTION")).toBe(true);
    expect(isSectorCaptureClosed(batch({ status: "closed" }), "LABORATORY")).toBe(true);
  });
});
