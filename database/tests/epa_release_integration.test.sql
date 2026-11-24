\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  actor bigint;
  app bigint;
  sector bigint;
  product bigint;
  legacy_batch bigint;
  current_batch bigint;
  reviewer bigint;
  lab_app bigint;
  lab_sector bigint;
  template bigint;
  template_version bigint;
  parameter bigint;
  specification bigint;
  analysis bigint;
  sample bigint;
  result bigint;
  evaluation bigint;
BEGIN
  ASSERT NOT (SELECT enabled FROM public.lab_feature_flags WHERE code = 'release_gate'),
    'O gate não pode vir ativado';
  SELECT id INTO STRICT app FROM public.applications WHERE code = 'PORTUS';
  SELECT id INTO STRICT sector FROM public.sectors WHERE code = 'PRODUCTION';
  INSERT INTO public.users (username, password_hash, display_name, role)
    VALUES ('qa_epa_release', 'unused', 'QA EPA release', 'master') RETURNING id INTO actor;
  INSERT INTO public.products (name, created_by)
    VALUES ('QA EPA release', actor) RETURNING id INTO product;
  INSERT INTO public.batches (product_id, code, created_by, opened_at)
    VALUES (product, 'QA-EPA-LEGACY', actor, '-infinity') RETURNING id INTO legacy_batch;
  INSERT INTO public.batches (product_id, code, created_by, opened_at)
    VALUES (product, 'QA-EPA-CURRENT', actor, clock_timestamp()) RETURNING id INTO current_batch;

  PERFORM public.set_batch_completed(current_batch, actor, app, sector, true);
  PERFORM public.supervisor_finalize_batch(current_batch, actor, app, sector);
  PERFORM public.master_reopen_batch(current_batch, actor, app, sector, 'Reabertura para controle EPA');
  ASSERT (SELECT lab_analysis_cycle FROM public.batches WHERE id = current_batch) = 2;
  ASSERT NOT (SELECT completed FROM public.batches WHERE id = current_batch);

  UPDATE public.lab_feature_flags SET enabled = true WHERE code = 'release_gate';
  PERFORM public.set_batch_completed(legacy_batch, actor, app, sector, true);
  PERFORM public.supervisor_finalize_batch(legacy_batch, actor, app, sector);
  PERFORM public.master_reopen_batch(legacy_batch, actor, app, sector, 'Lote legado reaberto para análise');
  PERFORM public.set_batch_completed(legacy_batch, actor, app, sector, true);
  PERFORM public.set_batch_completed(current_batch, actor, app, sector, true);

  BEGIN
    PERFORM public.supervisor_finalize_batch(current_batch, actor, app, sector);
    RAISE EXCEPTION 'Lote atual sem análise conforme foi finalizado';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    NULL;
  END;
  BEGIN
    UPDATE public.batches SET status = 'closed', closed_at = now() WHERE id = legacy_batch;
    RAISE EXCEPTION 'Lote legado reaberto foi finalizado sem nova análise';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    NULL;
  END;

  ASSERT NOT EXISTS (SELECT FROM public.batches WHERE id IN (legacy_batch, current_batch) AND status <> 'open');
  ASSERT NOT (SELECT has_table_privilege('public', 'public.lab_feature_flags', 'UPDATE'));

  SELECT id INTO STRICT lab_app FROM public.applications WHERE code = 'PORTUS_LABORATORY';
  SELECT id INTO STRICT lab_sector FROM public.sectors WHERE code = 'LABORATORY';
  INSERT INTO public.users (username, password_hash, display_name, role)
    VALUES ('qa_epa_release_reviewer', 'unused', 'QA EPA reviewer', 'master') RETURNING id INTO reviewer;
  INSERT INTO public.lab_templates (code) VALUES ('QA-EPA-RELEASE') RETURNING id INTO template;
  INSERT INTO public.lab_template_versions (template_id, version, source_document)
    VALUES (template, 1, 'QA fixture') RETURNING id INTO template_version;
  INSERT INTO public.lab_parameters (code, name)
    VALUES ('cor_spencer', 'Cor Spencer') ON CONFLICT (code) DO NOTHING;
  SELECT id INTO STRICT parameter FROM public.lab_parameters WHERE code = 'cor_spencer';
  INSERT INTO public.lab_template_parameters
    (template_version_id, parameter_id, original_name, value_type, origin, unit, required,
     source_evidence, formula_code, formula_version)
    VALUES (template_version, parameter, 'Cor Spencer', 'quantitative', 'calculated', '1', true,
            'QA fixture', 'cor_spencer', 1);
  PERFORM public.lab_approve_template(template_version, reviewer, lab_app, lab_sector);
  INSERT INTO public.lab_product_specifications (product_id, template_version_id)
    VALUES (product, template_version) RETURNING id INTO specification;
  INSERT INTO public.lab_spec_limits
    (specification_id, template_version_id, parameter_id, value_type, unit,
     minimum_value, maximum_value, source_evidence)
    VALUES (specification, template_version, parameter, 'quantitative', '1', 120, 130, 'QA fixture');
  PERFORM public.lab_approve_specification(specification, reviewer, lab_app, lab_sector);

  analysis := public.lab_start_analysis(current_batch, specification, actor, lab_app, lab_sector);
  sample := public.lab_add_sample(analysis, 'QA sample', actor, lab_app, lab_sector);
  result := public.lab_record_calculation(analysis, sample, parameter, 'cor_spencer', 1,
    '{"B3":{"value":0.6,"unit":"Abs"}}', actor, lab_app, lab_sector);
  ASSERT (SELECT numeric_value FROM public.lab_results WHERE id = result) = 124.855;
  ASSERT (SELECT inputs #>> '{B3,value}' FROM public.lab_calculation_evidence WHERE result_id = result) = '0.6';
  BEGIN
    UPDATE public.lab_calculation_evidence SET inputs = '{}' WHERE result_id = result;
    RAISE EXCEPTION 'Evidência de cálculo alterada';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  evaluation := public.lab_evaluate_conformity(analysis, actor, lab_app, lab_sector);
  PERFORM public.lab_decide_conformity(evaluation, 'approved', 'QA release', reviewer, lab_app, lab_sector);
  ASSERT (public.supervisor_finalize_batch(current_batch, actor, app, sector)).status = 'closed';
  PERFORM public.master_reopen_batch(current_batch, actor, app, sector, 'Lote reaberto após laudo aprovado');
  PERFORM public.set_batch_completed(current_batch, actor, app, sector, true);
  BEGIN
    PERFORM public.supervisor_finalize_batch(current_batch, actor, app, sector);
    RAISE EXCEPTION 'Laudo antigo foi reutilizado após reabertura';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    NULL;
  END;
  ASSERT (SELECT decision FROM public.lab_approvals WHERE evaluation_id = evaluation) = 'approved';
END;
$$;
SET CONSTRAINTS lab_require_calculation_evidence IMMEDIATE;
ROLLBACK;
