import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
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
  return ["-NoLogo", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", scriptPath];
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
      stdio: "ignore",
      windowsHide: false
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
