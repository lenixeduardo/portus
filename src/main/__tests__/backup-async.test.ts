import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const child = vi.hoisted(() => ({ execFile: vi.fn(), execFileSync: vi.fn() }));
vi.mock("node:child_process", () => child);
vi.mock("../setup/initial-setup-service", () => ({ findPostgresBin: () => null }));
vi.mock("../db/central-connection", () => ({ getCentralDatabaseUrl: () => "postgresql://operator:secret@localhost:5432/portus" }));
import { runBackup } from "../db/backup";

const folders: string[] = [];
afterEach(() => { vi.clearAllMocks(); for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
function folder() { const value = mkdtempSync(join(tmpdir(), "portus-backup-test-")); folders.push(value); return value; }

describe("backup sem bloquear o processo principal", () => {
  it("continua processando eventos enquanto pg_dump não terminou", async () => {
    let complete!: (error: Error | null, stdout: string, stderr: string) => void;
    child.execFile.mockImplementation((_file, _args, _options, callback) => { complete = callback; });
    const pending = runBackup(folder(), 10);
    expect(pending).toBeInstanceOf(Promise);
    let finished = false;
    void Promise.resolve(pending).then(() => { finished = true; });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(finished).toBe(false);
    complete(null, "", "");
    expect(await pending).toMatchObject({ backedUp: true, errors: [] });
  });

  it("retorna erro de timeout em vez de sucesso e esconde a janela do processo", async () => {
    child.execFile.mockImplementation((_file, _args, options, callback) => {
      expect(options).toMatchObject({ timeout: 120000, windowsHide: true });
      callback(Object.assign(new Error("pg_dump timeout"), { killed: true }), "", "");
    });
    const result = await runBackup(folder(), 10);
    expect(result.backedUp).toBe(false);
    expect(result.errors.join(" ")).toContain("timeout");
  });

  it("serializa backups concorrentes sem bloquear outros eventos", async () => {
    const completions: Array<(error: Error | null, stdout: string, stderr: string) => void> = [];
    child.execFile.mockImplementation((_file, _args, _options, callback) => { completions.push(callback); });
    const first = runBackup(folder(), 10);
    const second = runBackup(folder(), 10);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(completions).toHaveLength(1);
    completions[0](null, "", "");
    await first;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(completions).toHaveLength(2);
    completions[1](null, "", "");
    expect((await second).backedUp).toBe(true);
  });
});
