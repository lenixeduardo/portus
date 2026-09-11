\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_app BIGINT;
  v_sector BIGINT;
  v_master BIGINT;
  v_operator BIGINT;
  v_product BIGINT;
  v_batch BIGINT;
  v_before_version BIGINT;
  v_after batches%ROWTYPE;
  v_denied BOOLEAN := FALSE;
BEGIN
  SELECT id INTO v_app FROM applications WHERE code = 'PORTUS';
  SELECT id INTO v_sector FROM sectors WHERE code = 'PRODUCTION';

  INSERT INTO users (username, password_hash, role, active)
  VALUES ('master_reopen_test', 'not-used', 'master', TRUE)
  ON CONFLICT (username) DO UPDATE SET role = 'master', active = TRUE
  RETURNING id INTO v_master;

  INSERT INTO users (username, password_hash, role, active)
  VALUES ('operator_reopen_test', 'not-used', 'operator', TRUE)
  ON CONFLICT (username) DO UPDATE SET role = 'operator', active = TRUE
  RETURNING id INTO v_operator;

  INSERT INTO user_sector_permissions (
    user_id, sector_id, can_read, can_open, can_capture, can_move,
    can_confirm_production, can_confirm_laboratory
  ) VALUES
    (v_master, v_sector, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    (v_operator, v_sector, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
  ON CONFLICT (user_id, sector_id) DO UPDATE SET
    can_read = TRUE, can_open = TRUE, can_capture = TRUE, can_move = TRUE,
    can_confirm_production = TRUE, can_confirm_laboratory = TRUE;

  INSERT INTO application_sector_permissions (
    application_id, sector_id, can_read, can_open, can_capture, can_move,
    can_confirm_production, can_confirm_laboratory
  ) VALUES (v_app, v_sector, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
  ON CONFLICT (application_id, sector_id) DO UPDATE SET
    can_read = TRUE, can_open = TRUE, can_capture = TRUE, can_move = TRUE,
    can_confirm_production = TRUE, can_confirm_laboratory = TRUE;

  INSERT INTO products (name, created_by)
  VALUES ('Master Reopen Test Product', v_master)
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
  RETURNING id INTO v_product;

  DELETE FROM batches WHERE code = 'MASTER-REOPEN-TEST';
  SELECT id INTO v_batch
    FROM open_batch(v_product, 'MASTER-REOPEN-TEST', v_master, v_app, v_sector, 'C');

  UPDATE batches
     SET status = 'closed', closed_at = now(), closed_by = v_master,
         closed_source = 'PORTUS', production_closed = TRUE,
         production_closed_at = now(), production_closed_by = v_master,
         laboratory_closed = TRUE, laboratory_closed_at = now(),
         laboratory_closed_by = v_master, version = version + 1
   WHERE id = v_batch
  RETURNING version INTO v_before_version;

  BEGIN
    PERFORM master_reopen_batch(v_batch, v_operator, v_app, v_sector);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := TRUE;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Operador conseguiu reabrir lote';
  END IF;

  SELECT * INTO v_after
    FROM master_reopen_batch(v_batch, v_master, v_app, v_sector);

  IF v_after.status <> 'open'
     OR v_after.stage <> 'A'
     OR v_after.production_closed
     OR v_after.laboratory_closed
     OR v_after.closed_at IS NOT NULL
     OR v_after.version <> v_before_version + 1 THEN
    RAISE EXCEPTION 'Estado do lote reaberto é inválido';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM batch_history
     WHERE batch_id = v_batch AND action = 'BATCH_REOPENED_BY_MASTER'
  ) THEN
    RAISE EXCEPTION 'Auditoria da reabertura não foi registrada';
  END IF;

  RAISE NOTICE 'Master reopen test OK: batch_id=%', v_batch;
END;
$$;

ROLLBACK;
