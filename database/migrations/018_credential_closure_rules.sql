BEGIN;

-- 018: regras operacionais por credencial e setor.
CREATE OR REPLACE FUNCTION set_batch_completed(
  p_batch_id BIGINT, p_user_id BIGINT, p_application_id BIGINT,
  p_sector_id BIGINT, p_completed BOOLEAN
) RETURNS batches LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_before batches%ROWTYPE;
  v_after batches%ROWTYPE;
  v_role TEXT;
  v_sector TEXT;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = p_user_id AND active;
  SELECT code INTO v_sector FROM sectors WHERE id = p_sector_id AND active;
  IF v_role <> 'operator' OR v_sector NOT IN ('PRODUCTION', 'LABORATORY') THEN
    RAISE EXCEPTION 'Somente operadores de Produção e Laboratório alteram a conclusão' USING ERRCODE = '42501';
  END IF;
  IF NOT p_completed AND v_sector <> 'LABORATORY' THEN
    RAISE EXCEPTION 'Somente o Laboratório pode desmarcar Lote concluído' USING ERRCODE = '42501';
  END IF;
  PERFORM portus_assert_permission(p_user_id, p_application_id, p_sector_id, 'read');
  SELECT * INTO v_before FROM batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;
  IF v_before.status <> 'open' THEN
    RAISE EXCEPTION 'Lote finalizado: reabertura exige Supervisor ou Master' USING ERRCODE = '55000';
  END IF;
  IF v_before.completed = p_completed THEN RETURN v_before; END IF;
  UPDATE batches SET completed = p_completed,
    completed_at = CASE WHEN p_completed THEN now() ELSE NULL END,
    completed_by = CASE WHEN p_completed THEN p_user_id ELSE NULL END,
    version = version + 1
  WHERE id = p_batch_id RETURNING * INTO v_after;
  PERFORM portus_record_batch_history(v_after.id,
    CASE WHEN p_completed THEN 'BATCH_COMPLETED' ELSE 'BATCH_COMPLETION_REVOKED' END,
    v_before.status, v_after.status, v_before.stage, v_after.stage,
    v_before.version, v_after.version, p_user_id, p_application_id, p_sector_id,
    jsonb_build_object('completed', p_completed));
  RETURN v_after;
END; $$;

-- Finalização definitiva: credencial de Laboratório, lote marcado como concluído.
CREATE OR REPLACE FUNCTION supervisor_finalize_batch(
  p_batch_id BIGINT, p_user_id BIGINT, p_application_id BIGINT, p_sector_id BIGINT
) RETURNS batches LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_before batches%ROWTYPE;
  v_after batches%ROWTYPE;
  v_role TEXT;
  v_sector TEXT;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = p_user_id AND active;
  SELECT code INTO v_sector FROM sectors WHERE id = p_sector_id AND active;
  IF v_role <> 'operator' OR v_sector <> 'LABORATORY' THEN
    RAISE EXCEPTION 'Somente a credencial Laboratório pode finalizar o lote' USING ERRCODE = '42501';
  END IF;
  PERFORM portus_assert_permission(p_user_id, p_application_id, p_sector_id, 'read');
  SELECT * INTO v_before FROM batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;
  IF v_before.status = 'closed' THEN RETURN v_before; END IF;
  IF NOT v_before.completed THEN
    RAISE EXCEPTION 'Marque Lote concluído antes de finalizar' USING ERRCODE = '55000';
  END IF;
  UPDATE batches SET status = 'closed', closed_at = now(), closed_by = p_user_id,
    closed_source = portus_application_code(p_application_id), version = version + 1
  WHERE id = p_batch_id RETURNING * INTO v_after;
  PERFORM portus_record_batch_history(v_after.id, 'BATCH_FINALIZED',
    v_before.status, v_after.status, v_before.stage, v_after.stage,
    v_before.version, v_after.version, p_user_id, p_application_id, p_sector_id,
    jsonb_build_object('finalized_by_sector', v_sector));
  RETURN v_after;
