import { app, ipcMain } from "electron";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { join } from "node:path";
import { z } from "zod";
import { IPC, type InitialSetupInput, type InitialSetupStatus, type ServiceResult } from "../../shared/ipc";
import { buildCentralDatabaseUrl, checkCentralDatabase, isCentralDatabaseConfigured, isCentralDatabaseRequired, persistCentralDatabaseUrl, verifyCentralDatabaseUrl, centralQuery } from "../db/central-connection";
import { ensureCentralUserAccess } from "../db/central-users-repo";
import { getRuntimeStationCode, setCentralStationSetting } from "../db/central-station-settings-repo";
import { detectPostgresServiceStatus, findPostgresBin, isInitialSetupCompleted, markInitialSetupComplete, runInitialSetup } from "../setup/initial-setup-service";
import { validateInput } from "./middleware";

const identifier = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,62}$/, "Use letras, números e _. O nome deve começar com uma letra.");
const commonSetupSchema = z.object({
  databaseHost: z.string().min(1, "Informe o host do PostgreSQL."),
  port: z.number().int().min(1).max(65535),
  databaseName: identifier,
  appUser: identifier,
  appPassword: z.string().min(8, "A senha do PORTUS deve ter ao menos 8 caracteres.")
});
const setupSchema = z.discriminatedUnion("installationMode", [
  commonSetupSchema.extend({
    installationMode: z.literal("server"),
    postgresBin: z.string().min(1, "Informe a pasta bin do PostgreSQL."),
    adminUser: identifier,
    adminPassword: z.string().min(1, "Informe a senha do administrador PostgreSQL.")
  }),
  commonSetupSchema.extend({
    installationMode: z.literal("client"),
    stationSectorCode: z.enum(["PRODUCTION", "LABORATORY"]),
    databaseHost: z.string().trim().refine(host => {
      const octets = host.split(".");
      return octets.length === 4 &&
        octets.every(octet => /^[0-9]{1,3}$/.test(octet) && Number(octet) <= 255) &&
        octets[0] !== "127" && octets[0] !== "0" && Number(octets[0]) < 224;
    }, "Informe o IPv4 válido da máquina servidor, por exemplo 192.168.0.10.")
  })
]);

async function getStatus(): Promise<InitialSetupStatus> {
  const configured = isCentralDatabaseConfigured();
  const required = isCentralDatabaseRequired();
  const supported = process.platform === "win32";
  const setupCompleted = isInitialSetupCompleted();
  const stationCode = getRuntimeStationCode();
  const postgresServiceStatus = detectPostgresServiceStatus();
  if (!configured) {
    return { configured: false, available: false, required, mode: required ? "central" : "local", supported, postgresBin: supported ? findPostgresBin() : null, setupCompleted, stationCode, postgresServiceStatus };
  }
  try {
    await checkCentralDatabase();
    return { configured: true, available: true, required, mode: required ? "central" : "local", supported, postgresBin: supported ? findPostgresBin() : null, setupCompleted, stationCode, postgresServiceStatus };
  } catch {
    return { configured: true, available: false, required, mode: required ? "central" : "local", supported, postgresBin: supported ? findPostgresBin() : null, setupCompleted, stationCode, postgresServiceStatus };
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
      try {
        if (input.installationMode === "server") {
          const serverInput = input as InitialSetupInput & { postgresBin: string; adminUser: string; adminPassword: string };
          const script = installerPath();
          if (!existsSync(script)) return { ok: false, error: "Arquivos de instalação do banco não foram encontrados. Reinstale o PORTUS." };
          if (!existsSync(join(serverInput.postgresBin, "psql.exe"))) return { ok: false, error: "psql.exe não foi encontrado na pasta informada." };
          await runInitialSetup(serverInput, script);
          const connectionString = buildCentralDatabaseUrl(serverInput);
          await verifyCentralDatabaseUrl(connectionString);
          await persistCentralDatabaseUrl(connectionString);
          await setCentralStationSetting("installation_mode", "server");

          // Bootstrap controlado somente no servidor, nunca por estação cliente.
          const rows = await centralQuery<{ count: string }>("SELECT COUNT(*)::text AS count FROM users");
          if (Number(rows.rows[0]?.count ?? 0) === 0) {
            const previousSqlite = join(app.getPath("userData"), "serial-reader.sqlite");
            if (existsSync(previousSqlite)) {
              throw new Error("Banco local legado detectado. Importe todos os dados antes do corte PostgreSQL-only.");
            }
            const password = process.env.PORTUS_INITIAL_ADMIN_PASSWORD || randomBytes(18).toString("base64url");
            const hash = await bcrypt.hash(password, 12);
            await centralQuery(
              "INSERT INTO users(username,password_hash,role,sector_code,active) " +
              "VALUES ('admin',$1,'master','PRODUCTION',TRUE)",
              [hash]
            );
            const user = {
              id: 0, username: "admin", role: "master" as const,
              sectorCode: "PRODUCTION" as const, createdAt: new Date().toISOString()
            };
            await ensureCentralUserAccess(user,{passwordHash:hash});
            await import("../db/central-station-settings-repo").then(m =>
              m.setCentralStationSetting("station_sector_code","PRODUCTION"));
            // Senha única exibida uma só vez ao administrador do servidor.
            await import("electron").then(m => m.dialog.showMessageBox({
              type: "warning", title: "PORTUS — conta Master inicial",
              message: "Usuário: admin",
              detail: "Anote a senha única e altere-a após entrar:\\n\\n" + password,
              buttons: ["Anotei a senha"]
            }));
          }
        } else {
          const connectionString = buildCentralDatabaseUrl(input);
          await verifyCentralDatabaseUrl(connectionString);
          await persistCentralDatabaseUrl(connectionString);
          await checkCentralDatabase();
          await setCentralStationSetting("installation_mode", "client");
          await setCentralStationSetting("station_sector_code", input.stationSectorCode!);
        }
        const status = await getStatus();
        if (!status.available) {
          return { ok: false, error: "O banco foi preparado, mas a conexão ou o esquema central não pôde ser validado." };
        }
        markInitialSetupComplete(input.installationMode);
        return { ok: true, data: await getStatus() };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao configurar o PostgreSQL.";
        return { ok: false, error: message.replace(/\s+/g, " ").slice(-900) };
      }
    })
  );
}
