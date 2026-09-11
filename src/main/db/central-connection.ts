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

function getCentralDatabaseUrl(): string | undefined {
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
  return getRuntimeSetting("PORTUS_DATABASE_MODE")?.toLowerCase() === "local" ? "local" : "central";
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
      application_name: "portus-electron"
    });
  }
  return pool;
}

export async function centralQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<QueryResult<T>> {
  return getCentralPool().query<T>(text, values);
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
  await centralQuery("SELECT 1");
  return true;
}

export async function closeCentralDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
