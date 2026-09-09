import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

let pool: Pool | null = null;

export function isCentralDatabaseConfigured(): boolean {
  return Boolean(process.env.PORTUS_DATABASE_URL?.trim());
}

export function getCentralPool(): Pool {
  if (!isCentralDatabaseConfigured()) {
    throw new Error("PORTUS_DATABASE_URL não configurada.");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.PORTUS_DATABASE_URL,
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
