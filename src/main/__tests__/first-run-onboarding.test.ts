import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectPostgresServiceStatus, isInitialSetupCompleted, markInitialSetupComplete } from "../setup/initial-setup-service";

const oldLocal = process.env.LOCALAPPDATA;
const oldApp = process.env.APPDATA;
const dirs: string[] = [];
function isolateStation() {
  const folder = mkdtempSync(join(tmpdir(), "portus-onboarding-"));
  dirs.push(folder);
  process.env.LOCALAPPDATA = folder;
  delete process.env.APPDATA;
  return join(folder, "PORTUS", "installation-state.json");
}
afterEach(() => {
  if (oldLocal === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = oldLocal;
  if (oldApp === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = oldApp;
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});
describe("assistente inicial obrigatorio por estacao", () => {
  it("nao dispensa a primeira abertura por causa de URL ou configuracao antiga", () => {
    isolateStation();
    expect(isInitialSetupCompleted()).toBe(false);
  });
  it("marca conclusao exclusivamente apos configuracao bem-sucedida", () => {
    const filename = isolateStation();
    markInitialSetupComplete("client");
    expect(isInitialSetupCompleted()).toBe(true);
    const state = JSON.parse(readFileSync(filename, "utf8"));
    expect(state).toMatchObject({ schemaVersion: 1, completed: true, installationMode: "client" });
    expect(readFileSync(filename, "utf8")).not.toMatch(/password|postgresql:\/\//i);
  });
  it("recusa arquivo incompleto ou adulterado e exige o assistente novamente", () => {
    const filename = isolateStation();
    markInitialSetupComplete("server");
    writeFileSync(filename, '{"schemaVersion":1,"completed":false,"installationMode":"server"}');
    expect(isInitialSetupCompleted()).toBe(false);
    writeFileSync(filename, "invalid-json");
    expect(isInitialSetupCompleted()).toBe(false);
  });
  it("distingue servico local ativo, parado e ausente sem exigir instalacao em clientes", () => {
    expect(detectPostgresServiceStatus("win32", () => "Running,Stopped")).toBe("running");
    expect(detectPostgresServiceStatus("win32", () => "Stopped")).toBe("stopped");
    expect(detectPostgresServiceStatus("win32", () => "")).toBe("not-found");
    expect(detectPostgresServiceStatus("linux", () => { throw new Error("nao deve executar"); })).toBe("unavailable");
  });
  it("mantem escolha de cliente/setor, verificacao do schema e bloqueio do login", () => {
    const root = process.cwd();
    const handlers = readFileSync(join(root, "src/main/ipc/setup-handlers.ts"), "utf8");
    const screen = readFileSync(join(root, "src/renderer/screens/InitialSetup.tsx"), "utf8");
    const app = readFileSync(join(root, "src/renderer/App.tsx"), "utf8");
    expect(handlers).toContain('stationSectorCode: z.enum(["PRODUCTION", "LABORATORY"])');
    expect(handlers).toContain('await setCentralStationSetting("station_sector_code", input.stationSectorCode!)');
    expect(handlers).toContain("markInitialSetupComplete(input.installationMode)");
    expect(screen).toContain('id="setup-sector"');
    expect(screen).toContain('selectMode("server")');
    expect(screen).toContain('selectMode("client")');
    expect(app).toContain("!setup.setupCompleted");
  });
  it("traduz timeout da conexão central e apresenta trecho do log técnico", () => {
    const root = process.cwd();
    const handlers = readFileSync(join(root, "src/main/ipc/setup-handlers.ts"), "utf8");
    const screen = readFileSync(join(root, "src/renderer/screens/InitialSetup.tsx"), "utf8");
    const css = readFileSync(join(root, "src/renderer/styles.css"), "utf8");
    expect(handlers).toContain("Não foi localizado o banco central PORTUS");
    expect(handlers).toContain("connection terminated due to connection timeout");
    expect(handlers).toContain("Log técnico:");
    expect(handlers).toContain("[conexão protegida]");
    expect(screen).toContain("Trecho do log de erro");
    expect(screen).toContain("setup-error-log");
    expect(css).toContain(".initial-setup-form-wrap .setup-error-panel");
  });
  it("inclui o diagnostico PostgreSQL no utilitario e no ZIP independente", () => {
    const root = process.cwd();
    const utility = readFileSync(join(root, "database/portus-db-utility.ps1"), "utf8");
    const helper = readFileSync(join(root, "database/portus-postgres-discovery.ps1"), "utf8");
    const packager = readFileSync(join(root, "scripts/package-database-installer.mjs"), "utf8");
    expect(utility).toContain('$diagnoseButton.Add_Click');
    expect(utility).toContain("Show-PostgresDiscovery");
    expect(helper).toContain('State = $state');
    expect(helper).toContain('"server-stopped"');
    expect(helper).toContain('"not-detected"');
    expect(packager).toContain('"portus-postgres-discovery.ps1"');
  });
});
