import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { execFileSync } from "node:child_process";

let pool: Pool | null = null;

export type CentralDatabaseMode = "central" | "local";

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

function getRuntimeSetting(name: string): string | undefined {
  const inherited = process.env[name]?.trim();
  if (inherited) return inherited;

  // O Explorer pode continuar com um ambiente antigo depois que o instalador
  // salva a variável no perfil. Consulte o Registro para o executável instalado.
  const persisted = readWindowsUserEnvironment(name);
  if (persisted) process.env[name] = persisted;
  return persisted;
}

function getCentralDatabaseUrl(): string | undefined {
  return getRuntimeSetting("PORTUS_DATABASE_URL");
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
