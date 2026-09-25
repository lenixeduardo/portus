import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("autenticação e cadastro de usuários por etiqueta", () => {
  it("aceita etiquetas textuais e não depende mais de 16 dígitos", () => {
    const classifier = source("src/shared/user-barcode.ts");
    expect(classifier).toContain("normalizeUserBarcode");
    expect(classifier).toContain("ASCII_LETTER");
    expect(classifier).toContain("USER_BARCODE_MAX_LENGTH = 64");
    expect(classifier).not.toContain('/^\\d{16}$/');
  });

  it("persiste barcode_value separado da senha e com unicidade case-insensitive", () => {
    const migrate = source("src/main/db/migrate.ts");
    const usersRepo = source("src/main/db/users-repo.ts");

    expect(migrate).toContain('USER_BARCODE_MIGRATION = "020_user_barcode_value"');
    expect(migrate).toContain("ALTER TABLE users ADD COLUMN barcode_value TEXT");
    expect(migrate).toContain("idx_users_barcode_value_nocase");
    expect(usersRepo).toContain("bcrypt.hashSync(password, 10)");
    expect(usersRepo).toContain("barcode_value");
    expect(usersRepo).toContain("getUserByBarcodeValue");
    expect(usersRepo).toContain("normalizeUserBarcode");
  });

  it("cadastra a etiqueta como credencial própria e mantém senha manual independente", () => {
    const handlers = source("src/main/ipc/users-handlers.ts");

    expect(handlers).toContain("barcodeUserRegistrationSchema");
    expect(handlers).toContain("password: z.string().min(8");
    expect(handlers).toContain("getUserByBarcodeValue(barcode)");
    expect(handlers).toContain("input.password");
    expect(handlers).toContain("barcode");
    expect(handlers).toContain("ensureCentralUserAccess");
    expect(handlers).not.toContain("createUser(\n          username,\n          input.barcode");
  });

  it("expõe busca e login dedicados por etiqueta no IPC e preload", () => {
    const ipc = source("src/shared/ipc.ts");
    const preload = source("src/preload/index.ts");

    expect(ipc).toContain('authLoginBarcode: "auth:login-barcode"');
    expect(ipc).toContain('usersFindByBarcode: "users:find-by-barcode"');
    expect(ipc).toContain("loginBarcode(req: BarcodeLoginRequest)");
    expect(ipc).toContain("findByBarcode(barcodeValue: string)");
    expect(preload).toContain("IPC.authLoginBarcode");
    expect(preload).toContain("IPC.usersFindByBarcode");
  });

  it("cria sessão diretamente pela etiqueta e registra auditoria sem gravar o valor lido", () => {
    const authService = source("src/main/auth/auth-service.ts");
    const authHandlers = source("src/main/ipc/auth-handlers.ts");

    expect(authService).toContain("export function loginByBarcode");
    expect(authService).toContain("getUserByBarcodeValue(barcodeValue)");
    expect(authHandlers).toContain("IPC.authLoginBarcode");
    expect(authHandlers).toContain('"auth.login_barcode"');
    expect(authHandlers).toContain('"Etiqueta não cadastrada."');
  });

  it("faz login pelo scanner na tela de autenticação e mantém usuário e senha como fallback", () => {
    const login = source("src/renderer/screens/Login.tsx");

    expect(login).toContain("useBarcodeScanner");
    expect(login).toContain("window.api.auth.loginBarcode");
    expect(login).toContain("ignoreFormFields: false");
    expect(login).toContain("window.api.auth.login(credentials)");
    expect(login).toContain("Passe a etiqueta no leitor");
  });

  it("abre o cadastro automaticamente para etiqueta desconhecida e pede senha manual", () => {
    const registration = source("src/renderer/components/UserBarcodeRegistration.tsx");

    expect(registration).toContain("window.api.users.findByBarcode");
    expect(registration).toContain('title={allowed ? "Cadastrar usuário por etiqueta"');
    expect(registration).toContain("Senha para login manual");
    expect(registration).toContain("password,");
    expect(registration).toContain("shouldIntercept: isUserBarcode");
    expect(registration).not.toContain("Sim, é um usuário");
    expect(registration).not.toContain("Senha permanente");
  });

  it("no dashboard prioriza usuário conhecido, depois lote e só então cadastro", () => {
    const dashboard = source("src/renderer/screens/Dashboard.tsx");

    const userLookup = dashboard.indexOf("window.api.users.findByBarcode(code)");
    const centralBatchLookup = dashboard.indexOf("window.api.central.batches.findByCode(code)");
    const registration = dashboard.indexOf("onUnknownUserBarcode(code)");

    expect(userLookup).toBeGreaterThan(-1);
    expect(centralBatchLookup).toBeGreaterThan(userLookup);
    expect(registration).toBeGreaterThan(centralBatchLookup);
    expect(dashboard).toContain("Etiqueta de usuário não cadastrada");
  });

  it("mantém geração de username pelo nome e resolve colisões", () => {
    const registration = source("src/main/users/barcode-user-registration.ts");
    expect(registration).toContain("export function normalizeUsername");
    expect(registration).toContain('normalize("NFD")');
    expect(registration).toContain("export function generateUniqueUsername");
    expect(registration).toContain("let suffix = 2");
  });
});
