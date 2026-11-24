CREATE FUNCTION public.lab_assert_actor(
  p_user_id BIGINT, p_application_id BIGINT, p_sector_id BIGINT, p_action TEXT
) RETURNS TEXT LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_role TEXT;
  v_user_sector TEXT;
  v_sector TEXT;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('read', 'capture', 'review') THEN
    RAISE EXCEPTION 'Operação laboratorial inválida' USING ERRCODE = '22023';
  END IF;

  SELECT role, sector_code INTO v_role, v_user_sector
    FROM public.users WHERE id = p_user_id AND active FOR SHARE;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido ou inativo' USING ERRCODE = '28000';
  END IF;
  PERFORM 1 FROM public.applications WHERE id = p_application_id AND active FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aplicação inválida ou inativa' USING ERRCODE = '28000';
  END IF;
  SELECT code INTO v_sector FROM public.sectors WHERE id = p_sector_id AND active FOR SHARE;
  IF v_sector IS DISTINCT FROM 'LABORATORY' OR NOT (
    v_role IN ('supervisor', 'master') OR
    (p_action <> 'review' AND v_role IN ('operator', 'laboratory')
                          AND COALESCE(v_user_sector = v_sector, FALSE))
  ) THEN
    RAISE EXCEPTION 'Perfil ou setor sem autorização laboratorial' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'master' THEN
    PERFORM 1 FROM public.user_sector_permissions
      WHERE user_id = p_user_id AND sector_id = p_sector_id FOR SHARE;
    PERFORM 1 FROM public.application_sector_permissions
      WHERE application_id = p_application_id AND sector_id = p_sector_id FOR SHARE;
  END IF;
  PERFORM public.portus_assert_permission(
    p_user_id, p_application_id, p_sector_id,
    CASE WHEN p_action = 'capture' THEN 'capture' ELSE 'read' END
  );
  RETURN v_role;
END;
$$;

