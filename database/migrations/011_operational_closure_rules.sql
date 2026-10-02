BEGIN;

-- Consolida o perfil operacional do Laboratório: captura e fechamento são
-- responsabilidades do mesmo perfil. Usuários antigos de fechamento passam
-- a operar como perfil de captura no cliente local; na base central as
-- permissões são sincronizadas pelo PORTUS no login.

-- A exceção de fechamento sem atividade/confirmações é exclusiva do Master.
CREATE OR REPLACE FUNCTION admin_close_batch(
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

  IF v_role IS NULL OR v_role <> 'master' THEN
    RAISE EXCEPTION 'Somente o Master pode finalizar um lote sem atividade ou confirmações setoriais'
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

  v_source := portus_application_code(p_application_id);

  UPDATE batches
     SET production_closed = TRUE,
         production_closed_at = COALESCE(production_closed_at, now()),
         production_closed_by = COALESCE(production_closed_by, p_user_id),
         laboratory_closed = TRUE,
         laboratory_closed_at = COALESCE(laboratory_closed_at, now()),
         laboratory_closed_by = COALESCE(laboratory_closed_by, p_user_id),
         status = 'closed',
         closed_at = now(),
         closed_by = p_user_id,
         closed_source = v_source,
         version = version + 1
   WHERE id = p_batch_id
  RETURNING * INTO v_after;

  PERFORM portus_record_batch_history(
    v_after.id, 'MASTER_BATCH_CLOSED',
    v_before.status, v_after.status,
    v_before.stage, v_after.stage,
    v_before.version, v_after.version,
    p_user_id, p_application_id, p_sector_id,
    jsonb_build_object('reason', 'master_override_without_activity')
  );

  RETURN v_after;
END;
$$;

COMMIT;
