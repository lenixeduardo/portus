import { describe, expect, it } from "vitest";
import { canCaptureLaboratory, canCloseLaboratory, isLaboratoryUser } from "../../shared/laboratory-access";

describe("controle de acesso da visão Laboratório", () => {
  it("mantém usuários da Produção fora da visão Laboratório", () => {
    const user = { sectorCode: "PRODUCTION" as const };
    expect(isLaboratoryUser(user)).toBe(false);
    expect(canCaptureLaboratory(user)).toBe(false);
    expect(canCloseLaboratory(user)).toBe(false);
  });

  it("permite captura somente ao perfil Captura", () => {
    const user = { sectorCode: "LABORATORY" as const, laboratoryProfile: "capture" as const };
    expect(isLaboratoryUser(user)).toBe(true);
    expect(canCaptureLaboratory(user)).toBe(true);
    expect(canCloseLaboratory(user)).toBe(false);
  });

  it("permite confirmação somente ao perfil Fechamento", () => {
    const user = { sectorCode: "LABORATORY" as const, laboratoryProfile: "closure" as const };
    expect(isLaboratoryUser(user)).toBe(true);
    expect(canCaptureLaboratory(user)).toBe(false);
    expect(canCloseLaboratory(user)).toBe(true);
  });
});
