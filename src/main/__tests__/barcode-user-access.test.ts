import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("usuários por etiqueta de 16 dígitos", () => {
  it("persiste nome exibido no usuário local e central", () => {
    const migrate = source("src/main/db/migrate.ts");
    const usersRepo = source("src/main/db/users-repo.ts");
    const centralUsers = source("src/main/db/central-users-repo.ts");
    const usersHandlers = source("src/main/ipc/users-handlers.ts");

    expect(migrate).toContain('USER_DISPLAY_NAME_MIGRATION = "019_user_display_name"');
    expect(migrate).toContain("ALTER TABLE users ADD COLUMN display_name TEXT");
    expect(usersRepo).toContain("display_name");
    expect(usersRepo).toContain("displayName");
    expect(usersHandlers).toContain("displayName: z.string()");
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

  it("intercepta etiquetas de usuário antes de chegarem ao fluxo de lote", () => {
    const registration = source("src/renderer/components/UserBarcodeRegistration.tsx");
    const sidebar = source("src/renderer/components/Sidebar.tsx");
    const hook = source("src/renderer/hooks/useBarcodeScanner.ts");

    expect(sidebar).toContain("<UserBarcodeRegistration user={user} />");
    expect(registration).toContain("pendingUserBarcode");
    expect(registration).toContain("shouldIntercept: isUserBarcode");
    expect(registration).toContain("password: pendingUserBarcode");
    expect(hook).toContain("e.stopImmediatePropagation()");
  });

  it("mantém autorização de cadastro no processo principal", () => {
    const usersHandlers = source("src/main/ipc/users-handlers.ts");
    expect(usersHandlers).toContain("compose([requireAdmin, validateInput(createUserWithDisplayNameSchema)])");
    expect(usersHandlers).toContain('input.role === "master" && actor?.role !== "master"');
  });

  it("oculta reabertura de lote para perfis que não são Master", () => {
    const registration = source("src/renderer/components/UserBarcodeRegistration.tsx");
    const roleVisibility = source("src/renderer/role-visibility.css");
    expect(registration).toContain("document.documentElement.dataset.userRole = user.role");
    expect(roleVisibility).toContain('html[data-user-role="admin"] .history-reopen-btn');
    expect(roleVisibility).toContain('html[data-user-role="operator"] .history-reopen-btn');
  });
});
