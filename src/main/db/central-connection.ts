import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

let pool: Pool | null = null;

export type CentralDatabaseMode = "central" | "local";

type CentralDatabaseConfig = {
  PORTUS_DATABASE_URL?: string;
  PORTUS_DATABASE_MODE?: string;
};

export function parseCentralDatabaseConfig(contents: string): CentralDatabaseConfig {
  try {
    const parsed = JSON.parse(contents) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return {
      PORTUS_DATABASE_URL: typeof parsed.PORTUS_DATABASE_URL === "string"
        ? parsed.PORTUS_DATABASE_URL.trim() || undefined
        : undefined,
      PORTUS_DATABASE_MODE: typeof parsed.PORTUS_DATABASE_MODE === "string"
        ? parsed.PORTUS_DATABASE_MODE.trim() || undefined
        : undefined
    };
  } catch {
    return {};
  }
}

export function parseWindowsRegistryValue(output: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rowPattern = new RegExp(`^\\s*${escapedName}\\s+REG_(?:SZ|EXPAND_SZ)\\s+(.+?)\\s*$`, "i");
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(rowPattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

function readWindowsUserEnvironment(name: string): string | undefined {
  if (process.platform !== "win32") return undefined;
  try {
    const output = execFileSync(
      "reg.exe",
      ["query", "HKCU\\Environment", "/v", name],
      { encoding: "utf8", windowsHide: true }
    );
    return parseWindowsRegistryValue(output, name);
  } catch {
    return undefined;
  }
}

function readWindowsConfigFile(name: keyof CentralDatabaseConfig): string | undefined {
  if (process.platform !== "win32") return undefined;

  const roots = [process.env.LOCALAPPDATA, process.env.APPDATA, process.env.PROGRAMDATA]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  for (const root of roots) {
    try {
      const config = parseCentralDatabaseConfig(
        readFileSync(join(root, "PORTUS", "database-config.json"), "utf8")
      );
      if (config[name]) return config[name];
    } catch {
      // O arquivo é opcional; prossiga para a próxima fonte de configuração.
    }
  }
  return undefined;
}

function getRuntimeSetting(name: string): string | undefined {
  // Uma variável explicitamente definida tem precedência mesmo quando vazia.
  // Isso evita que `PORTUS_DATABASE_URL="   "` seja silenciosamente substituída
  // por uma configuração antiga gravada no arquivo ou no Registro do Windows.
  if (Object.prototype.hasOwnProperty.call(process.env, name)) {
    return process.env[name]?.trim() || undefined;
  }

  // O arquivo no perfil é gravado pelo instalador e independe do ambiente que o
  // Explorer herdou. O Registro permanece como fallback para instalações antigas.
  const persisted = readWindowsConfigFile(name as keyof CentralDatabaseConfig)
    ?? readWindowsUserEnvironment(name);
  if (persisted) process.env[name] = persisted;
  return persisted;
}

export function getCentralDatabaseUrl(): string | undefined {
  return getRuntimeSetting("PORTUS_DATABASE_URL");
}

export function buildCentralDatabaseUrl(input: {
  databaseHost: string;
  port: number;
  databaseName: string;
  appUser: string;
  appPassword: string;
}): string {
  const host = input.databaseHost.trim();
  const networkHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `postgresql://${encodeURIComponent(input.appUser)}:${encodeURIComponent(input.appPassword)}@${networkHost}:${input.port}/${encodeURIComponent(input.databaseName)}`;
}

export async function verifyCentralDatabaseUrl(connectionString: string): Promise<void> {
  const probe = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
  try {
    await probe.query("SELECT 1");
  } finally {
    await probe.end();
  }
}

export async function persistCentralDatabaseUrl(connectionString: string): Promise<void> {
  const root = process.env.LOCALAPPDATA?.trim() || process.env.APPDATA?.trim();
  if (!root) throw new Error("Não foi possível localizar o perfil do Windows para salvar a conexão.");
  const directory = join(root, "PORTUS");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "database-config.json"), `${JSON.stringify({
    PORTUS_DATABASE_URL: connectionString,
    PORTUS_DATABASE_MODE: "central"
  }, null, 2)}\n`, "utf8");
  process.env.PORTUS_DATABASE_URL = connectionString;
  process.env.PORTUS_DATABASE_MODE = "central";
  await closeCentralDatabase();
}

/**
 * PostgreSQL is authoritative by default. The legacy SQLite batch flow is
 * available only when a developer explicitly opts into PORTUS_DATABASE_MODE=local.
 */
