import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isUserBarcode, normalizeUserBarcode } from "../../shared/user-barcode";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("autenticação e cadastro por etiqueta de usuário", () => {
  it("aceita identificadores textuais reais e normaliza espaços/caixa", () => {
    expect(normalizeUserBarcode("  analista   01 ")).toBe("ANALISTA 01");
    expect(isUserBarcode("ADEMIR")).toBe(true);
    expect(isUserBarcode("ANALISTA 01")).toBe(true);
    expect(isUserBarcode("PRODUCAO 01")).toBe(true);
    expect(isUserBarcode("SIM-2026-1234")).toBe(false);
    expect(isUserBarcode("1234567890123456")).toBe(false);
  });

  it("persiste barcode_value separadamente da senha e com unicidade case-insensitive", () => {
    const migrate = source("src/main/db/migrate.ts");
    const usersRepo = source("src/main/db/users-repo.ts");

    expect(migrate).toContain("020_user_barcode_value");
    expect(migrate).toContain("barcode_value");
    expect(migrate).toContain("idx_users_barcode_value_nocase");
    expect(usersRepo).toContain("getUserByBarcodeValue");
    expect(usersRepo).toContain("bcrypt.hashSync(password, 10)");
    expect(usersRepo).toContain("barcode_value");
  });

  it("expõe login dedicado por etiqueta e preserva login manual", () => {
    const ipc = source("src/shared/ipc.ts");
    const preload = source("src/preload/index.ts");
    const handlers = source("src/main/ipc/auth-handlers.ts");
    const login = source("src/renderer/screens/Login.tsx");

    expect(ipc).toContain('authLoginBarcode: "auth:login-barcode"');
    expect(preload).toContain("loginBarcode:");
    expect(handlers).toContain("loginByBarcode");
    expect(login).toContain("window.api.auth.loginBarcode");
    expect(login).toContain("ignoreFormFields: false");
    expect(login).toContain("window.api.auth.login(credentials)");
  });

  it("abre cadastro automaticamente para etiqueta desconhecida de Admin/Master", () => {
    const app = source("src/renderer/App.tsx");
    const dashboard = source("src/renderer/screens/Dashboard.tsx");
    const registration = source("src/renderer/components/UserBarcodeRegistration.tsx");

    expect(app).toContain("onUnknownUserBarcode={setRequestedUserBarcode}");
    expect(dashboard).toContain("window.api.users.findByBarcode(code)");
    expect(dashboard).toContain("onUnknownUserBarcode(code)");
    expect(registration).toContain("requestedBarcode");
    expect(registration).toContain("window.api.users.findByBarcode(barcode)");
    expect(registration).toContain('title={allowed ? "Cadastrar usuário por etiqueta"');
  });

  it("mantém senha manual separada do barcode durante o cadastro", () => {
    const handlers = source("src/main/ipc/users-handlers.ts");
    const registration = source("src/renderer/components/UserBarcodeRegistration.tsx");

    expect(handlers).toContain("password: z.string().min(8");
    expect(handlers).toContain("input.password");
    expect(handlers).toContain("normalizeUserBarcode(input.barcode)");
    expect(registration).toContain("Senha para login manual");
    expect(registration).toContain("password,");
    expect(registration).not.toContain("Senha permanente");
  });

  it("prioriza usuário conhecido e lote existente antes de sugerir novo usuário", () => {
    const dashboard = source("src/renderer/screens/Dashboard.tsx");
    const userLookup = dashboard.indexOf("window.api.users.findByBarcode(code)");
    const centralBatchLookup = dashboard.indexOf("window.api.central.batches.findByCode(code)");
    const userCandidate = dashboard.indexOf("if (isUserBarcode(code))");

    expect(userLookup).toBeGreaterThan(-1);
    expect(centralBatchLookup).toBeGreaterThan(userLookup);
    expect(userCandidate).toBeGreaterThan(centralBatchLookup);
  });
});
