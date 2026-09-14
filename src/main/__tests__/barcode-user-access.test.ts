import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("cadastro de usuários por etiqueta de 16 dígitos", () => {
  it("classifica somente códigos numéricos de exatamente 16 dígitos", () => {
    const classifier = source("src/shared/user-barcode.ts");
    expect(classifier).toContain('/^\\d{16}$/');
    expect(classifier).toContain("isUserBarcode");
  });

  it("gera username pelo nome e resolve colisões com sufixo numérico", () => {
    const registration = source("src/main/users/barcode-user-registration.ts");
    expect(registration).toContain("export function normalizeUsername");
    expect(registration).toContain("normalize(\"NFD\")");
    expect(registration).toContain("export function generateUniqueUsername");
    expect(registration).toContain("let suffix = 2");
    expect(registration).toContain("`${base}${suffix}`");
  });

  it("mantém validação e criação do cadastro por etiqueta no processo principal", () => {
    const handlers = source("src/main/ipc/users-handlers.ts");
    expect(handlers).toContain("barcodeUserRegistrationSchema");
    expect(handlers).toContain('z.string().regex(/^\\d{16}$/');
    expect(handlers).toContain('z.enum(["production", "laboratory_capture", "laboratory_closure"])');
    expect(handlers).toContain("generateUniqueUsername");
    expect(handlers).toContain("createUser(");
    expect(handlers).toContain("ensureCentralUserAccess");
    expect(handlers).toContain("compose([requireAdmin, validateInput(barcodeUserRegistrationSchema)])");
  });

  it("expõe contrato dedicado sem permitir Admin ou Master no payload", () => {
    const ipc = source("src/shared/ipc.ts");
    const preload = source("src/preload/index.ts");
    expect(ipc).toContain('usersRegisterBarcode: "users:register-barcode"');
    expect(ipc).toContain('export type BarcodeUserProfile = "production" | "laboratory_capture" | "laboratory_closure"');
    expect(ipc).toContain("export interface BarcodeUserRegistrationInput");
    expect(preload).toContain("registerBarcode:");
    expect(preload).toContain("IPC.usersRegisterBarcode");
  });

  it("intercepta a etiqueta antes do fluxo de lote e oferece somente perfis operacionais", () => {
    const registration = source("src/renderer/components/UserBarcodeRegistration.tsx");
    const hook = source("src/renderer/hooks/useBarcodeScanner.ts");

    expect(registration).toContain("shouldIntercept: isUserBarcode");
    expect(hook).toContain("e.stopImmediatePropagation()");
    expect(registration).toContain('value="production"');
    expect(registration).toContain('value="laboratory_capture"');
    expect(registration).toContain('value="laboratory_closure"');
    expect(registration).not.toContain('<option value="admin">');
    expect(registration).not.toContain('<option value="master">');
    expect(registration).toContain("Senha permanente");
    expect(registration).toContain("registerBarcode");
  });

  it("não adiciona login automático pela etiqueta", () => {
    const login = source("src/renderer/screens/Login.tsx");
    expect(login).not.toContain("username: code, password: code");
    expect(login).not.toContain("ignoreFormFields: false");
  });

  it("persiste senha pela rotina bcrypt existente e nome exibido local/centralmente", () => {
    const usersRepo = source("src/main/db/users-repo.ts");
    const centralUsers = source("src/main/db/central-users-repo.ts");
    expect(usersRepo).toContain("bcrypt.hashSync(password, 10)");
    expect(usersRepo).toContain("display_name");
    expect(centralUsers).toContain("user.displayName ?? user.username");
  });
});
