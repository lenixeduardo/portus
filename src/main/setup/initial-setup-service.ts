import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
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
