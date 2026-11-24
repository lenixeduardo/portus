BEGIN;

DO $test$
#variable_conflict use_variable
DECLARE
  model_id bigint;
  parameter_id bigint;
  template_version_id bigint;
  specification_id bigint;
  replacement_id bigint;
  expired_id bigint;
  actor_id bigint;
  product_a bigint;
  product_b bigint;
  batch_a bigint;
  batch_b bigint;
  session_b bigint;
  reading_b bigint;
  reading_a bigint;
  session_a bigint;
  result_a bigint;
  instrument_id bigint;
  run_id bigint;
  sample_id bigint;
BEGIN
  IF (SELECT count(*) FROM public.lab_templates) <> 19 THEN
    RAISE EXCEPTION 'expected 19 EPA model seeds';
  END IF;
  IF (SELECT count(*) FROM public.lab_template_parameters) <> 291
    OR (SELECT count(*) FROM public.lab_template_validation_issues) <> 94 THEN
    RAISE EXCEPTION 'expected all 291 draft parameter rows and 94 source issues';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lab_template_versions WHERE status = 'approved')
    OR (SELECT count(*) FROM public.lab_template_versions WHERE status = 'draft') <> 19 THEN
    RAISE EXCEPTION 'expected a draft for each EPA model';
  END IF;

  INSERT INTO public.users (username, password_hash) VALUES ('epa_integrity_actor', 'test-only') RETURNING id INTO actor_id;
  INSERT INTO public.products (name, created_by) VALUES ('EPA test A', actor_id) RETURNING id INTO product_a;
  INSERT INTO public.products (name, created_by) VALUES ('EPA test B', actor_id) RETURNING id INTO product_b;
  INSERT INTO public.batches (product_id, code, created_by) VALUES (product_a, 'EPA-INTEGRITY', actor_id) RETURNING id INTO batch_a;
  INSERT INTO public.batches (product_id, code, created_by) VALUES (product_b, 'EPA-INTEGRITY', actor_id) RETURNING id INTO batch_b;
  INSERT INTO public.equipments (code, name) VALUES ('EPA-QA-INTEGRITY', 'EPA test instrument') RETURNING id INTO instrument_id;
  INSERT INTO public.capture_sessions (batch_id, timeout_seconds) VALUES (batch_b, 10) RETURNING id INTO session_b;
  INSERT INTO public.readings (batch_id, equipment_id, capture_session_id, value_raw, value_parsed)
    VALUES (batch_b, instrument_id, session_b, 'raw', '5') RETURNING id INTO reading_b;
  SELECT id INTO model_id FROM public.lab_templates WHERE code = 'CPO';
  INSERT INTO public.lab_parameters (code, name) VALUES ('epa_fixture', 'EPA fixture') RETURNING id INTO parameter_id;
  INSERT INTO public.lab_template_versions (template_id, version, source_document)
    VALUES (model_id, 99, 'Synthetic fixture') RETURNING id INTO template_version_id;
  INSERT INTO public.lab_template_parameters
    (template_version_id, parameter_id, original_name, value_type, origin, unit, required, equipment_id, source_evidence)
    VALUES (template_version_id, parameter_id, 'EPA fixture', 'quantitative', 'instrumental', 'mg/L', true, instrument_id, 'Synthetic fixture');
  INSERT INTO public.lab_product_specifications (product_id, template_version_id, effective_from)
    VALUES (product_a, template_version_id, now() - interval '2 hours') RETURNING id INTO specification_id;

  BEGIN
    INSERT INTO public.lab_spec_limits
      (specification_id, template_version_id, parameter_id, value_type, unit, minimum_value, maximum_value)
      VALUES (specification_id, template_version_id, parameter_id, 'quantitative', 'mg/L', 9, 1);
    RAISE EXCEPTION 'inverted bounds accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.lab_spec_limits
      (specification_id, template_version_id, parameter_id, value_type, unit, minimum_value, maximum_value)
      VALUES (specification_id, template_version_id, parameter_id, 'quantitative', 'g/mL', 1, 9);
    RAISE EXCEPTION 'incompatible units accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.lab_spec_limits
    (specification_id, template_version_id, parameter_id, value_type, unit, minimum_value, maximum_value)
    VALUES (specification_id, template_version_id, parameter_id, 'quantitative', 'mg/L', 1, 9);
  UPDATE public.lab_template_versions SET status = 'approved', approved_by = actor_id, approved_at = now()
    WHERE id = template_version_id;
  UPDATE public.lab_product_specifications SET status = 'approved', approved_by = actor_id, approved_at = now()
    WHERE id = specification_id;
  BEGIN
    UPDATE public.lab_template_parameters SET required = false
      WHERE lab_template_parameters.template_version_id = template_version_id;
    RAISE EXCEPTION 'approved template composition mutated';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.lab_spec_limits SET minimum_value = 0 WHERE lab_spec_limits.specification_id = specification_id;
    RAISE EXCEPTION 'approved specification mutated';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.lab_analysis_runs (batch_id, product_id, specification_id, template_version_id, created_by)
    VALUES (batch_a, product_a, specification_id, template_version_id, actor_id) RETURNING id INTO run_id;
  INSERT INTO public.lab_samples (analysis_run_id, identification, created_by) VALUES (run_id, 'A', actor_id) RETURNING id INTO sample_id;
  BEGIN
    INSERT INTO public.lab_results
      (analysis_run_id, batch_id, template_version_id, sample_id, parameter_id, value_type, origin, unit, numeric_value, reading_id, created_by)
      VALUES (run_id, batch_a, template_version_id, sample_id, parameter_id, 'quantitative', 'instrumental', 'mg/L', 5, reading_b, actor_id);
    RAISE EXCEPTION 'reading for another batch accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  INSERT INTO public.capture_sessions (batch_id, timeout_seconds) VALUES (batch_a, 10) RETURNING id INTO session_a;
  INSERT INTO public.readings (batch_id, equipment_id, capture_session_id, value_raw, value_parsed)
    VALUES (batch_a, instrument_id, session_a, 'device:5,2', '5,2') RETURNING id INTO reading_a;
  BEGIN
    INSERT INTO public.lab_results
      (analysis_run_id, batch_id, template_version_id, sample_id, parameter_id, value_type, origin, unit, numeric_value, reading_id, created_by)
      VALUES (run_id, batch_a, template_version_id, sample_id, parameter_id, 'quantitative', 'instrumental', 'mg/L', 5, reading_a, actor_id);
    RAISE EXCEPTION 'result differing from the parsed reading accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.lab_results
    (analysis_run_id, batch_id, template_version_id, sample_id, parameter_id, value_type, origin, unit, numeric_value, reading_id, created_by)
    VALUES (run_id, batch_a, template_version_id, sample_id, parameter_id, 'quantitative', 'instrumental', 'mg/L', 5.2, reading_a, actor_id)
    RETURNING id INTO result_a;
  BEGIN
    UPDATE public.lab_results SET numeric_value = 9 WHERE id = result_a;
    RAISE EXCEPTION 'historical result overwritten';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.lab_results SET invalidated_at = now(), invalidated_by = actor_id, invalidation_reason = 'Test correction'
    WHERE id = result_a;
  INSERT INTO public.lab_results
    (analysis_run_id, batch_id, template_version_id, sample_id, parameter_id, value_type, origin, unit, numeric_value, reading_id, created_by, revision)
    VALUES (run_id, batch_a, template_version_id, sample_id, parameter_id, 'quantitative', 'instrumental', 'mg/L', 5.2, reading_a, actor_id, 2);
  IF (SELECT count(*) FROM public.lab_results WHERE lab_results.sample_id = sample_id) <> 2
    OR NOT EXISTS (SELECT 1 FROM public.lab_results WHERE id = result_a AND numeric_value = 5.2
      AND invalidated_at IS NOT NULL AND invalidated_by = actor_id)
    OR NOT EXISTS (SELECT 1 FROM public.readings WHERE id = reading_a
      AND value_raw = 'device:5,2' AND value_parsed = '5,2') THEN
    RAISE EXCEPTION 'result or capture history was lost';
  END IF;

  INSERT INTO public.lab_product_specifications (product_id, template_version_id, effective_from)
    VALUES (product_a, template_version_id, now() - interval '1 hour') RETURNING id INTO replacement_id;
  INSERT INTO public.lab_spec_limits
    (specification_id, template_version_id, parameter_id, value_type, unit, minimum_value, maximum_value)
    VALUES (replacement_id, template_version_id, parameter_id, 'quantitative', 'mg/L', 2, 8);
  UPDATE public.lab_product_specifications SET status = 'approved', approved_by = actor_id, approved_at = now()
    WHERE id = replacement_id;
  BEGIN
    INSERT INTO public.lab_analysis_runs (batch_id, product_id, specification_id, template_version_id, created_by, revision)
      VALUES (batch_a, product_a, specification_id, template_version_id, actor_id, 2);
    RAISE EXCEPTION 'superseded specification used for new analysis';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.lab_analysis_runs (batch_id, product_id, specification_id, template_version_id, created_by, revision)
    VALUES (batch_a, product_a, replacement_id, template_version_id, actor_id, 2);
  IF NOT EXISTS (SELECT 1 FROM public.lab_analysis_runs WHERE id = run_id
    AND lab_analysis_runs.specification_id = specification_id AND revision = 1) THEN
    RAISE EXCEPTION 'revised specification replaced historical analysis';
  END IF;

  INSERT INTO public.lab_product_specifications (product_id, template_version_id, effective_from, effective_until)
    VALUES (product_a, template_version_id, now() - interval '10 minutes', now() - interval '5 minutes')
    RETURNING id INTO expired_id;
  INSERT INTO public.lab_spec_limits
    (specification_id, template_version_id, parameter_id, value_type, unit, minimum_value, maximum_value)
    VALUES (expired_id, template_version_id, parameter_id, 'quantitative', 'mg/L', 3, 7);
  UPDATE public.lab_product_specifications SET status = 'approved', approved_by = actor_id, approved_at = now()
    WHERE id = expired_id;
  BEGIN
    INSERT INTO public.lab_analysis_runs (batch_id, product_id, specification_id, template_version_id, created_by, revision)
      VALUES (batch_a, product_a, replacement_id, template_version_id, actor_id, 3);
    RAISE EXCEPTION 'expiry reactivated a superseded specification';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$test$;

ROLLBACK;
