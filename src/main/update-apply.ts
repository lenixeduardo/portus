import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { join, win32 } from "node:path";
import type { AvailableUpdate } from "../shared/ipc";

export async function startFileUpdate(archive: string, update: AvailableUpdate, executable: string, script: string): Promise<() => Promise<void>> {
  const session = randomUUID();
  const directory = join(win32.dirname(archive), `apply-${session}`);
  const statusDirectory = win32.join(win32.dirname(executable), ".portus-update-work", session);
  await mkdir(directory, { recursive: true });
  const helper = script;
  const configPath = join(directory, "apply-config.json");
  await writeFile(configPath, JSON.stringify({ archive, sha256: update.sha256, version: update.version,
    session, parentPid: process.pid }), "utf8");
  const cancel = async () => { await writeFile(join(directory, "cancel"), "cancel", "utf8"); };
  const bootstrap = await open(join(directory, "bootstrap.log"), "a");
  const child = spawn(win32.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", helper, "-ConfigPath", configPath],
    { detached: true, stdio: ["ignore", bootstrap.fd, bootstrap.fd], windowsHide: true });
  let exitCode: number | null | undefined;
  child.once("exit", code => { exitCode = code; });
  try {
    await new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("spawn", resolve); });
  } finally { await bootstrap.close(); }
  child.unref();
  // Wait until archive validation and any required UAC prompt finish, keeping PORTUS open on failure.
  const end = Date.now() + 120_000;
  while (Date.now() < end) {
    const failed = await readFile(join(statusDirectory, "failed"), "utf8").catch(() => null);
    if (failed) { await cancel(); throw new Error(failed); }
    if (await readFile(join(statusDirectory, "ready"), "utf8").catch(() => null)) return cancel;
    if (exitCode !== undefined && exitCode !== 0) {
      await cancel();
      const details = await readFile(join(directory, "bootstrap.log"), "utf8").catch(() => "");
      throw new Error(`Auxiliar encerrou com código ${exitCode}: ${details.slice(-4000)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  await cancel();
  throw new Error("O processo de atualização não ficou pronto. A atualização foi cancelada.");
}
