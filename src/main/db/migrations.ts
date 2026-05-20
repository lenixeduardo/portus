export interface Migration {
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    name: "001_init",
    sql: `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS equipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  port_path TEXT NOT NULL DEFAULT '',
  baud_rate INTEGER NOT NULL DEFAULT 9600,
  data_bits INTEGER NOT NULL DEFAULT 8,
  stop_bits INTEGER NOT NULL DEFAULT 1,
  parity TEXT NOT NULL DEFAULT 'none',
  enabled INTEGER NOT NULL DEFAULT 1,
  slot_index INTEGER NOT NULL UNIQUE,
  parse_regex TEXT
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id),
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('open','closed')) DEFAULT 'open',
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS capture_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  timeout_seconds INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','completed','cancelled')) DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  equipment_id INTEGER NOT NULL REFERENCES equipments(id),
  value_raw TEXT NOT NULL,
  value_parsed TEXT,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  capture_session_id INTEGER NOT NULL REFERENCES capture_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_readings_batch ON readings(batch_id);
CREATE INDEX IF NOT EXISTS idx_readings_session ON readings(capture_session_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`
  },
  {
    name: "002_rename_recipes_to_formulas",
    sql: `
ALTER TABLE recipes RENAME TO formulas;
ALTER TABLE batches RENAME COLUMN recipe_id TO formula_id;
`
  },
  {
    name: "003_readings_parse_audit",
    sql: `
ALTER TABLE readings ADD COLUMN parse_failure_reason TEXT;
ALTER TABLE readings ADD COLUMN parse_regex_used TEXT;
`
  },
  {
    name: "004_rename_formulas_to_products",
    sql: `
ALTER TABLE formulas RENAME TO products;
ALTER TABLE batches RENAME COLUMN formula_id TO product_id;
`
  },
  {
    name: "005_add_user_role",
    sql: `
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'operator'));
`
  }
];
