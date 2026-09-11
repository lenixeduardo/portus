BEGIN;

-- Reabre um lote concluído sem apagar leituras ou sessões anteriores.
-- A nova passagem operacional é identificada no histórico auditável do lote.
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

  IF v_role IS DISTINCT FROM 'master' THEN
    RAISE EXCEPTION 'Somente o usuário Master pode reabrir lotes'
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
    RAISE EXCEPTION 'Somente lotes encerrados podem ser reabertos'
      USING ERRCODE = '55000';
  END IF;

  UPDATE batches
     SET status = 'open',
         stage = 'A',
         closed_at = NULL,
         closed_by = NULL,
         closed_source = NULL,
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
    v_after.id, 'BATCH_REOPENED_BY_MASTER',
    v_before.status, v_after.status,
    v_before.stage, v_after.stage,
    v_before.version, v_after.version,
    p_user_id, p_application_id, p_sector_id,
    jsonb_build_object(
      'reason', 'new_production_and_laboratory_cycle',
      'previous_closed_at', v_before.closed_at
    )
  );

  RETURN v_after;
END;
$$;

COMMIT;
