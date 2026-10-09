import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { InitialSetupInput } from "../../shared/ipc";

const execFileAsync = promisify(execFile);
const WINDOWS_POSTGRES_VERSIONS = [18, 17, 16, 15, 14];

export function findPostgresBin(
  programFiles?: string,
  pathExists: (path: string) => boolean = existsSync
): string | null {
  // Sem argumentos, use ProgramFiles para a descoberta automática do app.
  // Quando `undefined` é passado explicitamente (caso de teste/validação), não
  // invente uma instalação a partir do ambiente da máquina que executa o teste.
  const searchRoot = arguments.length === 0 ? process.env.ProgramFiles : programFiles;
  if (!searchRoot) return null;
  for (const version of WINDOWS_POSTGRES_VERSIONS) {
    const candidate = `${searchRoot}\\PostgreSQL\\${version}\\bin`;
    if (pathExists(`${candidate}\\psql.exe`)) return candidate;
  }
  return null;
}

/** A running local service is a hint, not proof that this station is the appointed server. */
export function detectPostgresServiceStatus(
  platform: NodeJS.Platform = process.platform,
  readServices: () => string = () => execFileSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    "(Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status) -join ','"
  ], { encoding: "utf8", timeout: 3000, windowsHide: true })
): "running" | "stopped" | "not-found" | "unavailable" {
  if (platform !== "win32") return "unavailable";
  try {
    const values = readServices().split(/[\r\n,]+/).map(x => x.trim().toLowerCase());
    if (values.includes("running")) return "running";
    if (values.includes("stopped") || values.includes("paused")) return "stopped";
    return "not-found";
  } catch {
    return "unavailable";
  }
}

export async function runInitialSetup(
  input: InitialSetupInput & { postgresBin: string; adminUser: string; adminPassword: string },
  scriptPath: string
): Promise<void> {
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", scriptPath,
    "-PostgresBin", input.postgresBin,
    "-DatabaseHost", input.databaseHost,
    "-Port", String(input.port),
    "-AdminUser", input.adminUser,
    "-DatabaseName", input.databaseName,
    "-AppUser", input.appUser
  ];

  await execFileAsync("powershell.exe", args, {
    windowsHide: true,
    timeout: 5 * 60 * 1000,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      PORTUS_SETUP_ADMIN_PASSWORD: input.adminPassword,
      PORTUS_SETUP_APP_PASSWORD: input.appPassword
    }
  });
}

/** Onboarding is per Windows profile and machine, not inferred from a shared database URL. */
function installationStatePath(): string | null {
  const root = process.env.LOCALAPPDATA?.trim() || process.env.APPDATA?.trim();
  return root ? join(root, "PORTUS", "installation-state.json") : null;
}

export function isInitialSetupCompleted(): boolean {
  const filename = installationStatePath();
  if (!filename) return false;
  try {
    const state = JSON.parse(readFileSync(filename, "utf8")) as Record<string, unknown>;
    return state.schemaVersion === 1 && state.completed === true &&
      (state.installationMode === "server" || state.installationMode === "client");
  } catch {
    return false;
  }
}

export function markInitialSetupComplete(mode: "server" | "client"): void {
  const filename = installationStatePath();
  if (!filename) throw new Error("Não foi possível determinar o perfil Windows para concluir a configuração.");
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, JSON.stringify({
    schemaVersion: 1,
    completed: true,
    installationMode: mode,
    completedAt: new Date().toISOString()
  }, null, 2) + "\n", { encoding: "utf8" });
}
