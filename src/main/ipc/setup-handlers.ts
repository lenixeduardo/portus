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


// Diagnostico voltado ao suporte: somente valores de rede/etapa e erros higienizados.
export function formatInitialSetupError(
  error: unknown,
  input: Pick<InitialSetupInput, "databaseHost" | "port" | "databaseName">,
  context: { stage?: string; elapsedMs?: number } = {}
): string {
  const main = error instanceof Error ? error : new Error(String(error ?? "Erro desconhecido"));
  const metadata = main as Error & {
    code?: string; errno?: number | string; syscall?: string;
    address?: string; port?: number; cause?: unknown;
  };
  const code = metadata.code ? String(metadata.code) : "";
  const connectionProblem = /connection terminated due to connection timeout|connection timeout|timeout expired|ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN|could not connect to server|the database system is starting up/i.test(main.message) ||
    ["ETIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ENOTFOUND", "EAI_AGAIN"].includes(code);
  const heading = connectionProblem
    ? "Não foi localizado o banco central PORTUS no endereço informado. Confira o IP do servidor, a porta, a rede e o serviço PostgreSQL."
    : /password authentication failed|28P01|authentication failed/i.test(main.message) || code === "28P01"
      ? "O servidor central foi localizado, mas a autenticação falhou. Confira o usuário e a senha."
      : /database .* does not exist|3D000/i.test(main.message) || code === "3D000"
        ? "O servidor PostgreSQL respondeu, mas o banco PORTUS não foi encontrado. Confira o nome do banco."
        : "Não foi possível validar a configuração do banco central.";

  const redact = (raw: unknown) => String(raw ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[URL de conexão omitida]")
    .replace(/(password|senha|PGPASSWORD|passphrase|secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/gi, "$1=[oculto]")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .slice(0, 500);
  const lines = [
    "Data/hora: " + new Date().toISOString(),
    "Etapa: " + (context.stage ?? "Validação da conexão"),
    "Servidor: " + redact(input.databaseHost),
    "Porta: " + input.port,
    "Banco: " + redact(input.databaseName),
    "Tempo decorrido: " + (context.elapsedMs === undefined ? "não medido" : context.elapsedMs + " ms"),
    "Código: " + (code || "não informado pelo driver"),
    "Mensagem original: " + redact(main.message)
  ];
  for (const [label, value] of [
    ["Errno", metadata.errno], ["Operação de rede", metadata.syscall],
    ["Endereço reportado", metadata.address], ["Porta reportada", metadata.port]
  ] as const) {
    if (value !== undefined && value !== null && String(value) !== "") {
      lines.push(label + ": " + redact(value));
    }
  }
  // node-postgres pode encapsular detalhes em cause; não exibimos stack nem credenciais.
  const cause = metadata.cause;
  if (cause && cause !== error) {
    const nested = cause as Error & { code?: string };
    lines.push("Causa interna: " + redact(nested.message || String(cause)));
    if (nested.code) lines.push("Código da causa: " + redact(nested.code));
  }
  lines.push(connectionProblem
    ? "Verificações: testar ping/rota da estação ao servidor; testar TCP " + input.port +
      "; conferir serviço PostgreSQL, listen_addresses, pg_hba.conf e firewall no servidor."
    : "Próximo passo: revise as credenciais, nome do banco e migrations no servidor.");
  return heading + "\nLog técnico:\n" + lines.join("\n");
}

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
      const startedAt = Date.now();
      let stage = "Iniciando assistente";
      try {
        if (input.installationMode === "server") {
          const serverInput = input as InitialSetupInput & { postgresBin: string; adminUser: string; adminPassword: string };
          const script = installerPath();
          if (!existsSync(script)) return { ok: false, error: "Arquivos de instalação do banco não foram encontrados. Reinstale o PORTUS." };
          if (!existsSync(join(serverInput.postgresBin, "psql.exe"))) return { ok: false, error: "psql.exe não foi encontrado na pasta informada." };
          stage = "Instalação / migrations locais";
          await runInitialSetup(serverInput, script);
          const connectionString = buildCentralDatabaseUrl(serverInput);
          stage = "Verificando acesso ao PostgreSQL";
          await verifyCentralDatabaseUrl(connectionString);
          stage = "Salvando configuração e validando esquema";
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
          stage = "Validando esquema PORTUS no servidor";
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
        return { ok: false, error: formatInitialSetupError(error, input, { stage, elapsedMs: Date.now() - startedAt }) };
      }
    })
  );
}
