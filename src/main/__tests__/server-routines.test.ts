import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ configured: false, mode: "server", backups: 0, exports: 0, pendingBackup: undefined as Promise<void> | undefined }));
vi.mock("electron", () => ({ app: { getPath: () => "C:/audit" } }));
vi.mock("../db/central-connection", () => ({ isCentralDatabaseConfigured: () => state.configured }));
vi.mock("../db/central-station-settings-repo", () => ({ getCentralStationSetting: async (key: string) => key === "installation_mode" ? state.mode : null }));
vi.mock("../db/backup", () => ({ runBackup: async () => { state.backups++; await state.pendingBackup; return { backedUp: true, errors: [], path: "backup.dump" }; } }));
vi.mock("../db/central-auto-export", () => ({ runCentralAutoExport: async () => { state.exports++; return { exported: 0, errors: [] }; } }));

describe("rotinas após configurar servidor", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 12, 22)); state.configured = false; state.mode = "server"; state.backups = 0; state.exports = 0; });
  afterEach(async () => { const routines = await import("../server-routines"); routines.stopServerRoutines(); state.pendingBackup = undefined; vi.useRealTimers(); vi.unstubAllEnvs(); });

  it("começa depois do setup e repetição não duplica backup nem exportação", async () => {
    const { startServerRoutines } = await import("../server-routines");
    await startServerRoutines();
    expect(state.backups).toBe(0);
    state.configured = true;
    await Promise.all([startServerRoutines(), startServerRoutines()]);
    expect(state.backups).toBe(1);
    expect(vi.getTimerCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(state.exports).toBe(1);
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(state.backups).toBe(2);
  });

  it("encerra agendamentos quando a estação passa a cliente", async () => {
    const { startServerRoutines } = await import("../server-routines");
    state.configured = true;
    await startServerRoutines();
    state.mode = "client";
    await startServerRoutines();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(state.backups).toBe(1);
    expect(state.exports).toBe(0);
  });

  it("não rearma backup em andamento depois de passar a cliente", async () => {
    const { startServerRoutines } = await import("../server-routines");
    state.configured = true;
    await startServerRoutines();
    let finish!: () => void;
    state.pendingBackup = new Promise<void>(resolve => { finish = resolve; });
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    state.mode = "client";
    await startServerRoutines();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
