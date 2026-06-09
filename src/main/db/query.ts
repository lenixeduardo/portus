import { getDb, persistDb } from "./connection";

type BindParams = (string | number | null | boolean | undefined)[];

function toBindArray(params: BindParams): (string | number | null)[] {
  return params.map((v) => {
    if (v === undefined) return null;
    if (typeof v === "boolean") return v ? 1 : 0;
    return v;
  });
}

let inTransaction = false;

export function transaction<T>(callback: () => T): T {
  if (inTransaction) {
    return callback();
  }
  const db = getDb();
  db.run("BEGIN TRANSACTION");
  inTransaction = true;
  try {
    const result = callback();
    db.run("COMMIT");
    persistDb();
    return result;
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  } finally {
    inTransaction = false;
  }
}

// db.export() (called by persistDb) resets last_insert_rowid() to 0 in sql.js,
// so run() captures the rowid before persisting and returns it.
export function run(sql: string, ...params: BindParams): number {
  const db = getDb();
  db.run(sql, toBindArray(params));
  const rowid = getLastRowid(db);
  if (!inTransaction) {
    persistDb();
  }
  return rowid;
}

function getLastRowid(db: ReturnType<typeof getDb>): number {
  const stmt = db.prepare("SELECT last_insert_rowid() AS id");
  stmt.step();
  const id = (stmt.getAsObject() as { id: number }).id ?? 0;
  stmt.free();
  return id;
}

export function get<T = Record<string, unknown>>(
  sql: string,
  ...params: BindParams
): T | undefined {
  const stmt = getDb().prepare(sql);
  stmt.bind(toBindArray(params));
  if (!stmt.step()) {
    stmt.free();
    return undefined;
  }
  const row = stmt.getAsObject() as T;
  stmt.free();
  return row;
}

export function all<T = Record<string, unknown>>(sql: string, ...params: BindParams): T[] {
  const stmt = getDb().prepare(sql);
  stmt.bind(toBindArray(params));
  const rows: T[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as T);
  stmt.free();
  return rows;
}

export function exec(sql: string): void {
  getDb().run(sql);
  if (!inTransaction) {
    persistDb();
  }
}
