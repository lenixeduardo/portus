import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IPC } from "../../shared/ipc";
const state = vi.hoisted(() => ({ routes: new Map<string, (...args: any[]) => any>(), attempts: 0, offline: true, downloads: 0, external: vi.fn(), quit: vi.fn(), capture: false, spawn: vi.fn(), spawnFails: false }));
vi.mock("electron", () => ({
  app: { isPackaged: true, getVersion: () => "0.1.27", getPath: () => "/downloads", quit: state.quit },
  ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => state.routes.set(name, handler) },
  net: { fetch: async () => {
    state.attempts++;
    if (state.offline) throw new Error("offline");
    return new Response(JSON.stringify({ tag_name: "v0.1.35", draft: false, prerelease: false,
      assets: [{ name: "PORTUS-Update-0.1.35-x64.zip", digest: `sha256:${"a".repeat(64)}`, browser_download_url: "https://github.com/lenixeduardo/portus/releases/download/v0.1.35/PORTUS-Update-0.1.35-x64.zip" }] }));
  } }, shell: { openExternal: state.external }
}));
vi.mock("../update-download", () => ({ downloadUpdate: async () => { state.downloads++; return "/downloads/PORTUS-Update-0.1.35-x64.zip"; } }));
vi.mock("../serial/capture-service", () => ({ isActive: () => state.capture }));
vi.mock("../update-apply", () => ({ startFileUpdate: async (...args: any[]) => {
  state.spawn(...args);
  if (state.spawnFails) throw new Error("acesso negado");
  return async () => {};
} }));
import { registerUpdateHandlers } from "../ipc/update-handlers";
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
beforeEach(() => {
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  state.routes.clear(); state.attempts = 0; state.downloads = 0; state.offline = true; state.external.mockClear(); state.capture = false; state.spawnFails = false; state.quit.mockClear(); state.spawn.mockClear();
  Object.defineProperty(process, "resourcesPath", { value: "/resources", configurable: true });
  registerUpdateHandlers();
});
afterEach(() => Object.defineProperty(process, "platform", platform));

describe("IPC de atualização", () => {
  it("repete a consulta após falha de rede, em vez de guardar null por toda a sessão", async () => {
    expect(await state.routes.get(IPC.updatesCheck)!()).toBeNull();
    state.offline = false;
    expect(await state.routes.get(IPC.updatesCheck)!()).toMatchObject({ version: "0.1.35" });
  });
  it("baixa pelo processo principal sem abrir navegador", async () => {
    state.offline = false;
    const event = { sender: { isDestroyed: () => false, send: vi.fn() } };
    expect(await state.routes.get(IPC.updatesDownload)!(event)).toEqual({ ok: true, data: true });
    expect(state.downloads).toBe(1);
    expect(state.external).not.toHaveBeenCalled();
  });
});

const event = { sender: { isDestroyed: () => false, send: vi.fn() } };
it("instala na pasta atual e encerra o app somente após preparar os arquivos", async () => {
  state.offline = false;
  await state.routes.get(IPC.updatesDownload)!(event);
  const executable = Object.getOwnPropertyDescriptor(process, "execPath")!;
  Object.defineProperty(process, "execPath", { value: "C:\\Program Files\\PORTUS\\Portus.exe", configurable: true });
  try {
    expect(await state.routes.get(IPC.updatesInstall)!()).toEqual({ ok: true, data: true });
    expect(state.spawn.mock.calls[0][0]).toMatch(/PORTUS-Update-.*\.zip$/);
    expect(state.spawn.mock.calls[0][2]).toBe("C:\\Program Files\\PORTUS\\Portus.exe");
    await new Promise(resolve => setImmediate(resolve));
    expect(state.quit).toHaveBeenCalledOnce();
  } finally { Object.defineProperty(process, "execPath", executable); }
});
it("bloqueia instalação sem download ou durante captura", async () => {
  expect((await state.routes.get(IPC.updatesInstall)!()).ok).toBe(false);
  state.offline = false;
  await state.routes.get(IPC.updatesDownload)!(event);
  state.capture = true;
  expect((await state.routes.get(IPC.updatesInstall)!()).error).toMatch(/captura/);
  expect(state.spawn).not.toHaveBeenCalled();
});
it("mantém o PORTUS aberto se não conseguir preparar os arquivos", async () => {
  state.offline = false;
  await state.routes.get(IPC.updatesDownload)!(event);
  state.spawnFails = true;
  expect((await state.routes.get(IPC.updatesInstall)!()).ok).toBe(false);
  expect(state.quit).not.toHaveBeenCalled();
});
