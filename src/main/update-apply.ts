import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, win32 } from "node:path";
import type { AvailableUpdate } from "../shared/ipc";

export async function startFileUpdate(archive: string, update: AvailableUpdate, executable: string, script: string): Promise<() => Promise<void>> {
  const directory = join(win32.dirname(archive), `apply-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const helper = join(directory, "apply-update.ps1");
  const configPath = join(directory, "apply-config.json");
  await copyFile(script, helper);
  await writeFile(configPath, JSON.stringify({ archive, sha256: update.sha256, version: update.version,
    installDir: win32.dirname(executable), executable, parentPid: process.pid }), "utf8");
  const cancel = async () => { await writeFile(join(directory, "cancel"), "cancel", "utf8"); };
  const child = spawn(win32.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", helper, "-ConfigPath", configPath],
    { detached: true, stdio: "ignore", windowsHide: true });
  await new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("spawn", resolve); });
  child.unref();
  // Wait until archive validation and any required UAC prompt finish, keeping PORTUS open on failure.
  const end = Date.now() + 120_000;
  while (Date.now() < end) {
    const failed = await readFile(join(directory, "failed"), "utf8").catch(() => null);
    if (failed) throw new Error(failed);
    if (await readFile(join(directory, "ready"), "utf8").catch(() => null)) return cancel;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  await cancel();
  throw new Error("O processo de atualização não ficou pronto. A atualização foi cancelada.");
}
