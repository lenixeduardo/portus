import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("usuários por etiqueta de 16 dígitos", () => {
  it("persiste nome exibido no usuário local e central", () => {
    const migrations = source("src/main/db/migrations.ts");
    const usersRepo = source("src/main/db/users-repo.ts");
    const centralUsers = source("src/main/db/central-users-repo.ts");
    const schemas = source("src/main/validation/schemas.ts");

    expect(migrations).toContain('name: "019_user_display_name"');
    expect(migrations).toContain("ALTER TABLE users ADD COLUMN display_name TEXT");
    expect(usersRepo).toContain("display_name");
    expect(usersRepo).toContain("displayName");
    expect(schemas).toContain("displayName: z");
    expect(centralUsers).toContain("user.displayName ?? user.username");
  });

  it("classifica somente códigos numéricos de exatamente 16 dígitos", () => {
    const classifier = source("src/shared/user-barcode.ts");
    expect(classifier).toContain('/^\\d{16}$/');
    expect(classifier).toContain("isUserBarcode");
  });

  it("permite ao login capturar scanner mesmo com input focado", () => {
    const hook = source("src/renderer/hooks/useBarcodeScanner.ts");
    const login = source("src/renderer/screens/Login.tsx");

    expect(hook).toContain("ignoreFormFields");
    expect(login).toContain("useBarcodeScanner");
    expect(login).toContain("ignoreFormFields: false");
    expect(login).toContain("username: code, password: code");
  });

  it("intercepta etiqueta de usuário antes do fluxo de lote no dashboard", () => {
    const dashboard = source("src/renderer/screens/Dashboard.tsx");
    expect(dashboard).toContain("isUserBarcode(code)");
    expect(dashboard).toContain("pendingUserBarcode");
    expect(dashboard).toContain("Cadastrar usuário por etiqueta");
    expect(dashboard).toContain("password: pendingUserBarcode");
  });

  it("mantém autorização de cadastro no processo principal", () => {
    const usersHandlers = source("src/main/ipc/users-handlers.ts");
    expect(usersHandlers).toContain("compose([requireAdmin, validateInput(createUserSchema)])");
    expect(usersHandlers).toContain('input.role === "master" && actor?.role !== "master"');
  });

  it("mostra reabertura de lote somente ao Master", () => {
    const history = source("src/renderer/screens/History.tsx");
    expect(history).toContain('const canReopenBatch = user.role === "master";');
  });
});
