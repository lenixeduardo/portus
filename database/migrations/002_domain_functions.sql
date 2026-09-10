BEGIN;

CREATE OR REPLACE FUNCTION portus_assert_permission(
  p_user_id BIGINT,
  p_application_id BIGINT,
  p_sector_id BIGINT,
  p_action TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
  v_user_allowed BOOLEAN;
  v_application_allowed BOOLEAN;
BEGIN
  IF p_user_id IS NULL OR p_application_id IS NULL OR p_sector_id IS NULL THEN
    RAISE EXCEPTION 'Usuário, aplicação e setor são obrigatórios'
      USING ERRCODE = '22023';
  END IF;

  SELECT role
    INTO v_role
    FROM users
   WHERE id = p_user_id
     AND active = TRUE;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido ou inativo'
      USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM applications
     WHERE id = p_application_id
       AND active = TRUE
  ) THEN
    RAISE EXCEPTION 'Aplicação inválida ou inativa'
      USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM sectors
     WHERE id = p_sector_id
       AND active = TRUE
  ) THEN
    RAISE EXCEPTION 'Setor inválido ou inativo'
      USING ERRCODE = '22023';
  END IF;

  IF v_role IN ('admin', 'master') THEN
    RETURN;
  END IF;

  SELECT CASE p_action
    WHEN 'read' THEN can_read
    WHEN 'open' THEN can_open
    WHEN 'capture' THEN can_capture
    WHEN 'move' THEN can_move
    WHEN 'confirm_production' THEN can_confirm_production
    WHEN 'confirm_laboratory' THEN can_confirm_laboratory
    ELSE FALSE
  END
    INTO v_user_allowed
    FROM user_sector_permissions
   WHERE user_id = p_user_id
     AND sector_id = p_sector_id;

  SELECT CASE p_action
    WHEN 'read' THEN can_read
    WHEN 'open' THEN can_open
    WHEN 'capture' THEN can_capture
    WHEN 'move' THEN can_move
    WHEN 'confirm_production' THEN can_confirm_production
    WHEN 'confirm_laboratory' THEN can_confirm_laboratory
    ELSE FALSE
  END
    INTO v_application_allowed
    FROM application_sector_permissions
   WHERE application_id = p_application_id
     AND sector_id = p_sector_id;

  IF NOT COALESCE(v_user_allowed, FALSE)
     OR NOT COALESCE(v_application_allowed, FALSE) THEN
    RAISE EXCEPTION 'Operação não autorizada para usuário/aplicação/setor'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION portus_application_code(p_application_id BIGINT)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT code
    FROM applications
   WHERE id = p_application_id
     AND active = TRUE
$$;

