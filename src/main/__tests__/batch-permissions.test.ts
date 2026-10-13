import { describe, expect, it } from "vitest";
import { canReopenFinalizedBatch, canSetBatchCompleted, canFinalizeBatch } from "../../shared/batch-permissions";

describe("permissões de lote por credencial", () => {
  it.each(["supervisor", "master"] as const)("permite reabertura para %s", role => {
    expect(canReopenFinalizedBatch(role)).toBe(true);
  });
  it.each(["admin", "operator"] as const)("bloqueia reabertura para %s", role => {
    expect(canReopenFinalizedBatch(role)).toBe(false);
  });
  it("Master pode concluir e desmarcar em qualquer setor operacional", () => {
    expect(canSetBatchCompleted("master", "PRODUCTION", true)).toBe(true);
    expect(canSetBatchCompleted("master", "PRODUCTION", false)).toBe(true);
    expect(canSetBatchCompleted("master", "LABORATORY", false)).toBe(true);
  });
  it("produção conclui, mas não desmarca", () => {
    expect(canSetBatchCompleted("operator", "PRODUCTION", true)).toBe(true);
    expect(canSetBatchCompleted("operator", "PRODUCTION", false)).toBe(false);
  });
  it("laboratório conclui e desmarca", () => {
    expect(canSetBatchCompleted("operator", "LABORATORY", true)).toBe(true);
    expect(canSetBatchCompleted("operator", "LABORATORY", false)).toBe(true);
  });
  it("laboratório e Master finalizam", () => {
    expect(canFinalizeBatch("operator", "LABORATORY")).toBe(true);
    expect(canFinalizeBatch("operator", "PRODUCTION")).toBe(false);
    expect(canFinalizeBatch("master", "LABORATORY")).toBe(true);
    expect(canFinalizeBatch("master", "PRODUCTION")).toBe(true);
  });
});