END; $$;

-- O banco impede capturas de Produção após a conclusão, inclusive em sessões já iniciadas.
CREATE OR REPLACE FUNCTION portus_block_completed_production_readings()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_closed BOOLEAN;
  v_status TEXT;
  v_sector TEXT;
BEGIN
  SELECT b.completed, b.status, s.code INTO v_closed, v_status, v_sector
    FROM batches b
    JOIN capture_sessions cs ON cs.id = NEW.capture_session_id
    JOIN sectors s ON s.id = cs.sector_id
   WHERE b.id = NEW.batch_id
   FOR UPDATE OF b;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Lote finalizado não aceita novas leituras' USING ERRCODE = '55000';
  END IF;
  IF v_closed AND v_sector = 'PRODUCTION' THEN
    RAISE EXCEPTION 'Produção bloqueada: o Laboratório deve desmarcar Lote concluído' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_portus_block_completed_production_readings ON readings;
CREATE TRIGGER trg_portus_block_completed_production_readings
BEFORE INSERT ON readings FOR EACH ROW
EXECUTE FUNCTION portus_block_completed_production_readings();

-- Reabertura só com justificativa; chamada antiga sem justificativa passa a falhar.
CREATE OR REPLACE FUNCTION master_reopen_batch(
  p_batch_id BIGINT, p_user_id BIGINT, p_application_id BIGINT, p_sector_id BIGINT
) RETURNS batches LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Justificativa obrigatória para reabrir lote' USING ERRCODE = '22023';
END; $$;

CREATE OR REPLACE FUNCTION master_reopen_batch(
  p_batch_id BIGINT, p_user_id BIGINT, p_application_id BIGINT,
  p_sector_id BIGINT, p_justification TEXT
) RETURNS batches LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_before batches%ROWTYPE;
  v_after batches%ROWTYPE;
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = p_user_id AND active;
  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'master') THEN
    RAISE EXCEPTION 'Somente Supervisor ou Master podem reabrir lotes' USING ERRCODE = '42501';
  END IF;
  IF length(trim(COALESCE(p_justification, ''))) < 8 THEN
    RAISE EXCEPTION 'Informe uma justificativa de pelo menos 8 caracteres' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_before FROM batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;
  IF v_before.status <> 'closed' THEN
    RAISE EXCEPTION 'Somente lotes finalizados podem ser reabertos' USING ERRCODE = '55000';
  END IF;
  UPDATE batches SET status='open', closed_at=NULL, closed_by=NULL, closed_source=NULL,
    completed=FALSE, completed_at=NULL, completed_by=NULL,
    production_closed=FALSE, production_closed_at=NULL, production_closed_by=NULL,
    laboratory_closed=FALSE, laboratory_closed_at=NULL, laboratory_closed_by=NULL,
    version=version+1
  WHERE id=p_batch_id RETURNING * INTO v_after;
  PERFORM portus_record_batch_history(v_after.id, 'BATCH_REOPENED',
    v_before.status, v_after.status, v_before.stage, v_after.stage,
    v_before.version, v_after.version, p_user_id, p_application_id, p_sector_id,
    jsonb_build_object('justification',trim(p_justification),
      'previous_closed_at',v_before.closed_at,'reopened_by_role',v_role));
  RETURN v_after;
END; $$;

REVOKE ALL ON FUNCTION master_reopen_batch(BIGINT,BIGINT,BIGINT,BIGINT,TEXT) FROM PUBLIC;
DO $$
DECLARE v_grantee TEXT;
BEGIN
  FOR v_grantee IN
    SELECT DISTINCT grantee FROM information_schema.routine_privileges
    WHERE specific_schema='public' AND routine_name='open_batch'
      AND privilege_type='EXECUTE' AND grantee <> 'PUBLIC'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION master_reopen_batch(BIGINT,BIGINT,BIGINT,BIGINT,TEXT) TO %I',v_grantee);
  END LOOP;
END; $$;
COMMIT;
