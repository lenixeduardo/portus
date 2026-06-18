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
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
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
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('open','closed')) DEFAULT 'open',
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS capture_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE ON UPDATE CASCADE,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  timeout_seconds INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','completed','cancelled')) DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE ON UPDATE CASCADE,
  equipment_id INTEGER NOT NULL REFERENCES equipments(id) ON DELETE SET NULL ON UPDATE CASCADE,
  value_raw TEXT NOT NULL,
  value_parsed TEXT,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  capture_session_id INTEGER NOT NULL REFERENCES capture_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE
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
  },
  {
    name: "006_batches_auto_exported_at",
    sql: `
ALTER TABLE batches ADD COLUMN auto_exported_at TEXT;
`
  },
  {
    name: "007_equipment_line_delimiter_and_regex_backfill",
    sql: `
ALTER TABLE equipments ADD COLUMN line_delimiter TEXT NOT NULL DEFAULT 'lf';
UPDATE equipments
   SET parse_regex = '(?<value>[-+]?\\d+(?:[.,]\\d+)?)'
 WHERE parse_regex IS NULL;
`
  },
  {
    name: "008_enforce_foreign_key_constraints",
    sql: `
-- Enable foreign key constraints
PRAGMA foreign_keys = ON;
`
  },
  {
    name: "009_add_cascade_delete_for_products",
    sql: `
-- This is a note migration for documentation.
-- Foreign keys for products table are defined as:
-- - batches.product_id -> products.id ON DELETE CASCADE
-- - products.created_by -> users.id ON DELETE RESTRICT
-- If recreating, use ON DELETE CASCADE for product cascades.
`
  },
  {
    name: "010_equipment_skip_first_reading",
    sql: `
ALTER TABLE equipments ADD COLUMN skip_first_reading INTEGER NOT NULL DEFAULT 0;
`
  },
  {
    name: "011_capture_error_logs",
    sql: `
CREATE TABLE IF NOT EXISTS capture_error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL ON UPDATE CASCADE,
  capture_session_id INTEGER REFERENCES capture_sessions(id) ON DELETE SET NULL ON UPDATE CASCADE,
  equipment_id INTEGER REFERENCES equipments(id) ON DELETE SET NULL ON UPDATE CASCADE,
  slot_index INTEGER,
  severity TEXT NOT NULL CHECK (severity IN ('warn','error')) DEFAULT 'error',
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  raw_value TEXT,
  context_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_capture_error_logs_batch ON capture_error_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_capture_error_logs_session ON capture_error_logs(capture_session_id);
CREATE INDEX IF NOT EXISTS idx_capture_error_logs_created_at ON capture_error_logs(created_at);
`
  },
  {
    name: "012_equipment_modbus_and_scaling",
    sql: `
ALTER TABLE equipments ADD COLUMN protocol TEXT NOT NULL DEFAULT 'passive';
ALTER TABLE equipments ADD COLUMN modbus_unit_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE equipments ADD COLUMN modbus_function INTEGER NOT NULL DEFAULT 3;
ALTER TABLE equipments ADD COLUMN modbus_start_address INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipments ADD COLUMN modbus_quantity INTEGER NOT NULL DEFAULT 2;
ALTER TABLE equipments ADD COLUMN modbus_register_decode TEXT NOT NULL DEFAULT 'uint16';
ALTER TABLE equipments ADD COLUMN modbus_poll_interval_ms INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE equipments ADD COLUMN modbus_response_timeout_ms INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE equipments ADD COLUMN scale_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipments ADD COLUMN scale_raw_min REAL;
ALTER TABLE equipments ADD COLUMN scale_raw_max REAL;
ALTER TABLE equipments ADD COLUMN scale_out_min REAL;
ALTER TABLE equipments ADD COLUMN scale_out_max REAL;
`
  },
  {
    name: "013_equipment_stop_after_first_reading",
    sql: `ALTER TABLE equipments ADD COLUMN stop_after_first_reading INTEGER NOT NULL DEFAULT 0;`
  }
];
