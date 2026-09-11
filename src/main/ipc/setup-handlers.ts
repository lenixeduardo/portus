import { app, ipcMain } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { IPC, type InitialSetupInput, type InitialSetupStatus, type ServiceResult } from "../../shared/ipc";
import { checkCentralDatabase, isCentralDatabaseConfigured, isCentralDatabaseRequired } from "../db/central-connection";
import { findPostgresBin, runInitialSetup } from "../setup/initial-setup-service";
import { validateInput } from "./middleware";

const identifier = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,62}$/, "Use letras, números e _. O nome deve começar com uma letra.");
const setupSchema = z.object({
  postgresBin: z.string().min(1, "Informe a pasta bin do PostgreSQL."),
  databaseHost: z.string().min(1, "Informe o host do PostgreSQL."),
  port: z.number().int().min(1).max(65535),
  adminUser: identifier,
  adminPassword: z.string().min(1, "Informe a senha do administrador PostgreSQL."),
  databaseName: identifier,
  appUser: identifier,
  appPassword: z.string().min(8, "A senha do PORTUS deve ter ao menos 8 caracteres.")
});

async function getStatus(): Promise<InitialSetupStatus> {
  const configured = isCentralDatabaseConfigured();
  const required = isCentralDatabaseRequired();
  const supported = process.platform === "win32";
  if (!configured) {
    return { configured: false, available: false, required, mode: required ? "central" : "local", supported, postgresBin: supported ? findPostgresBin() : null };
  }
  try {
    await checkCentralDatabase();
    return { configured: true, available: true, required, mode: required ? "central" : "local", supported, postgresBin: supported ? findPostgresBin() : null };
  } catch {
    return { configured: true, available: false, required, mode: required ? "central" : "local", supported, postgresBin: supported ? findPostgresBin() : null };
  }
}

function installerPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "database", "install-portus-database.ps1")
    : join(app.getAppPath(), "database", "install-portus-database.ps1");
}

export function registerSetupHandlers(): void {
  ipcMain.handle(IPC.setupStatus, getStatus);

  ipcMain.handle(
    IPC.setupRun,
    validateInput(setupSchema)(async (_event, input: InitialSetupInput): Promise<ServiceResult<InitialSetupStatus>> => {
      if (process.platform !== "win32") return { ok: false, error: "O assistente automático está disponível somente no Windows." };
      const script = installerPath();
      if (!existsSync(script)) return { ok: false, error: "Arquivos de instalação do banco não foram encontrados. Reinstale o PORTUS." };
      if (!existsSync(join(input.postgresBin, "psql.exe"))) return { ok: false, error: "psql.exe não foi encontrado na pasta informada." };
      try {
        await runInitialSetup(input, script);
        const status = await getStatus();
        return status.available
          ? { ok: true, data: status }
          : { ok: false, error: "O banco foi preparado, mas a conexão não pôde ser validada." };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao configurar o PostgreSQL.";
        return { ok: false, error: message.replace(/\s+/g, " ").slice(-900) };
      }
    })
  );
}
