import { exec, all, run } from "./query";
import { migrations } from "./migrations";

const USER_DISPLAY_NAME_MIGRATION = "019_user_display_name";
const USER_BARCODE_MIGRATION = "020_user_barcode_value";
const SUPERVISOR_ROLE_MIGRATION = "021_add_supervisor_user_role";

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

  if (!applied.has(USER_DISPLAY_NAME_MIGRATION)) {
    const columns = all<{ name: string }>("PRAGMA table_info(users)");
    if (!columns.some((column) => column.name === "display_name")) {
      exec("ALTER TABLE users ADD COLUMN display_name TEXT");
    }
    run("INSERT INTO schema_migrations (name) VALUES (?)", USER_DISPLAY_NAME_MIGRATION);
    console.log(`[db] migration applied: ${USER_DISPLAY_NAME_MIGRATION}`);
  }

  if (!applied.has(USER_BARCODE_MIGRATION)) {
    const columns = all<{ name: string }>("PRAGMA table_info(users)");
    if (!columns.some((column) => column.name === "barcode_value")) {
      exec("ALTER TABLE users ADD COLUMN barcode_value TEXT");
    }
    exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_barcode_value_nocase
      ON users(barcode_value COLLATE NOCASE)
      WHERE barcode_value IS NOT NULL`);
    run("INSERT INTO schema_migrations (name) VALUES (?)", USER_BARCODE_MIGRATION);
    console.log(`[db] migration applied: ${USER_BARCODE_MIGRATION}`);
  }

  if (!applied.has(SUPERVISOR_ROLE_MIGRATION)) {
    exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN TRANSACTION;

      CREATE TABLE users_with_supervisor_role (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        role TEXT NOT NULL DEFAULT 'admin'
          CHECK (role IN ('master', 'supervisor', 'admin', 'operator')),
        sector_code TEXT NOT NULL DEFAULT 'PRODUCTION'
          CHECK (sector_code IN ('PRODUCTION', 'LABORATORY')),
        laboratory_profile TEXT
          CHECK (laboratory_profile IN ('capture', 'closure')),
        display_name TEXT,
        barcode_value TEXT
      );

      INSERT INTO users_with_supervisor_role (
        id, username, password_hash, created_at, role, sector_code,
        laboratory_profile, display_name, barcode_value
      )
      SELECT id, username, password_hash, created_at, role, sector_code,
             laboratory_profile, display_name, barcode_value
        FROM users;

      DROP TABLE users;
      ALTER TABLE users_with_supervisor_role RENAME TO users;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_barcode_value_nocase
        ON users(barcode_value COLLATE NOCASE)
        WHERE barcode_value IS NOT NULL;

      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
    run("INSERT INTO schema_migrations (name) VALUES (?)", SUPERVISOR_ROLE_MIGRATION);
    console.log(`[db] migration applied: ${SUPERVISOR_ROLE_MIGRATION}`);
  }
}