CREATE OR REPLACE FUNCTION portus_record_batch_history(
  p_batch_id BIGINT,
  p_action TEXT,
  p_previous_status TEXT,
  p_new_status TEXT,
  p_previous_stage TEXT,
  p_new_stage TEXT,
  p_previous_version BIGINT,
  p_new_version BIGINT,
  p_user_id BIGINT,
  p_application_id BIGINT,
  p_sector_id BIGINT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
AS $$
  INSERT INTO batch_history (
    batch_id, action, previous_status, new_status, previous_stage, new_stage,
    previous_version, new_version, user_id, source_application_id, sector_id, metadata
  )
  VALUES (
    p_batch_id, p_action, p_previous_status, p_new_status, p_previous_stage, p_new_stage,
    p_previous_version, p_new_version, p_user_id, p_application_id, p_sector_id, p_metadata
  )
$$;

CREATE OR REPLACE FUNCTION open_batch(
  p_product_id BIGINT,
  p_code TEXT,
  p_user_id BIGINT,
  p_application_id BIGINT,
  p_sector_id BIGINT,
  p_stage TEXT DEFAULT 'A'
)
RETURNS batches
LANGUAGE plpgsql
AS $$
DECLARE
  v_batch batches%ROWTYPE;
  v_code TEXT := trim(p_code);
BEGIN
  PERFORM portus_assert_permission(
    p_user_id, p_application_id, p_sector_id, 'open'
  );

  IF v_code IS NULL OR length(v_code) = 0 THEN
    RAISE EXCEPTION 'Código do lote é obrigatório'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Produto não encontrado'
      USING ERRCODE = '23503';
  END IF;

  IF p_stage IS NULL OR length(trim(p_stage)) = 0 THEN
    RAISE EXCEPTION 'Etapa do lote é obrigatória'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO batches (
    product_id, code, stage, created_by, opened_source
  )
  VALUES (
    p_product_id, v_code, trim(p_stage), p_user_id,
    portus_application_code(p_application_id)
  )
  RETURNING * INTO v_batch;

  PERFORM portus_record_batch_history(
    v_batch.id, 'BATCH_OPENED', NULL, v_batch.status, NULL, v_batch.stage,
    NULL, v_batch.version, p_user_id, p_application_id, p_sector_id, NULL
  );

  RETURN v_batch;
END;
$$;

CREATE OR REPLACE FUNCTION register_reading(
  p_batch_id BIGINT,
  p_equipment_id BIGINT,
  p_capture_session_id BIGINT,
  p_value_raw TEXT,
  p_value_parsed TEXT,
  p_parse_failure_reason TEXT,
  p_parse_regex_used TEXT,
  p_user_id BIGINT,
  p_application_id BIGINT,
  p_sector_id BIGINT
)
RETURNS readings
LANGUAGE plpgsql
AS $$
DECLARE
  v_batch batches%ROWTYPE;
  v_reading readings%ROWTYPE;
BEGIN
  PERFORM portus_assert_permission(
    p_user_id, p_application_id, p_sector_id, 'capture'
  );

  SELECT *
    INTO v_batch
    FROM batches
   WHERE id = p_batch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado'
      USING ERRCODE = '23503';
  END IF;

  IF v_batch.status <> 'open' THEN
    RAISE EXCEPTION 'Lote fechado não aceita leituras operacionais'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM capture_sessions
     WHERE id = p_capture_session_id
       AND batch_id = p_batch_id
       AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Sessão de captura inválida ou inativa'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO readings (
    batch_id, equipment_id, capture_session_id, value_raw, value_parsed,
    parse_failure_reason, parse_regex_used
  )
  VALUES (
    p_batch_id, p_equipment_id, p_capture_session_id, p_value_raw, p_value_parsed,
    p_parse_failure_reason, p_parse_regex_used
  )
  RETURNING * INTO v_reading;

  RETURN v_reading;
END;
$$;

CREATE OR REPLACE FUNCTION move_batch_to_stage(
  p_batch_id BIGINT,
  p_new_stage TEXT,
  p_user_id BIGINT,
  p_application_id BIGINT,
  p_sector_id BIGINT
)
RETURNS batches
LANGUAGE plpgsql
AS $$
DECLARE
  v_before batches%ROWTYPE;
  v_after batches%ROWTYPE;
BEGIN
  PERFORM portus_assert_permission(
    p_user_id, p_application_id, p_sector_id, 'move'
  );

  SELECT *
    INTO v_before
    FROM batches
   WHERE id = p_batch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado'
      USING ERRCODE = '23503';
  END IF;

  IF v_before.status <> 'open' THEN
    RAISE EXCEPTION 'Lote fechado não pode ser movimentado'
      USING ERRCODE = '55000';
  END IF;

  IF p_new_stage IS NULL OR length(trim(p_new_stage)) = 0 THEN
    RAISE EXCEPTION 'Nova etapa é obrigatória'
      USING ERRCODE = '22023';
  END IF;

  IF v_before.stage = trim(p_new_stage) THEN
    RETURN v_before;
  END IF;

  UPDATE batches
     SET stage = trim(p_new_stage),
         version = version + 1
   WHERE id = p_batch_id
  RETURNING * INTO v_after;

  PERFORM portus_record_batch_history(
    v_after.id, 'STAGE_CHANGED', v_before.status, v_after.status,
    v_before.stage, v_after.stage, v_before.version, v_after.version,
    p_user_id, p_application_id, p_sector_id, NULL
  );

  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION confirm_production_close(
  p_batch_id BIGINT,
  p_user_id BIGINT,
  p_application_id BIGINT,
  p_sector_id BIGINT
)
RETURNS batches
LANGUAGE plpgsql
AS $$
DECLARE
  v_before batches%ROWTYPE;
  v_after batches%ROWTYPE;
  v_source TEXT;
