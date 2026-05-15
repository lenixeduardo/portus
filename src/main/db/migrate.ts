import { exec, all, run } from "./query";
import { migrations } from "./migrations";

export function runMigrations(): void {
  exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const applied = new Set(all<{ name: string }>("SELECT name FROM schema_migrations").map((r) => r.name));

  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    exec(m.sql);
    run("INSERT INTO schema_migrations (name) VALUES (?)", m.name);
    console.log(`[db] migration applied: ${m.name}`);
  }
}
