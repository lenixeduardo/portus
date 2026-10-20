import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC } from "../../shared/ipc";

const state = vi.hoisted(() => ({
  routes: new Map<string, (...args: any[]) => Promise<any>>(),
  role: "master" as "master" | "admin" | "supervisor" | "operator",
  sector: "ADMIN" as "ADMIN" | "PRODUCTION" | "LABORATORY",
  launches: 0
}));

vi.mock("electron", () => ({
  ipcMain: { handle: (key: string, handler: (...args: any[]) => Promise<any>) => {
    state.routes.set(key, handler);
  } },
  shell: { openExternal: vi.fn() }
}));
vi.mock("../auth/auth-service", () => ({
  getCurrentUser: () => ({
    id: 1, username: "qa.user", role: state.role, sectorCode: state.sector,
    createdAt: "2026-10-19T00:00:00.000Z"
  }),
  touchSession: () => {},
  logout: () => {}
}));
vi.mock("../db/central-connection", () => ({
  centralQuery: async () => ({
    rows: [{ id: 1, role: state.role, sector_code: state.sector }]
  })
}));
vi.mock("../utility-launcher", () => ({
  launchPortusDbUtility: async () => { state.launches += 1; }
}));

import { registerShellHandlers } from "../ipc/shell-handlers";

describe("autorizacao para abrir DB Utility", () => {
  beforeEach(() => {
    state.routes.clear();
    state.launches = 0;
    state.role = "master";
    state.sector = "ADMIN";
    registerShellHandlers();
  });

  it.each(["master", "admin", "supervisor"] as const)("permite abertura ao perfil %s", async role => {
    state.role = role;
    const result = await state.routes.get(IPC.shellOpenDbUtility)!({});
    expect(result).toEqual({ ok: true, data: true });
    expect(state.launches).toBe(1);
  });

  it("permite abertura ao supervisor no setor PRODUCTION", async () => {
    state.role = "supervisor";
    state.sector = "PRODUCTION";
    const result = await state.routes.get(IPC.shellOpenDbUtility)!({});
    expect(result).toEqual({ ok: true, data: true });
    expect(state.launches).toBe(1);
  });

  it.each([
    ["operator", "PRODUCTION"]
  ] as const)("nega abertura ao perfil %s", async (role, sector) => {
    state.role = role;
    state.sector = sector;
    await expect(state.routes.get(IPC.shellOpenDbUtility)!({}))
      .rejects.toThrow("Acesso negado.");
    expect(state.launches).toBe(0);
  });
});
