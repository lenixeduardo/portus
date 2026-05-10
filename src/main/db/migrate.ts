import { getDb } from "./connection";
import { migrations } from "./migrations";

export function runMigrations(): void {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const applied = new Set(
    db.prepare("SELECT name FROM schema_migrations").all().map((r: any) => r.name)
  );
  const insert = db.prepare("INSERT INTO schema_migrations (name) VALUES (?)");

  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    const tx = db.transaction(() => {
      db.exec(m.sql);
      insert.run(m.name);
    });
    tx();
    console.log(`[db] migration applied: ${m.name}`);
  }
}