CREATE FUNCTION public.lab_approve_template(
  p_template_version_id BIGINT, p_user_id BIGINT, p_application_id BIGINT, p_sector_id BIGINT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.lab_assert_actor(p_user_id, p_application_id, p_sector_id, 'review');
  UPDATE public.lab_template_versions
    SET status = 'approved', approved_by = p_user_id, approved_at = statement_timestamp()
    WHERE id = p_template_version_id AND status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Versão de modelo em rascunho não encontrada' USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE FUNCTION public.lab_approve_specification(
  p_specification_id BIGINT, p_user_id BIGINT, p_application_id BIGINT, p_sector_id BIGINT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.lab_assert_actor(p_user_id, p_application_id, p_sector_id, 'review');
  UPDATE public.lab_product_specifications
    SET status = 'approved', approved_by = p_user_id, approved_at = statement_timestamp()
    WHERE id = p_specification_id AND status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Especificação em rascunho não encontrada' USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE FUNCTION public.lab_start_analysis(
  p_batch_id BIGINT, p_specification_id BIGINT, p_user_id BIGINT, p_application_id BIGINT, p_sector_id BIGINT
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_batch public.batches%ROWTYPE;
  v_spec public.lab_product_specifications%ROWTYPE;
  v_revision INTEGER;
  v_id BIGINT;
BEGIN
  PERFORM public.lab_assert_actor(p_user_id, p_application_id, p_sector_id, 'capture');
  v_batch := public.lab_touch_batch(p_batch_id);
  SELECT * INTO STRICT v_spec FROM public.lab_product_specifications WHERE id = p_specification_id;
  SELECT COALESCE(max(revision), 0) + 1 INTO v_revision
    FROM public.lab_analysis_runs WHERE batch_id = v_batch.id AND cycle = v_batch.lab_analysis_cycle;
  INSERT INTO public.lab_analysis_runs
    (batch_id, product_id, specification_id, template_version_id, cycle, revision, created_by)
    VALUES (v_batch.id, v_batch.product_id, v_spec.id, v_spec.template_version_id, v_batch.lab_analysis_cycle,
            v_revision, p_user_id)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.lab_add_sample(
  p_run_id BIGINT, p_identification TEXT, p_user_id BIGINT, p_application_id BIGINT, p_sector_id BIGINT
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_id BIGINT;
BEGIN
  PERFORM public.lab_assert_actor(p_user_id, p_application_id, p_sector_id, 'capture');
  PERFORM public.lab_lock_current_analysis(p_run_id);
  INSERT INTO public.lab_samples (analysis_run_id, identification, created_by)
    VALUES (p_run_id, p_identification, p_user_id) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.lab_record_result(
  p_run_id BIGINT, p_sample_id BIGINT, p_parameter_id BIGINT, p_numeric_value NUMERIC,
  p_qualitative_value TEXT, p_unit TEXT, p_reading_id BIGINT,
  p_user_id BIGINT, p_application_id BIGINT, p_sector_id BIGINT, p_reason TEXT DEFAULT NULL
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_run public.lab_analysis_runs%ROWTYPE;
  v_parameter public.lab_template_parameters%ROWTYPE;
  v_previous public.lab_results%ROWTYPE;
  v_id BIGINT;
BEGIN
  PERFORM public.lab_assert_actor(p_user_id, p_application_id, p_sector_id, 'capture');
  v_run := public.lab_lock_current_analysis(p_run_id);
  SELECT * INTO STRICT v_parameter FROM public.lab_template_parameters
    WHERE template_version_id = v_run.template_version_id AND parameter_id = p_parameter_id;
  IF v_parameter.origin = 'calculated' THEN
    RAISE EXCEPTION 'Parâmetro exige a função de cálculo versionada' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_previous
    FROM public.lab_results WHERE analysis_run_id = p_run_id
      AND sample_id = p_sample_id AND parameter_id = p_parameter_id
    ORDER BY revision DESC LIMIT 1;
  IF FOUND THEN
    IF NULLIF(btrim(p_reason), '') IS NULL THEN
      RAISE EXCEPTION 'Revisar resultado exige justificativa' USING ERRCODE = '22023';
    END IF;
    UPDATE public.lab_results SET invalidated_at = clock_timestamp(), invalidated_by = p_user_id,
      invalidation_reason = btrim(p_reason)
      WHERE id = v_previous.id AND invalidated_at IS NULL;
  END IF;
  INSERT INTO public.lab_results
    (analysis_run_id, template_version_id, batch_id, sample_id, parameter_id, value_type, numeric_value,
     qualitative_value, unit, reading_id, origin, revision, created_by)
  VALUES (v_run.id, v_run.template_version_id, v_run.batch_id, p_sample_id, p_parameter_id,
          v_parameter.value_type, p_numeric_value, p_qualitative_value, p_unit, p_reading_id,
          v_parameter.origin, COALESCE(v_previous.revision, 0) + 1, p_user_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.lab_invalidate_analysis(
  p_run_id BIGINT, p_reason TEXT, p_user_id BIGINT, p_application_id BIGINT, p_sector_id BIGINT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.lab_assert_actor(p_user_id, p_application_id, p_sector_id, 'review');
  PERFORM public.lab_lock_current_analysis(p_run_id);
  UPDATE public.lab_analysis_runs
    SET invalidated_at = statement_timestamp(), invalidated_by = p_user_id, invalidation_reason = p_reason
    WHERE id = p_run_id;
  INSERT INTO public.portus_audit_log (actor_user_id, station_code, action, resource_type, resource_id, details)
    VALUES (p_user_id, 'LABORATORY', 'lab.analysis.invalidated', 'lab_analysis_run', p_run_id::TEXT,
            jsonb_build_object('reason', p_reason, 'application_id', p_application_id, 'sector_id', p_sector_id));
END;
$$;

CREATE FUNCTION public.lab_evaluate_conformity(
  p_run_id BIGINT, p_user_id BIGINT, p_application_id BIGINT, p_sector_id BIGINT
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_snapshot JSONB;
  v_hash BYTEA;
  v_evaluation_id BIGINT;
BEGIN
  PERFORM public.lab_assert_actor(p_user_id, p_application_id, p_sector_id, 'capture');
  PERFORM public.lab_lock_current_analysis(p_run_id);
  v_snapshot := public.lab_build_conformity_snapshot(p_run_id);
  v_hash := sha256(convert_to(v_snapshot::TEXT, 'UTF8'));
  SELECT id INTO v_evaluation_id FROM public.lab_conformity_evaluations
    WHERE analysis_run_id = p_run_id AND evidence_sha256 = v_hash AND evidence = v_snapshot
    ORDER BY id DESC LIMIT 1;
  IF FOUND THEN
    RETURN v_evaluation_id;
  END IF;

  INSERT INTO public.lab_conformity_evaluations (analysis_run_id, assessed_by, outcome, evidence, evidence_sha256)
    VALUES (p_run_id, p_user_id, v_snapshot->>'outcome', v_snapshot, v_hash)
    RETURNING id INTO v_evaluation_id;

  INSERT INTO public.lab_conformity_items (evaluation_id, sample_id, parameter_id, result_id, outcome, evidence)
  SELECT v_evaluation_id, (item->>'sample_id')::BIGINT, (item->>'parameter_id')::BIGINT,
         (item->>'result_id')::BIGINT, item->>'outcome', item
    FROM jsonb_array_elements(v_snapshot->'items') AS entries(item);

  INSERT INTO public.portus_audit_log (actor_user_id, station_code, action, resource_type, resource_id, details)
    VALUES (p_user_id, 'LABORATORY', 'lab.conformity.evaluated', 'lab_conformity_evaluation', v_evaluation_id::TEXT,
            jsonb_build_object('analysis_run_id', p_run_id, 'outcome', v_snapshot->>'outcome',
                               'evidence_sha256', encode(v_hash, 'hex'), 'application_id', p_application_id,
                               'sector_id', p_sector_id));
  RETURN v_evaluation_id;
END;
$$;

CREATE FUNCTION public.lab_decide_conformity(
  p_evaluation_id BIGINT, p_decision TEXT, p_reason TEXT,
  p_user_id BIGINT, p_application_id BIGINT, p_sector_id BIGINT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_role TEXT;
  v_evaluation public.lab_conformity_evaluations%ROWTYPE;
  v_run public.lab_analysis_runs%ROWTYPE;
BEGIN
  v_role := public.lab_assert_actor(p_user_id, p_application_id, p_sector_id, 'review');
  SELECT * INTO STRICT v_evaluation FROM public.lab_conformity_evaluations WHERE id = p_evaluation_id;
  v_run := public.lab_lock_current_analysis(v_evaluation.analysis_run_id);
  IF v_run.created_by = p_user_id OR v_evaluation.assessed_by = p_user_id OR EXISTS (
    SELECT 1 FROM public.lab_samples WHERE analysis_run_id = v_run.id AND created_by = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.lab_results WHERE analysis_run_id = v_run.id AND created_by = p_user_id
  ) THEN
    RAISE EXCEPTION 'O revisor não pode ter registrado a análise, amostras ou resultados nem realizado a avaliação'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lab_conformity_evaluations
      WHERE analysis_run_id = v_run.id AND id > v_evaluation.id
  ) OR v_evaluation.evidence IS DISTINCT FROM public.lab_build_conformity_snapshot(v_run.id) THEN
    RAISE EXCEPTION 'A avaliação foi substituída ou a evidência foi alterada' USING ERRCODE = '55000';
  END IF;
  IF p_decision = 'approved' AND v_evaluation.outcome <> 'conforming' THEN
    RAISE EXCEPTION 'Somente evidência conforme pode ser aprovada' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.lab_approvals (evaluation_id, decision, decided_by, actor_role, reason)
    VALUES (p_evaluation_id, p_decision, p_user_id, v_role, btrim(p_reason));
  INSERT INTO public.portus_audit_log (actor_user_id, station_code, action, resource_type, resource_id, details)
    VALUES (p_user_id, 'LABORATORY', 'lab.conformity.decided', 'lab_conformity_evaluation', p_evaluation_id::TEXT,
            jsonb_build_object('analysis_run_id', v_run.id, 'decision', p_decision, 'reason', btrim(p_reason),
                               'evidence_sha256', encode(v_evaluation.evidence_sha256, 'hex'),
                               'application_id', p_application_id, 'sector_id', p_sector_id));
END;
$$;

CREATE FUNCTION public.lab_get_conformity(
  p_run_id BIGINT, p_user_id BIGINT, p_application_id BIGINT, p_sector_id BIGINT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_history JSONB;
BEGIN
  PERFORM public.lab_assert_actor(p_user_id, p_application_id, p_sector_id, 'read');
  SELECT COALESCE(jsonb_agg(
           to_jsonb(evaluation) || jsonb_build_object('approval', to_jsonb(approval)) ORDER BY evaluation.id
         ), '[]'::JSONB)
    INTO v_history
    FROM public.lab_conformity_evaluations evaluation
    LEFT JOIN public.lab_approvals approval ON approval.evaluation_id = evaluation.id
   WHERE evaluation.analysis_run_id = p_run_id;
  RETURN v_history;
END;
$$;

-- Preserve existing deployment-specific runtime credentials. Database owners
-- call this at upgrades and after legacy installer grants on a clean install.
CREATE FUNCTION public.lab_grant_runtime(p_role NAME)
RETURNS VOID LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_object RECORD;
BEGIN
  FOR v_object IN SELECT relname, relkind FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND left(relname, 4) = 'lab_'
      AND relkind IN ('r', 'p', 'v', 'm', 'S')
  LOOP
    EXECUTE format('REVOKE ALL ON %s public.%I FROM %I',
      CASE WHEN v_object.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, v_object.relname, p_role);
  END LOOP;

  FOR v_object IN SELECT oid::regprocedure AS signature, proname FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND left(proname, 4) = 'lab_' AND prokind = 'f'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I', v_object.signature, p_role);
  END LOOP;

  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.lab_approve_template(BIGINT, BIGINT, BIGINT, BIGINT),
      public.lab_approve_specification(BIGINT, BIGINT, BIGINT, BIGINT),
      public.lab_start_analysis(BIGINT, BIGINT, BIGINT, BIGINT, BIGINT),
      public.lab_add_sample(BIGINT, TEXT, BIGINT, BIGINT, BIGINT),
      public.lab_record_result(BIGINT, BIGINT, BIGINT, NUMERIC, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT),
      public.lab_record_calculation(BIGINT, BIGINT, BIGINT, TEXT, INTEGER, JSONB, BIGINT, BIGINT, BIGINT, TEXT),
      public.lab_invalidate_analysis(BIGINT, TEXT, BIGINT, BIGINT, BIGINT),
      public.lab_evaluate_conformity(BIGINT, BIGINT, BIGINT, BIGINT),
      public.lab_decide_conformity(BIGINT, TEXT, TEXT, BIGINT, BIGINT, BIGINT),
      public.lab_get_conformity(BIGINT, BIGINT, BIGINT, BIGINT)
    TO %I', p_role);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lab_assert_actor(BIGINT, BIGINT, BIGINT, TEXT),
  public.lab_approve_template(BIGINT, BIGINT, BIGINT, BIGINT),
  public.lab_approve_specification(BIGINT, BIGINT, BIGINT, BIGINT),
  public.lab_start_analysis(BIGINT, BIGINT, BIGINT, BIGINT, BIGINT),
  public.lab_add_sample(BIGINT, TEXT, BIGINT, BIGINT, BIGINT),
  public.lab_record_result(BIGINT, BIGINT, BIGINT, NUMERIC, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT),
  public.lab_invalidate_analysis(BIGINT, TEXT, BIGINT, BIGINT, BIGINT),
  public.lab_evaluate_conformity(BIGINT, BIGINT, BIGINT, BIGINT),
  public.lab_decide_conformity(BIGINT, TEXT, TEXT, BIGINT, BIGINT, BIGINT),
  public.lab_get_conformity(BIGINT, BIGINT, BIGINT, BIGINT), public.lab_grant_runtime(NAME) FROM PUBLIC;

DO $$
DECLARE
  v_role NAME;
BEGIN
  FOR v_role IN
    SELECT DISTINCT recipient.rolname
    FROM pg_proc existing
    CROSS JOIN LATERAL aclexplode(existing.proacl) privilege
    JOIN pg_roles recipient ON recipient.oid = privilege.grantee
    WHERE existing.pronamespace = 'public'::regnamespace AND existing.proname = 'open_batch'
      AND privilege.privilege_type = 'EXECUTE' AND privilege.grantee <> existing.proowner
  LOOP
    PERFORM public.lab_grant_runtime(v_role);
  END LOOP;
END;
$$;
