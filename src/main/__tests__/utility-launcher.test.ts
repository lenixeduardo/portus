import { describe, expect, it } from "vitest";
import { getPortusDbUtilityArguments, getPortusDbUtilityScriptPath } from "../utility-launcher";

describe("atalho seguro do DB Utility", () => {
  it("resolve o utilitário na pasta database do projeto em desenvolvimento", () => {
    const file = getPortusDbUtilityScriptPath({
      isPackaged: false,
      appPath: "C:/workspace/portus",
      resourcesPath: "C:/Program Files/Portus/resources"
    });
    expect(file.replaceAll("\\", "/")).toBe("C:/workspace/portus/database/portus-db-utility.ps1");
  });

  it("resolve o utilitário dentro de resources/database no instalador Windows", () => {
    const file = getPortusDbUtilityScriptPath({
      isPackaged: true,
      appPath: "C:/Program Files/Portus/resources/app.asar",
      resourcesPath: "C:/Program Files/Portus/resources"
    });
    expect(file.replaceAll("\\", "/")).toBe("C:/Program Files/Portus/resources/database/portus-db-utility.ps1");
  });

  it("passa o caminho com espaços como argumento separado, sem shell/cmd", () => {
    const script = "C:/Program Files/Portus/resources/database/portus-db-utility.ps1";
    expect(getPortusDbUtilityArguments(script)).toEqual([
      "-NoLogo", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", script
    ]);
  });
});
