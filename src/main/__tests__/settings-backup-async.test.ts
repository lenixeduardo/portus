import { expect, it, vi } from "vitest";
import { IPC } from "../../shared/ipc";
const fixture = vi.hoisted(() => ({ routes: new Map<string, (...args: any[]) => any>(), result: undefined as Promise<any> | undefined }));
vi.mock("electron", () => ({ app: { getPath: () => "C:/documents" }, dialog: {}, ipcMain: { handle: (route: string, handler: (...args: any[]) => any) => fixture.routes.set(route, handler) } }));
vi.mock("../db/central-station-settings-repo", () => ({ listCentralStationSettings: async () => ({}), setCentralStationSetting: async () => {}, getCentralStationSetting: async () => "server", getRuntimeStationCode: () => "SERVER-01" }));
vi.mock("../auth/auth-service", () => ({ getCurrentUser: () => ({ id: 1, username: "admin", role: "master", sectorCode: "ADMIN", createdAt: "2026-10-12" }), touchSession: () => {}, logout: () => {} }));
vi.mock("../db/central-connection", () => ({ centralQuery: async () => ({ rows: [{ id: 1, role: "master", sector_code: "ADMIN" }] }) }));
vi.mock("../db/audit-repo", () => ({ logAudit: async () => {} }));
vi.mock("../db/backup", () => ({ runBackup: () => fixture.result }));
import { registerSettingsHandlers } from "../ipc/settings-handlers";

it("backup manual responde somente depois de pg_dump terminar", async () => {
  let complete!: (value: any) => void;
  fixture.result = new Promise(resolve => { complete = resolve; });
  registerSettingsHandlers();
  const response = fixture.routes.get(IPC.settingsBackupNow)!({});
  let finished = false;
  void response.then(() => { finished = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(finished).toBe(false);
  complete({ backedUp: true, path: "C:/documents/backup.dump", errors: [] });
  expect(await response).toEqual({ ok: true, data: { path: "C:/documents/backup.dump" } });
});