export function getCentralDatabaseMode(): CentralDatabaseMode {
  // O parâmetro PORTUS_DATABASE_MODE=local foi aposentado. Não há fallback.
  return "central";
}

export function isCentralDatabaseRequired(): boolean {
  return getCentralDatabaseMode() === "central";
}

export function isCentralDatabaseConfigured(): boolean {
  return Boolean(getCentralDatabaseUrl());
}

export function getCentralPool(): Pool {
  if (!isCentralDatabaseConfigured()) {
    throw new Error("PORTUS_DATABASE_URL não configurada.");
  }
  if (!pool) {
    const connectionString = getCentralDatabaseUrl();
    pool = new Pool({
      connectionString,
      max: Number(process.env.PORTUS_DATABASE_POOL_MAX ?? 5),
      connectionTimeoutMillis: Number(process.env.PORTUS_DATABASE_CONNECT_TIMEOUT_MS ?? 5000),
      idleTimeoutMillis: 30000,
      application_name: "portus-electron",
      // Toda a estrutura instalada pelas migrations pertence ao schema public.
      // Não permitir que search_path do usuário resolva outra tabela users.
      options: "-c search_path=public"
    });
  }
  return pool;
}

export async function centralQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<QueryResult<T>> {
  try {
    return await getCentralPool().query<T>(text, values);
  } catch (error) {
    const postgresError = error as { code?: string; message?: string } | null;
    if (postgresError?.code === "42703" &&
        /(?:column|coluna)\s+["']sector_code["']/i.test(postgresError.message ?? "")) {
      throw new Error(
        "Esquema PostgreSQL desatualizado: users.sector_code ausente. " +
        "Aplique a migration 013 no servidor do banco conectado com " +
        "database/install-portus-database.ps1 -MigrationsOnly."
      );
    }
    if (postgresError?.code === "42703" && /\bb\.completed\b/i.test(postgresError.message ?? "")) {
      throw new Error(
        "Banco central PORTUS desatualizado (coluna batches.completed ausente). " +
        "No servidor PostgreSQL, execute a migration 012 com install-portus-database.ps1 -MigrationsOnly."
      );
    }
    throw error;
  }
}

export async function withCentralTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getCentralPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function checkCentralDatabase(): Promise<boolean> {
  if (!isCentralDatabaseConfigured()) return false;
  const schema = await centralQuery<{ ready: boolean }>(
    "SELECT " +
    "EXISTS (SELECT 1 FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'batches' AND column_name = 'completed') " +
    "AND EXISTS (SELECT 1 FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'active') " +
    "AND EXISTS (SELECT 1 FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'barcode_value') " +
    "AND EXISTS (SELECT 1 FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'sector_code') " +
    "AND EXISTS (SELECT 1 FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'laboratory_profile') " +
    "AND to_regprocedure('public.portus_save_product(bigint,text,text,text)') IS NOT NULL " +
    "AND to_regclass('public.portus_station_settings') IS NOT NULL " +
    "AND to_regclass('public.portus_station_equipment_profiles') IS NOT NULL " +
    "AND to_regclass('public.portus_audit_log') IS NOT NULL " +
    "AND to_regclass('public.portus_auto_exports') IS NOT NULL " +
    "AND to_regclass('public.portus_legacy_import_ledger') IS NOT NULL " +
    "AS ready"
  );
  if (!schema.rows[0]?.ready) {
    const existingColumns = await centralQuery<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns " +
      "WHERE table_schema = 'public' AND table_name = 'users' " +
      "AND column_name = ANY($1::text[])",
      [["sector_code", "laboratory_profile", "barcode_value"]]
    );
    const present = new Set(existingColumns.rows.map(row => row.column_name));
    const missing = ["sector_code", "laboratory_profile", "barcode_value"]
      .filter(column => !present.has(column));
    if (missing.length) {
      throw new Error(
        "Esquema PostgreSQL desatualizado: colunas ausentes " +
        missing.map(column => "users." + column).join(", ") +
        ". Aplique a migration 013 no servidor do banco conectado com " +
        "database/install-portus-database.ps1 -MigrationsOnly. " +
        "Confira também portus_schema_migrations."
      );
    }
    throw new Error("Esquema PostgreSQL central incompleto (migrations 012, 013 ou 014). " +
      "Execute database/install-portus-database.ps1 -MigrationsOnly no servidor do banco conectado.");
  }
  return true;
}

export async function closeCentralDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
