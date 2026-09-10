BEGIN;

CREATE TABLE IF NOT EXISTS applications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'operator'
    CHECK (role IN ('admin', 'operator', 'laboratory', 'master')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sectors (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sector_id BIGINT NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sector_id, code)
);

CREATE TABLE IF NOT EXISTS user_sector_permissions (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sector_id BIGINT NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  can_read BOOLEAN NOT NULL DEFAULT FALSE,
  can_open BOOLEAN NOT NULL DEFAULT FALSE,
  can_capture BOOLEAN NOT NULL DEFAULT FALSE,
  can_move BOOLEAN NOT NULL DEFAULT FALSE,
  can_confirm_production BOOLEAN NOT NULL DEFAULT FALSE,
  can_confirm_laboratory BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, sector_id)
);

CREATE TABLE IF NOT EXISTS application_sector_permissions (
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  sector_id BIGINT NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  can_read BOOLEAN NOT NULL DEFAULT FALSE,
  can_open BOOLEAN NOT NULL DEFAULT FALSE,
  can_capture BOOLEAN NOT NULL DEFAULT FALSE,
  can_move BOOLEAN NOT NULL DEFAULT FALSE,
  can_confirm_production BOOLEAN NOT NULL DEFAULT FALSE,
  can_confirm_laboratory BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (application_id, sector_id)
);

CREATE TABLE IF NOT EXISTS products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS station_equipment_configs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  station_id BIGINT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  equipment_id BIGINT NOT NULL REFERENCES equipments(id) ON DELETE RESTRICT,
  port_path TEXT NOT NULL DEFAULT '',
  baud_rate INTEGER NOT NULL DEFAULT 9600,
  data_bits INTEGER NOT NULL DEFAULT 8 CHECK (data_bits IN (5, 6, 7, 8)),
  stop_bits INTEGER NOT NULL DEFAULT 1 CHECK (stop_bits IN (1, 2)),
  parity TEXT NOT NULL DEFAULT 'none' CHECK (parity IN ('none', 'even', 'odd')),
  parse_regex TEXT,
  line_delimiter TEXT NOT NULL DEFAULT 'lf' CHECK (line_delimiter IN ('crlf', 'lf', 'cr')),
  protocol TEXT NOT NULL DEFAULT 'passive' CHECK (protocol IN ('passive', 'modbus_rtu')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (station_id, equipment_id)
);

CREATE TABLE IF NOT EXISTS batches (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  stage TEXT NOT NULL DEFAULT 'A' CHECK (length(trim(stage)) > 0),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  closed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  opened_source TEXT,
  closed_source TEXT,
  production_closed BOOLEAN NOT NULL DEFAULT FALSE,
  production_closed_at TIMESTAMPTZ,
  production_closed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  laboratory_closed BOOLEAN NOT NULL DEFAULT FALSE,
  laboratory_closed_at TIMESTAMPTZ,
  laboratory_closed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'open' AND closed_at IS NULL) OR
         (status = 'closed' AND closed_at IS NOT NULL)),
  CHECK (NOT production_closed OR production_closed_at IS NOT NULL),
  CHECK (NOT laboratory_closed OR laboratory_closed_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS capture_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  sector_id BIGINT REFERENCES sectors(id) ON DELETE SET NULL,
  station_id BIGINT REFERENCES stations(id) ON DELETE SET NULL,
  source_application_id BIGINT REFERENCES applications(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  timeout_seconds INTEGER NOT NULL CHECK (timeout_seconds > 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS readings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  equipment_id BIGINT NOT NULL REFERENCES equipments(id) ON DELETE RESTRICT,
  capture_session_id BIGINT NOT NULL REFERENCES capture_sessions(id) ON DELETE CASCADE,
  value_raw TEXT NOT NULL,
  value_parsed TEXT,
  parse_failure_reason TEXT,
  parse_regex_used TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS capture_error_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id BIGINT REFERENCES batches(id) ON DELETE SET NULL,
  capture_session_id BIGINT REFERENCES capture_sessions(id) ON DELETE SET NULL,
  equipment_id BIGINT REFERENCES equipments(id) ON DELETE SET NULL,
  sector_id BIGINT REFERENCES sectors(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('warn', 'error')),
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  raw_value TEXT,
  context_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batch_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  previous_stage TEXT,
  new_stage TEXT,
  previous_version BIGINT,
  new_version BIGINT,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  source_application_id BIGINT REFERENCES applications(id) ON DELETE SET NULL,
  sector_id BIGINT REFERENCES sectors(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION portus_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION portus_set_updated_at();

DROP TRIGGER IF EXISTS trg_batches_updated_at ON batches;
CREATE TRIGGER trg_batches_updated_at
BEFORE UPDATE ON batches
FOR EACH ROW EXECUTE FUNCTION portus_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_batches_status_stage
  ON batches(status, stage);
CREATE INDEX IF NOT EXISTS idx_batches_product
  ON batches(product_id);
CREATE INDEX IF NOT EXISTS idx_capture_sessions_batch
  ON capture_sessions(batch_id);
CREATE INDEX IF NOT EXISTS idx_readings_batch
  ON readings(batch_id);
CREATE INDEX IF NOT EXISTS idx_readings_session
  ON readings(capture_session_id);
CREATE INDEX IF NOT EXISTS idx_batch_history_batch_created
  ON batch_history(batch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_capture_errors_batch
  ON capture_error_logs(batch_id);

COMMIT;
