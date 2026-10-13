import { afterEach, describe, expect, it, vi } from "vitest";
import { IPC } from "../../shared/ipc";
const fixture = vi.hoisted(() => ({ routes: new Map<string, (...args: any[]) => any>(), scheduled: 0, available: true }));
vi.mock("electron", () => ({ app: { isPackaged: false, getAppPath: () => "C:/portus", getPath: () => "C:/profile" }, ipcMain: { handle: (route: string, handler: (...args: any[]) => any) => fixture.routes.set(route, handler) } }));
vi.mock("node:fs", () => ({ existsSync: () => true }));
vi.mock("../db/central-connection", () => ({ buildCentralDatabaseUrl: () => "postgresql://localhost/portus", verifyCentralDatabaseUrl: async () => {}, persistCentralDatabaseUrl: async () => {}, checkCentralDatabase: async () => { if (!fixture.available) throw new Error("offline"); }, isCentralDatabaseConfigured: () => true, isCentralDatabaseRequired: () => true, centralQuery: async () => ({ rows: [{ count: "1" }] }) }));
vi.mock("../db/central-users-repo", () => ({ ensureCentralUserAccess: async () => {} }));
vi.mock("../db/central-station-settings-repo", () => ({ getRuntimeStationCode: () => "SERVER-01", setCentralStationSetting: async () => {} }));
vi.mock("../setup/initial-setup-service", () => ({ detectPostgresServiceStatus: () => "running", findPostgresBin: () => "C:/pg/bin", isInitialSetupCompleted: () => true, markInitialSetupComplete: () => {}, runInitialSetup: async () => {} }));
vi.mock("../server-routines", () => ({ startServerRoutines: async () => { fixture.scheduled++; } }));
import { registerSetupHandlers } from "../ipc/setup-handlers";

afterEach(() => { fixture.scheduled = 0; fixture.available = true; fixture.routes.clear(); });
const input = { installationMode: "server", databaseHost: "localhost", port: 5432, databaseName: "portus", appUser: "portus_app", appPassword: "12345678", postgresBin: "C:/pg/bin", adminUser: "postgres", adminPassword: "test" };
describe("assistente ativa rotinas após validar configuração", () => {
  it("ativa backup e exportação ao finalizar setup servidor", async () => {
    registerSetupHandlers();
    const result = await fixture.routes.get(IPC.setupRun)!({}, input);
    expect(result.ok).toBe(true);
    expect(fixture.scheduled).toBe(1);
  });
  it("não ativa rotinas quando validação final falha", async () => {
    fixture.available = false;
    registerSetupHandlers();
    const result = await fixture.routes.get(IPC.setupRun)!({}, input);
    expect(result.ok).toBe(false);
    expect(fixture.scheduled).toBe(0);
  });
});
