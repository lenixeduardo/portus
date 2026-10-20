import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { IPC } from "../../shared/ipc";

const state = vi.hoisted(() => ({
  routes: new Map<string, (...args: any[]) => Promise<any>>(),
  role: "laboratory",
  sector: "LABORATORY",
  active: true,
  auditFails: false,
  finalized: 0,
  captured: 0
}));

vi.mock("electron", () => ({
  ipcMain: { handle: (name: string, handler: (...args: any[]) => Promise<any>) => state.routes.set(name, handler) }
}));
vi.mock("../db/central-connection", () => ({
  checkCentralDatabase: async () => {},
  isCentralDatabaseConfigured: () => true,
  isCentralDatabaseRequired: () => true,
  getCentralDatabaseMode: () => "central",
  centralQuery: async (sql: string) => {
    if (sql.includes("password_hash")) return { rows: [{
      id: 41, username: "lab.qa", password_hash: bcrypt.hashSync("senha12345", 4),
      display_name: "Laboratorio QA", role: state.role, sector_code: state.sector,
      laboratory_profile: "capture", created_at: new Date("2026-10-20T00:00:00Z")
    }] };
    if (sql.includes("FROM users WHERE id=")) return { rows: state.active ? [{ id: 41, role: state.role, sector_code: state.sector }] : [] };
    return { rows: [], rowCount: 1 };
  }
}));
vi.mock("../db/audit-repo", () => ({
  logAudit: async () => { if (state.auditFails) throw new Error("audit offline"); }
}));
vi.mock("../db/central-batches-repo", () => ({
  listCentralOpenBatches: async () => [{ id: 9, code: "1234", completed: true }],
  listCentralAllBatches: async () => [],
  openCentralBatch: async () => ({}),
  setCentralBatchCompleted: async () => ({}),
  finalizeCentralBatch: async () => { state.finalized++; return { id: 9, status: "closed" }; },
  forceCentralBatchClose: async () => ({}),
  reopenCentralBatch: async () => ({}),
  confirmCentralProductionClose: async () => ({}),
  confirmCentralLaboratoryClose: async () => ({})
}));
vi.mock("../db/central-products-repo", () => ({
  getCentralProduct: async () => null,
  findCentralProductByBarcodePrefix: async () => null
}));
vi.mock("../db/central-history-repo", () => ({ getCentralBatchHistory: async () => null }));
vi.mock("../db/central-station-settings-repo", () => ({
  getCentralStationIdentity: async () => ({ sectorCode: "LABORATORY" })
}));
vi.mock("../serial/capture-service", () => ({
  isActive: () => false,
  cancelCapture: async () => {},
  startCapture: async () => { state.captured++; return { ok: true }; },
  completeCapture: async () => ({}),
  getState: () => ({}),
  injectManualReading: async () => ({}),
  skipFirstReading: async () => ({})
}));

import { login, logout } from "../auth/auth-service";
import { registerAuthHandlers } from "../ipc/auth-handlers";
import { registerCentralHandlers } from "../ipc/central-handlers";
import { registerCaptureHandlers } from "../ipc/capture-handlers";

describe("laboratory login -> authenticated operations", () => {
  beforeEach(() => {
    logout();
    state.routes.clear();
    state.role = "laboratory";
    state.sector = "LABORATORY";
    state.active = true;
    state.auditFails = false;
    state.finalized = 0;
    state.captured = 0;
    registerAuthHandlers();
    registerCentralHandlers();
    registerCaptureHandlers();
  });

  it("logs in, lists open batches, starts capture and finalizes without justification", async () => {
    const result = await state.routes.get(IPC.authLogin)!({}, { username: "lab.qa", password: "senha12345" });
    expect(result.ok).toBe(true);
    expect(result.user.role).toBe("operator");
    expect(result.user.sectorCode).toBe("LABORATORY");
    const batches = await state.routes.get(IPC.centralBatchesListOpen)!({});
    expect(batches).toHaveLength(1);
    const capture = await state.routes.get(IPC.captureStart)!({}, { batchId: 9 });
    expect(capture.ok).toBe(true);
    expect(state.captured).toBe(1);
    const closed = await state.routes.get(IPC.centralBatchesFinalize)!({}, { id: 9 });
    expect(closed.ok).toBe(true);
    expect(state.finalized).toBe(1);
  });

  it("keeps authenticated session if login audit insert fails", async () => {
    state.auditFails = true;
    const result = await state.routes.get(IPC.authLogin)!({}, { username: "lab.qa", password: "senha12345" });
    expect(result.ok).toBe(true);
    await expect(state.routes.get(IPC.centralBatchesListOpen)!({})).resolves.toHaveLength(1);
  });

  it("rejects revoked laboratory session", async () => {
    await login("lab.qa", "senha12345");
    state.active = false;
    await expect(state.routes.get(IPC.centralBatchesListOpen)!({})).rejects.toThrow("Sessão revogada");
  });

  it("allows supervisor to finalize without justification", async () => {
    state.role = "supervisor";
    state.sector = "PRODUCTION";
    await login("lab.qa", "senha12345");
    const result = await state.routes.get(IPC.centralBatchesFinalize)!({}, { id: 9 });
    expect(result.ok).toBe(true);
  });
});
