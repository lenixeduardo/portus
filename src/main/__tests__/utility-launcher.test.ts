import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { getPortusDbUtilityArguments, getPortusDbUtilityScriptPath, launchPortusDbUtility } from "../utility-launcher";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), existsSync: vi.fn(() => true) }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("node:fs", () => ({ existsSync: mocks.existsSync }));
vi.mock("electron", () => ({ app: { isPackaged: false, getAppPath: () => "C:/portus" } }));

describe("confirmacao de abertura da janela", () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  let child: EventEmitter & { stdout: PassThrough; stderr: PassThrough; unref: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "win32" });
    child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), unref: vi.fn(), kill: vi.fn() });
    mocks.spawn.mockReturnValue(child);
  });
  afterEach(() => {
    Object.defineProperty(process, "platform", platform);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("nao confirma apenas porque PowerShell iniciou; aguarda a janela Shown", async () => {
    let opened = false;
    const result = launchPortusDbUtility().then(() => { opened = true; });
    child.emit("spawn");
    await Promise.resolve();
    await Promise.resolve();
    expect(opened).toBe(false);
    child.stdout.write("PORTUS_DB_UTILITY_");
    child.stdout.write("READY\r\n");
    await result;
    expect(opened).toBe(true);
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it("retorna o erro de inicializacao quando PowerShell fecha sem abrir janela", async () => {
    const result = launchPortusDbUtility();
    const rejected = expect(result).rejects.toThrow(/falha de inicializacao/);
    child.emit("spawn");
    child.stderr.write("falha de inicializacao");
    child.emit("close", 1);
    await rejected;
  });

  it("recusa encerramento sem janela mesmo com codigo zero", async () => {
    const result = launchPortusDbUtility();
    const rejected = expect(result).rejects.toThrow(/janela/);
    child.emit("close", 0);
    await rejected;
  });

  it("reporta falha de spawn", async () => {
    const result = launchPortusDbUtility();
    const rejected = expect(result).rejects.toThrow(/ENOENT/);
    child.emit("error", new Error("ENOENT"));
    await rejected;
  });

  it("limita espera sem deixar processo invisivel pendurado", async () => {
    vi.useFakeTimers();
    const result = launchPortusDbUtility();
    const rejected = expect(result).rejects.toThrow(/tempo|janela/i);
    child.emit("spawn");
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(child.kill).toHaveBeenCalledOnce();
  });
});

describe("atalho seguro do DB Utility", () => {
  it("resolve o utilitário na pasta database do projeto em desenvolvimento", () => {
    const file = getPortusDbUtilityScriptPath({
      isPackaged: false,
      appPath: "C:/workspace/portus",
      resourcesPath: "C:/Program Files/Portus/resources"
    });
    expect(file.replaceAll("\\", "/")).toBe("C:/workspace/portus/database/portus-db-utility.ps1");
  });

  it("resolve o utilitário dentro de resources/database no instalador Windows", () => {
    const file = getPortusDbUtilityScriptPath({
      isPackaged: true,
      appPath: "C:/Program Files/Portus/resources/app.asar",
      resourcesPath: "C:/Program Files/Portus/resources"
    });
    expect(file.replaceAll("\\", "/")).toBe("C:/Program Files/Portus/resources/database/portus-db-utility.ps1");
  });

  it("passa o caminho com espaços como argumento separado, sem shell/cmd", () => {
    const script = "C:/Program Files/Portus/resources/database/portus-db-utility.ps1";
    expect(getPortusDbUtilityArguments(script)).toEqual([
      "-NoLogo", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", script, "-LaunchedFromPortus"
    ]);
  });
});
