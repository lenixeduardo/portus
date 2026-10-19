import { describe, expect, it } from "vitest";
import { getUserViewLabel } from "../user-view-label";

describe("identificacao da view por perfil PORTUS", () => {
  it.each([
    ["supervisor", "PRODUCTION", "Supervisor"],
    ["supervisor", "LABORATORY", "Supervisor"],
    ["operator", "PRODUCTION", "Produção"],
    ["operator", "LABORATORY", "Laboratório"],
    ["master", "ADMIN", "Admin"],
    ["admin", "ADMIN", "Admin"]
  ] as const)("exibe %s (%s) como %s", (role, sector, label) => {
    expect(getUserViewLabel(role, sector)).toBe(label);
  });

  it("prioriza Supervisor quando informado um setor administrativo", () => {
    expect(getUserViewLabel("supervisor", "ADMIN")).toBe("Supervisor");
  });
});
