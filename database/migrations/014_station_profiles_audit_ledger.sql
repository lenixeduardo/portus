BEGIN;

-- Configuração unificada por estação e trilha de migração auditável.
CREATE TABLE IF NOT EXISTS portus_station_settings (
  station_code TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (station_code, key)
);

CREATE TABLE IF NOT EXISTS portus_station_equipment_profiles (
  station_code TEXT NOT NULL,
  slot_index INTEGER NOT NULL CHECK (slot_index BETWEEN 1 AND 64),
  equipment_id BIGINT NOT NULL REFERENCES equipments(id) ON DELETE RESTRICT,
  config JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (station_code, slot_index)
);

ALTER TABLE capture_error_logs ADD COLUMN IF NOT EXISTS slot_index INTEGER;

CREATE TABLE IF NOT EXISTS portus_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  station_code TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portus_audit_log_time_idx
  ON portus_audit_log (created_at DESC);

CREATE TABLE IF NOT EXISTS portus_auto_exports (
  batch_id BIGINT PRIMARY KEY REFERENCES batches(id) ON DELETE CASCADE,
  export_path TEXT NOT NULL,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portus_legacy_import_ledger (
  station_code TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  local_id BIGINT NOT NULL,
  central_id BIGINT NOT NULL,
  source_hash TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (station_code, entity_type, local_id)
);

INSERT INTO equipments (code, name, enabled)
VALUES
 ('ESPECTROFOTOMETRO', 'Espectrofotômetro', TRUE),
 ('BALANCA', 'Balança', TRUE),
 ('VISCOSIMETRO', 'Viscosímetro', TRUE),
 ('PH_METRO', 'pH-metro', TRUE),
 ('REFRATOMETRO', 'Refratômetro', TRUE),
 ('RESERVA', 'Reserva', TRUE)
ON CONFLICT (code) DO NOTHING;

-- O usuário runtime obtém somente os privilégios necessários, inclusive
-- quando o instalador roda em modo MigrationsOnly.
DO $$
DECLARE
  v_grantee TEXT;
BEGIN
  FOR v_grantee IN
    SELECT DISTINCT grantee
    FROM information_schema.routine_privileges
    WHERE specific_schema='public' AND routine_name='open_batch'
      AND privilege_type='EXECUTE' AND grantee <> 'PUBLIC'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON portus_station_settings TO %I', v_grantee);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON portus_station_equipment_profiles TO %I', v_grantee);
    EXECUTE format('GRANT SELECT, INSERT ON portus_audit_log TO %I', v_grantee);
    EXECUTE format('GRANT INSERT ON capture_error_logs TO %I', v_grantee);
    EXECUTE format('GRANT SELECT, INSERT ON portus_legacy_import_ledger TO %I', v_grantee);
    EXECUTE format('GRANT SELECT, INSERT ON portus_auto_exports TO %I', v_grantee);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE portus_audit_log_id_seq TO %I', v_grantee);
  END LOOP;
END;
$$;

-- Permissões de ambas as aplicações para a leitura compartilhada do lote.
INSERT INTO application_sector_permissions
  (application_id,sector_id,can_read,can_open,can_capture,can_move,
   can_confirm_production,can_confirm_laboratory)
SELECT a.id,s.id,TRUE,
       (a.code='PORTUS' AND s.code='PRODUCTION') OR
       (a.code='PORTUS_LABORATORY' AND s.code='LABORATORY'),
       (a.code='PORTUS' AND s.code='PRODUCTION') OR
       (a.code='PORTUS_LABORATORY' AND s.code='LABORATORY'),
       a.code='PORTUS' AND s.code='PRODUCTION',
       FALSE,FALSE
FROM applications a CROSS JOIN sectors s
WHERE a.code IN ('PORTUS','PORTUS_LABORATORY')
  AND s.code IN ('PRODUCTION','LABORATORY')
ON CONFLICT(application_id,sector_id) DO UPDATE SET
 can_read=EXCLUDED.can_read,
 can_open=EXCLUDED.can_open,
 can_capture=EXCLUDED.can_capture,
 can_move=EXCLUDED.can_move;

COMMIT;
