BEGIN;

-- 012 — Fluxo unificado de lote, conclusão operacional e finalização supervisionada.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'operator', 'laboratory', 'supervisor', 'master'));

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_completed_consistency_check;
ALTER TABLE batches
  ADD CONSTRAINT batches_completed_consistency_check
  CHECK (
    (completed = FALSE AND completed_at IS NULL AND completed_by IS NULL)
    OR
    (completed = TRUE AND completed_at IS NOT NULL AND completed_by IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION set_batch_completed(
  p_batch_id BIGINT,
  p_user_id BIGINT,
  p_application_id BIGINT,
  p_sector_id BIGINT,
  p_completed BOOLEAN
)
RETURNS batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before batches%ROWTYPE;
  v_after batches%ROWTYPE;
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
    FROM users
   WHERE id = p_user_id
     AND active;

  IF v_role IS NULL OR v_role NOT IN ('operator', 'laboratory', 'admin', 'master') THEN
    RAISE EXCEPTION 'Perfil não autorizado a alterar a conclusão operacional do lote'
      USING ERRCODE = '42501';
  END IF;

  PERFORM portus_assert_permission(
    p_user_id, p_application_id, p_sector_id, 'read'
  );

  SELECT * INTO v_before
    FROM batches
   WHERE id = p_batch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado' USING ERRCODE = '23503';
  END IF;

  IF v_before.status <> 'open' THEN
    RAISE EXCEPTION 'Lote finalizado deve ser reaberto antes de alterar sua conclusão'
      USING ERRCODE = '55000';
  END IF;

  IF v_before.completed = p_completed THEN
    RETURN v_before;
  END IF;

  UPDATE batches
     SET completed = p_completed,
         completed_at = CASE WHEN p_completed THEN now() ELSE NULL END,
         completed_by = CASE WHEN p_completed THEN p_user_id ELSE NULL END,
         version = version + 1
   WHERE id = p_batch_id
  RETURNING * INTO v_after;

  PERFORM portus_record_batch_history(
    v_after.id,
    CASE WHEN p_completed THEN 'BATCH_COMPLETED' ELSE 'BATCH_COMPLETION_REVOKED' END,
    v_before.status, v_after.status,
    v_before.stage, v_after.stage,
    v_before.version, v_after.version,
    p_user_id, p_application_id, p_sector_id,
    jsonb_build_object('completed', p_completed)
  );

  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION ensure_station(
  p_code TEXT,
  p_name TEXT,
  p_sector_code TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sector_id BIGINT;
  v_station_id BIGINT;
  v_code TEXT := trim(p_code);
  v_name TEXT := trim(p_name);
BEGIN
  IF v_code IS NULL OR length(v_code) = 0 THEN
    RAISE EXCEPTION 'Código da estação é obrigatório'
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_sector_id
    FROM sectors
   WHERE code = upper(trim(p_sector_code))
     AND active;

  IF v_sector_id IS NULL THEN
    RAISE EXCEPTION 'Setor físico da estação inválido'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO stations (sector_id, code, name, active)
  VALUES (v_sector_id, v_code, COALESCE(NULLIF(v_name, ''), v_code), TRUE)
  ON CONFLICT (sector_id, code) DO UPDATE
    SET name = EXCLUDED.name,
        active = TRUE
  RETURNING id INTO v_station_id;

  RETURN v_station_id;
END;
$$;

CREATE OR REPLACE FUNCTION supervisor_finalize_batch(
  p_batch_id BIGINT,
  p_user_id BIGINT,
  p_application_id BIGINT,
  p_sector_id BIGINT
)
RETURNS batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before batches%ROWTYPE;
  v_after batches%ROWTYPE;
  v_role TEXT;
  v_source TEXT;
BEGIN
  SELECT role INTO v_role
    FROM users
   WHERE id = p_user_id
     AND active;

  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'master') THEN
    RAISE EXCEPTION 'Somente Supervisor ou Master podem finalizar o lote'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_before
    FROM batches
   WHERE id = p_batch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado' USING ERRCODE = '23503';
  END IF;

  IF v_before.status = 'closed' THEN
    RETURN v_before;
  END IF;

  IF NOT v_before.completed THEN
    RAISE EXCEPTION 'Marque Lote concluído antes da finalização pelo Supervisor'
      USING ERRCODE = '55000';
  END IF;

  v_source := portus_application_code(p_application_id);

  UPDATE batches
     SET status = 'closed',
         closed_at = now(),
         closed_by = p_user_id,
         closed_source = v_source,
         version = version + 1
   WHERE id = p_batch_id
  RETURNING * INTO v_after;

  PERFORM portus_record_batch_history(
    v_after.id, 'BATCH_FINALIZED',
    v_before.status, v_after.status,
    v_before.stage, v_after.stage,
    v_before.version, v_after.version,
    p_user_id, p_application_id, p_sector_id,
    jsonb_build_object(
      'completed_at', v_before.completed_at,
      'finalized_by_role', v_role
    )
  );

  RETURN v_after;
END;
$$;

-- A reabertura passa a ser responsabilidade de Supervisor/Master.
CREATE OR REPLACE FUNCTION master_reopen_batch(
  p_batch_id BIGINT,
  p_user_id BIGINT,
  p_application_id BIGINT,
  p_sector_id BIGINT
)
RETURNS batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before batches%ROWTYPE;
  v_after batches%ROWTYPE;
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
    FROM users
   WHERE id = p_user_id
     AND active;

  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'master') THEN
    RAISE EXCEPTION 'Somente Supervisor ou Master podem reabrir lotes'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_before
    FROM batches
   WHERE id = p_batch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado' USING ERRCODE = '23503';
  END IF;

  IF v_before.status <> 'closed' THEN
    RAISE EXCEPTION 'Somente lotes finalizados podem ser reabertos'
      USING ERRCODE = '55000';
  END IF;

  UPDATE batches
     SET status = 'open',
         closed_at = NULL,
         closed_by = NULL,
         closed_source = NULL,
         completed = FALSE,
         completed_at = NULL,
         completed_by = NULL,
         production_closed = FALSE,
         production_closed_at = NULL,
         production_closed_by = NULL,
         laboratory_closed = FALSE,
         laboratory_closed_at = NULL,
         laboratory_closed_by = NULL,
         version = version + 1
   WHERE id = p_batch_id
  RETURNING * INTO v_after;

  PERFORM portus_record_batch_history(
    v_after.id, 'BATCH_REOPENED',
    v_before.status, v_after.status,
    v_before.stage, v_after.stage,
    v_before.version, v_after.version,
    p_user_id, p_application_id, p_sector_id,
    jsonb_build_object(
      'reason', 'additional_analysis_cycle',
      'previous_closed_at', v_before.closed_at,
      'reopened_by_role', v_role
    )
  );

  RETURN v_after;
END;
$$;

-- Novas funções SECURITY DEFINER não podem manter o EXECUTE padrão de PUBLIC.
REVOKE ALL ON FUNCTION set_batch_completed(BIGINT,BIGINT,BIGINT,BIGINT,BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION ensure_station(TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION supervisor_finalize_batch(BIGINT,BIGINT,BIGINT,BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION master_reopen_batch(BIGINT,BIGINT,BIGINT,BIGINT) FROM PUBLIC;

-- Herda os privilégios de execução das roles operacionais que já podem abrir lote.
-- Isso mantém upgrades "MigrationsOnly" funcionais sem conhecer o nome da role de runtime.
DO $$
DECLARE
  v_grantee TEXT;
BEGIN
  FOR v_grantee IN
    SELECT DISTINCT grantee
      FROM information_schema.routine_privileges
     WHERE specific_schema = 'public'
       AND routine_name = 'open_batch'
       AND privilege_type = 'EXECUTE'
       AND grantee <> 'PUBLIC'
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION set_batch_completed(BIGINT,BIGINT,BIGINT,BIGINT,BOOLEAN) TO %I',
      v_grantee
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION supervisor_finalize_batch(BIGINT,BIGINT,BIGINT,BIGINT) TO %I',
      v_grantee
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION master_reopen_batch(BIGINT,BIGINT,BIGINT,BIGINT) TO %I',
      v_grantee
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION ensure_station(TEXT,TEXT,TEXT) TO %I',
      v_grantee
    );
  END LOOP;
END;
$$;

COMMIT;
