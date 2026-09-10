\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_app_portus BIGINT;
  v_app_software BIGINT;
  v_sector_production BIGINT;
  v_sector_laboratory BIGINT;
  v_user BIGINT;
  v_product BIGINT;
  v_batch BIGINT;
  v_batch_row batches%ROWTYPE;
  v_history_count BIGINT;
BEGIN
  SELECT id INTO v_app_portus FROM applications WHERE code = 'PORTUS';
  SELECT id INTO v_app_software FROM applications WHERE code = 'SOFTWARE_B';
  SELECT id INTO v_sector_production FROM sectors WHERE code = 'PRODUCTION';
  SELECT id INTO v_sector_laboratory FROM sectors WHERE code = 'LABORATORY';

  IF v_app_portus IS NULL OR v_app_software IS NULL
     OR v_sector_production IS NULL OR v_sector_laboratory IS NULL THEN
    RAISE EXCEPTION 'Seed de referência não aplicado';
  END IF;

  INSERT INTO users (
    username, password_hash, display_name, role
  )
  VALUES (
    'stage1_test_operator', 'not-used-in-database-test',
    'Stage 1 Test Operator', 'operator'
  )
  ON CONFLICT (username) DO UPDATE
    SET active = TRUE, role = EXCLUDED.role
  RETURNING id INTO v_user;

  INSERT INTO user_sector_permissions (
    user_id, sector_id, can_read, can_open, can_capture, can_move,
    can_confirm_production, can_confirm_laboratory
  )
  VALUES
    (v_user, v_sector_production, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE),
    (v_user, v_sector_laboratory, TRUE, FALSE, TRUE, TRUE, FALSE, TRUE)
  ON CONFLICT (user_id, sector_id) DO UPDATE SET
    can_read = EXCLUDED.can_read,
    can_open = EXCLUDED.can_open,
    can_capture = EXCLUDED.can_capture,
    can_move = EXCLUDED.can_move,
    can_confirm_production = EXCLUDED.can_confirm_production,
    can_confirm_laboratory = EXCLUDED.can_confirm_laboratory;

  INSERT INTO application_sector_permissions (
    application_id, sector_id, can_read, can_open, can_capture, can_move,
    can_confirm_production, can_confirm_laboratory
  )
  VALUES
    (v_app_portus, v_sector_production, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE),
    (v_app_portus, v_sector_laboratory, TRUE, FALSE, TRUE, TRUE, FALSE, TRUE)
  ON CONFLICT (application_id, sector_id) DO UPDATE SET
    can_read = EXCLUDED.can_read,
    can_open = EXCLUDED.can_open,
    can_capture = EXCLUDED.can_capture,
    can_move = EXCLUDED.can_move,
    can_confirm_production = EXCLUDED.can_confirm_production,
    can_confirm_laboratory = EXCLUDED.can_confirm_laboratory;

  INSERT INTO products (name, description, created_by)
  VALUES ('Stage 1 Test Product', 'Disposable validation fixture', v_user)
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
  RETURNING id INTO v_product;

  DELETE FROM batches WHERE code = 'STAGE1-TEST-BATCH';

  SELECT id
    INTO v_batch
    FROM open_batch(
      v_product,
      'STAGE1-TEST-BATCH',
      v_user,
      v_app_portus,
      v_sector_production,
      'A'
    );

  SELECT *
    INTO v_batch_row
    FROM batches
   WHERE id = v_batch;

  IF v_batch_row.status <> 'open' OR v_batch_row.version <> 0 THEN
    RAISE EXCEPTION 'open_batch não criou o lote esperado';
  END IF;

  SELECT *
    INTO v_batch_row
    FROM move_batch_to_stage(
      v_batch,
      'B',
      v_user,
      v_app_portus,
      v_sector_production
    );

  IF v_batch_row.stage <> 'B' OR v_batch_row.version <> 1 THEN
    RAISE EXCEPTION 'move_batch_to_stage não incrementou versão/etapa';
  END IF;

  SELECT *
    INTO v_batch_row
    FROM confirm_production_close(
      v_batch,
      v_user,
      v_app_portus,
      v_sector_production
    );

  IF v_batch_row.status <> 'open'
     OR NOT v_batch_row.production_closed
     OR v_batch_row.laboratory_closed THEN
    RAISE EXCEPTION 'Produção não deve fechar o lote globalmente';
  END IF;

  SELECT *
    INTO v_batch_row
    FROM confirm_laboratory_close(
      v_batch,
      v_user,
      v_app_portus,
      v_sector_laboratory
    );

  IF v_batch_row.status <> 'closed'
     OR NOT v_batch_row.production_closed
     OR NOT v_batch_row.laboratory_closed
     OR v_batch_row.closed_at IS NULL THEN
    RAISE EXCEPTION 'Lote não fechou após as duas confirmações';
  END IF;

  PERFORM confirm_laboratory_close(
    v_batch,
    v_user,
    v_app_portus,
    v_sector_laboratory
  );

  SELECT count(*)
    INTO v_history_count
    FROM batch_history
   WHERE batch_id = v_batch;

  IF v_history_count < 4 THEN
    RAISE EXCEPTION 'Histórico incompleto: % registros', v_history_count;
  END IF;

  RAISE NOTICE 'Stage 1 domain test OK: batch_id=%, history=%',
    v_batch, v_history_count;
END;
$$;

ROLLBACK;
