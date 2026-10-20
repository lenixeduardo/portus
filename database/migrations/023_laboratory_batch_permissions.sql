BEGIN;
-- Alinha as funções PostgreSQL aos perfis persistidos pelo cadastro e à matriz aprovada.
-- Não altera usuários, lotes ou histórico já existentes; mantém os grants das funções.
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
  v_user_sector TEXT;
BEGIN
  SELECT role, sector_code INTO v_role, v_user_sector FROM users WHERE id = p_user_id AND active;
  SELECT code INTO v_sector FROM sectors WHERE id = p_sector_id AND active;
  IF v_role IS NULL OR NOT (
    v_role IN ('supervisor', 'master') OR
    (v_role IN ('operator', 'laboratory') AND v_user_sector = v_sector AND
      (v_role = 'operator' OR v_user_sector = 'LABORATORY') AND
      v_sector IN ('PRODUCTION', 'LABORATORY'))
  ) THEN
    RAISE EXCEPTION 'Perfil ou setor não autorizado a alterar a conclusão do lote' USING ERRCODE = '42501';
  END IF;
  IF NOT p_completed AND v_sector <> 'LABORATORY' AND v_role NOT IN ('supervisor', 'master') THEN
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
  v_user_sector TEXT;
BEGIN
  SELECT role, sector_code INTO v_role, v_user_sector FROM users WHERE id = p_user_id AND active;
  SELECT code INTO v_sector FROM sectors WHERE id = p_sector_id AND active;
  IF v_role IS NULL OR NOT (
    v_role IN ('supervisor', 'master') OR
    (v_role IN ('operator', 'laboratory') AND v_user_sector = 'LABORATORY' AND v_sector = 'LABORATORY')
  ) THEN
    RAISE EXCEPTION 'Somente Laboratório, Supervisor ou Master podem finalizar o lote' USING ERRCODE = '42501';
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

COMMIT;
