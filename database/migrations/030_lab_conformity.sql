CREATE TABLE public.lab_conformity_evaluations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  analysis_run_id BIGINT NOT NULL REFERENCES public.lab_analysis_runs(id),
  assessed_by BIGINT NOT NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  outcome TEXT NOT NULL CHECK (outcome IN ('incomplete', 'conforming', 'nonconforming')),
  evidence JSONB NOT NULL,
  evidence_sha256 BYTEA NOT NULL CHECK (octet_length(evidence_sha256) = 32)
);

CREATE INDEX lab_conformity_latest_idx
  ON public.lab_conformity_evaluations (analysis_run_id, id DESC);

CREATE TABLE public.lab_conformity_items (
  evaluation_id BIGINT NOT NULL REFERENCES public.lab_conformity_evaluations(id),
  sample_id BIGINT NOT NULL REFERENCES public.lab_samples(id),
  parameter_id BIGINT NOT NULL REFERENCES public.lab_parameters(id),
  result_id BIGINT REFERENCES public.lab_results(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('incomplete', 'conforming', 'nonconforming', 'not_applicable')),
  evidence JSONB NOT NULL,
  PRIMARY KEY (evaluation_id, sample_id, parameter_id)
);

CREATE TABLE public.lab_approvals (
  evaluation_id BIGINT PRIMARY KEY REFERENCES public.lab_conformity_evaluations(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_by BIGINT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('supervisor', 'master')),
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);

COMMENT ON COLUMN public.lab_approvals.decided_by IS
  'Identidade histórica, preservada após a exclusão física do usuário.';
COMMENT ON COLUMN public.lab_conformity_evaluations.assessed_by IS
  'Identidade histórica, preservada após a exclusão física do usuário.';

CREATE FUNCTION public.lab_deny_evidence_change()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Evidência laboratorial é imutável' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER lab_conformity_evaluation_immutable
  BEFORE UPDATE OR DELETE ON public.lab_conformity_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.lab_deny_evidence_change();
CREATE TRIGGER lab_conformity_item_immutable
  BEFORE UPDATE OR DELETE ON public.lab_conformity_items
  FOR EACH ROW EXECUTE FUNCTION public.lab_deny_evidence_change();
CREATE TRIGGER lab_approval_immutable
  BEFORE UPDATE OR DELETE ON public.lab_approvals
  FOR EACH ROW EXECUTE FUNCTION public.lab_deny_evidence_change();

