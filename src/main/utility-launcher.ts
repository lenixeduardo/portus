import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Socket } from "node:net";
import { app } from "electron";

interface UtilityLocation {
  isPackaged: boolean;
  appPath: string;
  resourcesPath: string;
}

/** Only an application-owned, fixed script is launchable by the renderer. */
export function getPortusDbUtilityScriptPath(location: UtilityLocation): string {
  const root = location.isPackaged ? location.resourcesPath : location.appPath;
  return join(root, "database", "portus-db-utility.ps1");
}

export function getPortusDbUtilityArguments(scriptPath: string): string[] {
  return ["-NoLogo", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-LaunchedFromPortus"];
}

/** Opens the separate Windows WinForms utility; never applies migrations by itself. */
export async function launchPortusDbUtility(): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("O DB Utility está disponível somente no Windows.");
  }

  const scriptPath = getPortusDbUtilityScriptPath({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath
  });
  if (!existsSync(scriptPath)) {
    throw new Error("DB Utility não encontrado na instalação do PORTUS. Reinstale ou atualize o aplicativo.");
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn("powershell.exe", getPortusDbUtilityArguments(scriptPath), {
      cwd: dirname(scriptPath),
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let settled = false;
    let output = "";
    let diagnostic = "";
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      // Drain the pipes without retaining the Electron process after startup.
      (child.stdout as Socket | null)?.unref?.();
      (child.stderr as Socket | null)?.unref?.();
      child.unref();
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => {
      finish(new Error("O DB Utility não confirmou a abertura da janela no tempo esperado. " + diagnostic.trim()));
      child.kill();
    }, 30_000);
    child.once("error", error => finish(error));
    child.once("close", code => {
      finish(new Error(`O DB Utility encerrou antes de abrir a janela (código ${code ?? "desconhecido"}). ${diagnostic.trim()}`));
    });
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      if (settled) return;
      output = (output + chunk).slice(-8192);
      if (/(?:^|\n)PORTUS_DB_UTILITY_READY\r?\n/.test(output)) finish();
    });
    child.stderr?.on("data", (chunk: string) => {
      if (!settled) diagnostic = (diagnostic + chunk).slice(-4096);
    });
  });
}
