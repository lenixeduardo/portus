import { describe, expect, it } from "vitest";
import { canReopenFinalizedBatch } from "../../shared/batch-permissions";

describe("autorização para reabertura de lote finalizado", () => {
  it.each(["admin", "supervisor", "master"] as const)(
    "permite reabertura para o perfil %s",
    (role) => expect(canReopenFinalizedBatch(role)).toBe(true)
  );

  it("bloqueia a reabertura pelo operador", () => {
    expect(canReopenFinalizedBatch("operator")).toBe(false);
  });
});
