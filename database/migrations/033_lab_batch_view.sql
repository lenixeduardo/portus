-- A batch-scoped view of laboratory evidence. Keep the application credential
-- on the domain APIs so it never receives direct access to laboratory tables.
CREATE FUNCTION public.lab_get_batch_view(
  p_batch_id BIGINT, p_user_id BIGINT, p_application_id BIGINT, p_sector_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET TimeZone = 'UTC' AS $$
DECLARE
  v_role TEXT;
  v_can_capture BOOLEAN := FALSE;
  v_view JSONB;
BEGIN
  v_role := public.lab_assert_actor(p_user_id, p_application_id, p_sector_id, 'read');
  BEGIN
    PERFORM public.lab_assert_actor(p_user_id, p_application_id, p_sector_id, 'capture');
    v_can_capture := TRUE;
  EXCEPTION WHEN insufficient_privilege THEN
    -- Read-only laboratory accounts can still follow the batch and its history.
    NULL;
  END;

  WITH batch AS (
    SELECT id, product_id, status, lab_analysis_cycle
      FROM public.batches WHERE id = p_batch_id
  ), latest_spec AS (
    -- Match migration 028: an expired latest approval must never reactivate
    -- a superseded specification.
    SELECT candidate.*
    FROM batch
    CROSS JOIN LATERAL (
      SELECT id, template_version_id, effective_until
      FROM public.lab_product_specifications
      WHERE product_id = batch.product_id AND status = 'approved'
        AND effective_from <= statement_timestamp()
      ORDER BY effective_from DESC LIMIT 1
    ) candidate
    WHERE candidate.effective_until IS NULL OR candidate.effective_until > statement_timestamp()
  ), runs AS (
    SELECT run.*
    FROM batch JOIN public.lab_analysis_runs run ON run.batch_id = batch.id
  ), current_run AS (
    SELECT runs.*
    FROM runs JOIN batch ON batch.lab_analysis_cycle = runs.cycle
    ORDER BY runs.revision DESC LIMIT 1
  ), spec AS (
    SELECT product_spec.id, model.code, version.version
    FROM public.lab_product_specifications product_spec
    JOIN public.lab_template_versions version ON version.id = product_spec.template_version_id
    JOIN public.lab_templates model ON model.id = version.template_id
    WHERE product_spec.id IN (SELECT id FROM latest_spec UNION SELECT specification_id FROM current_run)
  ), current_snapshot AS MATERIALIZED (
    SELECT public.lab_build_conformity_snapshot(current_run.id) AS evidence FROM current_run
  ), latest_evaluation AS (
    SELECT evaluation.*, approval.decision, approval.reason, approval.decided_at, approval.decided_by,
           (evaluation.evidence IS DISTINCT FROM current_snapshot.evidence
            OR current_run.invalidated_at IS NOT NULL) AS stale
    FROM current_run
    CROSS JOIN current_snapshot
    JOIN public.lab_conformity_evaluations evaluation ON evaluation.analysis_run_id = current_run.id
    LEFT JOIN public.lab_approvals approval ON approval.evaluation_id = evaluation.id
    ORDER BY evaluation.id DESC LIMIT 1
  ), access AS (
    SELECT
      v_can_capture AND batch.status = 'open' AND EXISTS (SELECT 1 FROM latest_spec) AS can_start,
      v_can_capture AND batch.status = 'open'
        AND current_run.id IS NOT NULL AND current_run.invalidated_at IS NULL AS can_capture,
      v_role IN ('supervisor', 'master') AND batch.status = 'open'
        AND evaluation.id IS NOT NULL AND NOT evaluation.stale AND evaluation.decision IS NULL
        AND current_run.created_by <> p_user_id AND evaluation.assessed_by <> p_user_id
        AND NOT EXISTS (SELECT 1 FROM public.lab_samples
          WHERE analysis_run_id = current_run.id AND created_by = p_user_id)
        AND NOT EXISTS (SELECT 1 FROM public.lab_results
          WHERE analysis_run_id = current_run.id AND created_by = p_user_id) AS can_decide
    FROM batch
    LEFT JOIN current_run ON TRUE
    LEFT JOIN latest_evaluation evaluation ON TRUE
  ), parameters AS (
    SELECT parameter.*, limits.minimum_value, limits.maximum_value, limits.minimum_inclusive,
           limits.maximum_inclusive, limits.qualitative_value,
           CASE WHEN formula.source_validation = 'verified' THEN jsonb_build_object(
             'code', formula.code, 'version', formula.version,
             'inputs', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'cell', input.excel_cell, 'unit', input.unit, 'description', input.quantity_description
               ) ORDER BY input.excel_cell)
               FROM public.lab_formula_inputs input
               WHERE (input.formula_code, input.formula_version) = (formula.code, formula.version)
             ), '[]'::JSONB)
           ) END AS formula
    FROM public.lab_template_parameters parameter
    LEFT JOIN public.lab_spec_limits limits ON limits.parameter_id = parameter.parameter_id
      AND limits.specification_id = COALESCE(
        (SELECT specification_id FROM current_run), (SELECT id FROM latest_spec)
      )
    LEFT JOIN public.lab_formula_versions formula
      ON (formula.code, formula.version) = (parameter.formula_code, parameter.formula_version)
    WHERE parameter.template_version_id = COALESCE(
      (SELECT template_version_id FROM current_run), (SELECT template_version_id FROM latest_spec)
    )
  ), history AS (
    SELECT 'analysis-' || run.id AS event_id, 'analysis' AS kind, run.cycle, run.revision AS analysis_revision,
      run.created_at, run.created_by AS actor_id, 'Análise iniciada' AS label, NULL::TEXT AS detail
      FROM runs run
    UNION ALL
    SELECT 'analysis-invalidated-' || run.id, 'analysis', run.cycle, run.revision,
      run.invalidated_at, run.invalidated_by, 'Análise invalidada', run.invalidation_reason
      FROM runs run WHERE run.invalidated_at IS NOT NULL
    UNION ALL
    SELECT 'result-' || result.id, 'result', run.cycle, run.revision,
      result.created_at, result.created_by, 'Resultado · ' || parameter.original_name,
      concat(sample.identification, ' · ', 'Rev. ', result.revision, ' · ',
        concat_ws(' ', COALESCE(result.numeric_value::TEXT, result.qualitative_value), result.unit))
      FROM runs run
      JOIN public.lab_results result ON result.analysis_run_id = run.id
      JOIN public.lab_samples sample ON sample.id = result.sample_id
      JOIN public.lab_template_parameters parameter
        ON (parameter.template_version_id, parameter.parameter_id) = (result.template_version_id, result.parameter_id)
    UNION ALL
    SELECT 'result-invalidated-' || result.id, 'result', run.cycle, run.revision,
      result.invalidated_at, result.invalidated_by, 'Resultado substituído · ' || parameter.original_name,
      concat(sample.identification, ' · ', 'Rev. ', result.revision, ' · ', result.invalidation_reason)
      FROM runs run
      JOIN public.lab_results result ON result.analysis_run_id = run.id
      JOIN public.lab_samples sample ON sample.id = result.sample_id
      JOIN public.lab_template_parameters parameter
        ON (parameter.template_version_id, parameter.parameter_id) = (result.template_version_id, result.parameter_id)
      WHERE result.invalidated_at IS NOT NULL
    UNION ALL
    SELECT 'evaluation-' || evaluation.id, 'evaluation', run.cycle, run.revision,
      evaluation.assessed_at, evaluation.assessed_by, 'Avaliação registrada',
      CASE evaluation.outcome WHEN 'conforming' THEN 'Conforme'
        WHEN 'nonconforming' THEN 'Não conforme' ELSE 'Incompleta' END
      FROM runs run JOIN public.lab_conformity_evaluations evaluation ON evaluation.analysis_run_id = run.id
    UNION ALL
    SELECT 'decision-' || approval.evaluation_id, 'decision', run.cycle, run.revision,
      approval.decided_at, approval.decided_by,
      CASE approval.decision WHEN 'approved' THEN 'Análise aprovada' ELSE 'Análise rejeitada' END,
      approval.reason
      FROM runs run
      JOIN public.lab_conformity_evaluations evaluation ON evaluation.analysis_run_id = run.id
      JOIN public.lab_approvals approval ON approval.evaluation_id = evaluation.id
  )
  SELECT jsonb_build_object(
    'cycle', batch.lab_analysis_cycle::TEXT,
    'specification', (SELECT jsonb_build_object('id', spec.id::TEXT, 'modelCode', spec.code, 'version', spec.version)
      FROM spec WHERE spec.id = (SELECT id FROM latest_spec)),
    'analysisSpecification', (SELECT jsonb_build_object('id', spec.id::TEXT, 'modelCode', spec.code, 'version', spec.version)
      FROM spec WHERE spec.id = current_run.specification_id),
    'analysis', CASE WHEN current_run.id IS NOT NULL THEN jsonb_build_object(
      'id', current_run.id::TEXT, 'cycle', current_run.cycle::TEXT, 'revision', current_run.revision,
      'createdAt', current_run.created_at,
      'createdBy', COALESCE(author.display_name, '#' || current_run.created_by),
      'invalidatedAt', current_run.invalidated_at, 'invalidationReason', current_run.invalidation_reason
    ) END,
    'outcome', current_snapshot.evidence->>'outcome',
    'permissions', jsonb_build_object(
      'canStart', access.can_start, 'canCapture', access.can_capture, 'canSubmit', access.can_capture,
      'canApprove', access.can_decide AND evaluation.outcome = 'conforming', 'canReject', access.can_decide
    ),
    'parameters', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', parameter_id::TEXT, 'name', original_name, 'valueType', value_type, 'origin', origin,
      'unit', unit, 'required', required, 'equipmentId', equipment_id::TEXT,
      'minimum', minimum_value::TEXT, 'maximum', maximum_value::TEXT,
      'minimumInclusive', minimum_inclusive, 'maximumInclusive', maximum_inclusive,
      'qualitativeValue', qualitative_value, 'formula', formula
    ) ORDER BY original_name, parameter_id) FROM parameters), '[]'::JSONB),
    'samples', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', sample.id::TEXT, 'identification', sample.identification
    ) ORDER BY sample.id) FROM public.lab_samples sample WHERE sample.analysis_run_id = current_run.id), '[]'::JSONB),
    'results', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', item->>'result_id', 'sampleId', item->>'sample_id', 'parameterId', item->>'parameter_id',
      'numericValue', item#>>'{result,numeric_value}', 'qualitativeValue', item#>>'{result,qualitative_value}',
      'unit', item#>>'{result,unit}', 'readingId', item#>>'{result,reading_id}',
      'revision', item#>'{result,revision}', 'outcome', item->>'outcome',
      'invalidatedAt', item#>>'{result,invalidated_at}'
    ) ORDER BY ordinality)
      FROM jsonb_array_elements(current_snapshot.evidence->'items') WITH ORDINALITY AS snapshot(item, ordinality)
    ), '[]'::JSONB),
    'readings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', reading.id::TEXT, 'equipmentId', equipment.id::TEXT, 'equipmentName', equipment.name,
      'value', btrim(reading.value_parsed), 'capturedAt', reading.captured_at
    ) ORDER BY reading.captured_at DESC, reading.id DESC)
      FROM public.readings reading
      JOIN public.capture_sessions capture ON capture.id = reading.capture_session_id AND capture.batch_id = batch.id
      JOIN public.equipments equipment ON equipment.id = reading.equipment_id
      WHERE access.can_capture AND reading.batch_id = batch.id
        AND NULLIF(btrim(reading.value_parsed), '') IS NOT NULL AND reading.parse_failure_reason IS NULL
    ), '[]'::JSONB),
    'evaluation', CASE WHEN evaluation.id IS NOT NULL THEN jsonb_build_object(
      'id', evaluation.id::TEXT, 'outcome', evaluation.outcome, 'decision', evaluation.decision,
      'stale', evaluation.stale, 'assessedBy', COALESCE(assessor.display_name, '#' || evaluation.assessed_by),
      'assessedAt', evaluation.assessed_at, 'decidedBy', COALESCE(reviewer.display_name, '#' || evaluation.decided_by),
      'decidedAt', evaluation.decided_at, 'reason', evaluation.reason
    ) END,
    'history', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', history.event_id, 'kind', history.kind, 'cycle', history.cycle::TEXT,
      'analysisRevision', history.analysis_revision, 'createdAt', history.created_at,
      'actor', COALESCE(actor.display_name, '#' || history.actor_id), 'label', history.label, 'detail', history.detail
    ) ORDER BY history.created_at DESC, history.event_id)
      FROM history LEFT JOIN public.users actor ON actor.id = history.actor_id), '[]'::JSONB)
  ) INTO v_view
  FROM batch
  JOIN access ON TRUE
  LEFT JOIN current_run ON TRUE
  LEFT JOIN current_snapshot ON TRUE
  LEFT JOIN latest_evaluation evaluation ON TRUE
  LEFT JOIN public.users author ON author.id = current_run.created_by
  LEFT JOIN public.users assessor ON assessor.id = evaluation.assessed_by
  LEFT JOIN public.users reviewer ON reviewer.id = evaluation.decided_by;

  IF v_view IS NULL THEN
    RAISE EXCEPTION 'Lote não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_view;
END;
$$;

REVOKE ALL ON FUNCTION public.lab_get_batch_view(BIGINT, BIGINT, BIGINT, BIGINT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.lab_grant_runtime(p_role NAME)
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
      public.lab_get_conformity(BIGINT, BIGINT, BIGINT, BIGINT),
      public.lab_get_batch_view(BIGINT, BIGINT, BIGINT, BIGINT)
    TO %I', p_role);
END;
$$;

DO $$
DECLARE
  v_role NAME;
BEGIN
  FOR v_role IN
    SELECT DISTINCT recipient.rolname
    FROM pg_proc existing
    CROSS JOIN LATERAL aclexplode(existing.proacl) privilege
    JOIN pg_roles recipient ON recipient.oid = privilege.grantee
    WHERE existing.pronamespace = 'public'::regnamespace AND existing.proname = 'lab_get_conformity'
      AND privilege.privilege_type = 'EXECUTE' AND privilege.grantee <> existing.proowner
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.lab_get_batch_view(BIGINT, BIGINT, BIGINT, BIGINT) TO %I', v_role);
  END LOOP;
END;
$$;