BEGIN
  PERFORM portus_assert_permission(
    p_user_id, p_application_id, p_sector_id, 'confirm_production'
  );

  SELECT *
    INTO v_before
    FROM batches
   WHERE id = p_batch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado'
      USING ERRCODE = '23503';
  END IF;

  IF v_before.production_closed THEN
    RETURN v_before;
  END IF;

  IF v_before.status <> 'open' THEN
    RAISE EXCEPTION 'Lote já está fechado'
      USING ERRCODE = '55000';
  END IF;

  v_source := portus_application_code(p_application_id);

  UPDATE batches
     SET production_closed = TRUE,
         production_closed_at = now(),
         production_closed_by = p_user_id,
         status = CASE WHEN laboratory_closed THEN 'closed' ELSE status END,
         closed_at = CASE WHEN laboratory_closed THEN now() ELSE closed_at END,
         closed_by = CASE WHEN laboratory_closed THEN p_user_id ELSE closed_by END,
         closed_source = CASE WHEN laboratory_closed THEN v_source ELSE closed_source END,
         version = version + 1
   WHERE id = p_batch_id
  RETURNING * INTO v_after;

  PERFORM portus_record_batch_history(
    v_after.id, 'PRODUCTION_CLOSE_CONFIRMED',
    v_before.status, v_after.status, v_before.stage, v_after.stage,
    v_before.version, v_after.version, p_user_id, p_application_id, p_sector_id, NULL
  );

  IF v_after.status = 'closed' THEN
    PERFORM portus_record_batch_history(
      v_after.id, 'BATCH_CLOSED',
      v_before.status, v_after.status, v_before.stage, v_after.stage,
      v_after.version, v_after.version, p_user_id, p_application_id, p_sector_id,
      jsonb_build_object('reason', 'production_and_laboratory_confirmed')
    );
  END IF;

  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION confirm_laboratory_close(
  p_batch_id BIGINT,
  p_user_id BIGINT,
  p_application_id BIGINT,
  p_sector_id BIGINT
)
RETURNS batches
LANGUAGE plpgsql
AS $$
DECLARE
  v_before batches%ROWTYPE;
  v_after batches%ROWTYPE;
  v_source TEXT;
BEGIN
  PERFORM portus_assert_permission(
    p_user_id, p_application_id, p_sector_id, 'confirm_laboratory'
  );

  SELECT *
    INTO v_before
    FROM batches
   WHERE id = p_batch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado'
      USING ERRCODE = '23503';
  END IF;

  IF v_before.laboratory_closed THEN
    RETURN v_before;
  END IF;

  IF v_before.status <> 'open' THEN
    RAISE EXCEPTION 'Lote já está fechado'
      USING ERRCODE = '55000';
  END IF;

  v_source := portus_application_code(p_application_id);

  UPDATE batches
     SET laboratory_closed = TRUE,
         laboratory_closed_at = now(),
         laboratory_closed_by = p_user_id,
         status = CASE WHEN production_closed THEN 'closed' ELSE status END,
         closed_at = CASE WHEN production_closed THEN now() ELSE closed_at END,
         closed_by = CASE WHEN production_closed THEN p_user_id ELSE closed_by END,
         closed_source = CASE WHEN production_closed THEN v_source ELSE closed_source END,
         version = version + 1
   WHERE id = p_batch_id
  RETURNING * INTO v_after;

  PERFORM portus_record_batch_history(
    v_after.id, 'LABORATORY_CLOSE_CONFIRMED',
    v_before.status, v_after.status, v_before.stage, v_after.stage,
    v_before.version, v_after.version, p_user_id, p_application_id, p_sector_id, NULL
  );

  IF v_after.status = 'closed' THEN
    PERFORM portus_record_batch_history(
      v_after.id, 'BATCH_CLOSED',
      v_before.status, v_after.status, v_before.stage, v_after.stage,
      v_after.version, v_after.version, p_user_id, p_application_id, p_sector_id,
      jsonb_build_object('reason', 'production_and_laboratory_confirmed')
    );
  END IF;

  RETURN v_after;
END;
$$;

COMMIT;