-- Every sample has its own set of required parameters. Preserve the exact
-- value, unit, limit, provenance and calculation used for each decision.
CREATE FUNCTION public.lab_build_conformity_snapshot(p_run_id BIGINT)
RETURNS JSONB LANGUAGE sql STABLE
SET search_path = pg_catalog, public, pg_temp
SET TimeZone = 'UTC' AS $$
  WITH target AS (
    SELECT r.id, r.cycle, r.revision, r.batch_id, r.specification_id, r.template_version_id,
           s.status, to_jsonb(s) AS specification
      FROM public.lab_analysis_runs r
      JOIN public.lab_product_specifications s ON s.id = r.specification_id
     WHERE r.id = p_run_id
  ), items AS (
    SELECT sample.id AS sample_id, parameter.parameter_id, result.id AS result_id,
           to_jsonb(sample) AS sample, to_jsonb(parameter) AS parameter,
           to_jsonb(result) AS result, to_jsonb(criteria) AS criteria,
           to_jsonb(calculation) AS calculation, to_jsonb(reading) AS reading,
           CASE
             WHEN parameter.required IS NULL THEN 'incomplete'
             WHEN parameter.required = FALSE AND (result.id IS NULL OR result.invalidated_at IS NOT NULL)
               THEN 'not_applicable'
             WHEN criteria.parameter_id IS NULL OR result.id IS NULL OR result.invalidated_at IS NOT NULL
               THEN 'incomplete'
             WHEN result.unit IS DISTINCT FROM criteria.unit
               OR result.value_type IS DISTINCT FROM criteria.value_type
               OR result.origin IS DISTINCT FROM parameter.origin
               OR (result.origin = 'calculated' AND calculation.result_id IS NULL)
               OR (result.origin = 'instrumental' AND reading.id IS NULL)
               THEN 'incomplete'
             WHEN criteria.value_type = 'qualitative' THEN
               CASE WHEN result.qualitative_value = criteria.qualitative_value
                    THEN 'conforming' ELSE 'nonconforming' END
             WHEN (criteria.minimum_value IS NOT NULL AND
                   (result.numeric_value < criteria.minimum_value OR
                    (result.numeric_value = criteria.minimum_value AND NOT criteria.minimum_inclusive)))
               OR (criteria.maximum_value IS NOT NULL AND
                   (result.numeric_value > criteria.maximum_value OR
                    (result.numeric_value = criteria.maximum_value AND NOT criteria.maximum_inclusive)))
               THEN 'nonconforming'
             ELSE 'conforming'
           END AS outcome
      FROM target
      JOIN public.lab_samples sample ON sample.analysis_run_id = target.id
      JOIN public.lab_template_parameters parameter ON parameter.template_version_id = target.template_version_id
      LEFT JOIN public.lab_spec_limits criteria ON criteria.specification_id = target.specification_id
                                              AND criteria.parameter_id = parameter.parameter_id
      LEFT JOIN LATERAL (
        SELECT r.* FROM public.lab_results r
         WHERE r.analysis_run_id = target.id AND r.sample_id = sample.id
           AND r.parameter_id = parameter.parameter_id
         ORDER BY r.revision DESC LIMIT 1
      ) result ON TRUE
      LEFT JOIN public.lab_calculation_evidence calculation ON calculation.result_id = result.id
      LEFT JOIN public.readings reading ON reading.id = result.reading_id AND reading.batch_id = target.batch_id
  )
  SELECT jsonb_build_object(
    'analysis_run_id', target.id, 'batch_id', target.batch_id, 'cycle', target.cycle,
    'revision', target.revision, 'specification', target.specification,
    'outcome', CASE WHEN target.status <> 'approved' OR NOT EXISTS (SELECT 1 FROM items)
                         OR EXISTS (SELECT 1 FROM items WHERE outcome = 'incomplete') THEN 'incomplete'
                    WHEN EXISTS (SELECT 1 FROM items WHERE outcome = 'nonconforming') THEN 'nonconforming'
                    WHEN NOT EXISTS (SELECT 1 FROM items WHERE outcome = 'conforming') THEN 'incomplete'
                    ELSE 'conforming' END,
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(items) ORDER BY sample_id, parameter_id) FROM items), '[]'::jsonb)
  )
  FROM target;
$$;

CREATE FUNCTION public.lab_lock_current_analysis(p_run_id BIGINT)
RETURNS public.lab_analysis_runs LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_run public.lab_analysis_runs%ROWTYPE;
  v_batch public.batches%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_run FROM public.lab_analysis_runs WHERE id = p_run_id;
  v_batch := public.lab_touch_batch(v_run.batch_id);
  SELECT * INTO STRICT v_run FROM public.lab_analysis_runs WHERE id = p_run_id;
  IF v_batch.status <> 'open' OR v_batch.lab_analysis_cycle <> v_run.cycle
    OR v_run.invalidated_at IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.lab_analysis_runs newer WHERE newer.batch_id = v_run.batch_id
        AND newer.cycle = v_run.cycle AND newer.revision > v_run.revision
    ) THEN
    RAISE EXCEPTION 'A análise não é a revisão vigente de um lote aberto' USING ERRCODE = '55000';
  END IF;
  RETURN v_run;
END;
$$;

-- Caller must already hold the batch lock. The most recent revision,
-- evaluation and review determine eligibility; a stale approval never returns.
CREATE FUNCTION public.lab_batch_has_approved_conformity(p_batch_id BIGINT, p_cycle BIGINT)
RETURNS BOOLEAN LANGUAGE sql VOLATILE
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT id, invalidated_at FROM public.lab_analysis_runs
       WHERE batch_id = p_batch_id AND cycle = p_cycle ORDER BY revision DESC LIMIT 1
    ) run
    JOIN LATERAL (
      SELECT id, outcome, evidence FROM public.lab_conformity_evaluations
       WHERE analysis_run_id = run.id ORDER BY id DESC LIMIT 1
    ) evaluation ON TRUE
    JOIN public.lab_approvals approval ON approval.evaluation_id = evaluation.id
    WHERE run.invalidated_at IS NULL AND evaluation.outcome = 'conforming'
      AND approval.decision = 'approved'
      AND evaluation.evidence = public.lab_build_conformity_snapshot(run.id)
  );
$$;

REVOKE ALL ON TABLE public.lab_conformity_evaluations, public.lab_conformity_items,
  public.lab_approvals FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lab_deny_evidence_change(),
  public.lab_build_conformity_snapshot(BIGINT), public.lab_lock_current_analysis(BIGINT),
  public.lab_batch_has_approved_conformity(BIGINT, BIGINT) FROM PUBLIC;
