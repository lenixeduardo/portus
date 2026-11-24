\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_actor BIGINT;
  v_reviewer BIGINT;
  v_application BIGINT;
  v_sector BIGINT;
  v_product BIGINT;
  v_batch BIGINT;
  v_template BIGINT;
  v_version BIGINT;
  v_specification BIGINT;
  v_numeric BIGINT;
  v_qualitative BIGINT;
  v_optional BIGINT;
  v_analysis BIGINT;
  v_sample BIGINT;
  v_review BIGINT;
  v_prior_review BIGINT;
  v_numeric_result BIGINT;
BEGIN
  ASSERT to_regprocedure('public.lab_evaluate_conformity(bigint,bigint,bigint,bigint)') IS NOT NULL,
    'Função de conformidade laboratorial ausente';
  PERFORM set_config('TimeZone', 'UTC', TRUE);
  SELECT id INTO STRICT v_application FROM public.applications WHERE code = 'PORTUS_LABORATORY';
  SELECT id INTO STRICT v_sector FROM public.sectors WHERE code = 'LABORATORY';

  INSERT INTO public.users (username, password_hash, role, sector_code)
    VALUES ('qa_epa_capture', 'unused', 'laboratory', 'LABORATORY') RETURNING id INTO v_actor;
  INSERT INTO public.users (username, password_hash, role, sector_code)
    VALUES ('qa_epa_review', 'unused', 'master', 'ADMIN') RETURNING id INTO v_reviewer;
  INSERT INTO public.user_sector_permissions (user_id, sector_id, can_read, can_capture)
    VALUES (v_actor, v_sector, TRUE, TRUE);
  INSERT INTO public.products (name, created_by)
    VALUES ('QA EPA Conformidade', v_actor) RETURNING id INTO v_product;
  INSERT INTO public.batches (product_id, code, created_by)
    VALUES (v_product, 'QA-EPA-CONFORMITY', v_actor) RETURNING id INTO v_batch;
  INSERT INTO public.lab_templates (code) VALUES ('QA-CONFORMITY') RETURNING id INTO v_template;
  INSERT INTO public.lab_template_versions (template_id, version, source_document)
    VALUES (v_template, 1, 'QA synthetic') RETURNING id INTO v_version;
  INSERT INTO public.lab_parameters (code, name)
    VALUES ('qa_epa_ph', 'pH') RETURNING id INTO v_numeric;
  INSERT INTO public.lab_parameters (code, name)
    VALUES ('qa_epa_appearance', 'Aparência') RETURNING id INTO v_qualitative;
  INSERT INTO public.lab_parameters (code, name)
    VALUES ('qa_epa_optional', 'Observação opcional') RETURNING id INTO v_optional;
  INSERT INTO public.lab_template_parameters
    (template_version_id, parameter_id, original_name, value_type, origin, unit, required, source_evidence)
    VALUES (v_version, v_numeric, 'pH', 'quantitative', 'manual', 'pH', TRUE, 'QA'),
           (v_version, v_qualitative, 'Aparência', 'qualitative', 'manual', NULL, TRUE, 'QA'),
           (v_version, v_optional, 'Observação opcional', 'qualitative', 'manual', NULL, FALSE, 'QA');
  PERFORM public.lab_approve_template(v_version, v_reviewer, v_application, v_sector);
  INSERT INTO public.lab_product_specifications (product_id, template_version_id)
    VALUES (v_product, v_version) RETURNING id INTO v_specification;
  INSERT INTO public.lab_spec_limits
    (specification_id, template_version_id, parameter_id, value_type, unit, minimum_value,
     maximum_value, maximum_inclusive, source_evidence)
    VALUES (v_specification, v_version, v_numeric, 'quantitative', 'pH', 3, 4, FALSE, 'QA');
  BEGIN
    PERFORM public.lab_approve_specification(v_specification, v_reviewer, v_application, v_sector);
    RAISE EXCEPTION 'Especificação aprovada sem critério obrigatório';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.lab_spec_limits
    (specification_id, template_version_id, parameter_id, value_type, qualitative_value, source_evidence)
    VALUES (v_specification, v_version, v_qualitative, 'qualitative', 'aprovada', 'QA');
  PERFORM public.lab_approve_specification(v_specification, v_reviewer, v_application, v_sector);

  v_analysis := public.lab_start_analysis(v_batch, v_specification, v_actor, v_application, v_sector);
  v_review := public.lab_evaluate_conformity(v_analysis, v_actor, v_application, v_sector);
  ASSERT (SELECT outcome FROM public.lab_conformity_evaluations WHERE id = v_review) = 'incomplete',
    'Análise sem amostras deve ficar incompleta';
  v_sample := public.lab_add_sample(v_analysis, 'QA-1', v_actor, v_application, v_sector);
  PERFORM public.lab_record_result(v_analysis, v_sample, v_numeric, 4, NULL, 'pH', NULL,
                                   v_actor, v_application, v_sector);
  v_review := public.lab_evaluate_conformity(v_analysis, v_actor, v_application, v_sector);
  ASSERT (SELECT outcome FROM public.lab_conformity_evaluations WHERE id = v_review) = 'incomplete',
    'Sem resultado qualitativo obrigatório a análise deve permanecer incompleta';
  ASSERT (SELECT outcome FROM public.lab_conformity_items
          WHERE evaluation_id = v_review AND parameter_id = v_numeric) = 'nonconforming',
    'O valor no limite superior exclusivo deve ser rejeitado';
  BEGIN
    PERFORM public.lab_decide_conformity(v_review, 'approved', 'QA', v_reviewer, v_application, v_sector);
    RAISE EXCEPTION 'Evidência incompleta foi aprovada';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  PERFORM public.lab_record_result(v_analysis, v_sample, v_qualitative, NULL, 'reprovada', NULL, NULL,
                                   v_actor, v_application, v_sector);
  v_numeric_result := public.lab_record_result(v_analysis, v_sample, v_numeric, 3, NULL, 'pH', NULL,
                                               v_actor, v_application, v_sector, 'Correção QA');
  v_prior_review := public.lab_evaluate_conformity(v_analysis, v_actor, v_application, v_sector);
  ASSERT (SELECT outcome FROM public.lab_conformity_evaluations WHERE id = v_prior_review) = 'nonconforming';
  ASSERT (SELECT outcome FROM public.lab_conformity_items
          WHERE evaluation_id = v_prior_review AND parameter_id = v_numeric) = 'conforming',
    'O valor no limite inferior inclusivo é conforme';
  ASSERT (SELECT outcome FROM public.lab_conformity_items
          WHERE evaluation_id = v_prior_review AND parameter_id = v_qualitative) = 'nonconforming';
  PERFORM public.lab_decide_conformity(v_prior_review, 'rejected', 'Aparência incompatível',
                                      v_reviewer, v_application, v_sector);
  ASSERT NOT public.lab_batch_has_approved_conformity(v_batch, 1);

  PERFORM public.lab_record_result(v_analysis, v_sample, v_qualitative, NULL, 'aprovada', NULL, NULL,
                                   v_actor, v_application, v_sector, 'Nova medição QA');
  v_review := public.lab_evaluate_conformity(v_analysis, v_actor, v_application, v_sector);
  ASSERT (SELECT outcome FROM public.lab_conformity_evaluations WHERE id = v_review) = 'conforming';
  ASSERT (SELECT evidence->'result'->>'numeric_value' FROM public.lab_conformity_items
           WHERE evaluation_id = v_review AND result_id = v_numeric_result) = '3';
  ASSERT v_review = public.lab_evaluate_conformity(v_analysis, v_actor, v_application, v_sector),
    'Repetir a avaliação da mesma evidência deve preservar a avaliação e decisão originais';
  PERFORM set_config('TimeZone', 'America/Sao_Paulo', TRUE);
  PERFORM public.lab_decide_conformity(v_review, 'approved', 'QA', v_reviewer, v_application, v_sector);
  ASSERT public.lab_batch_has_approved_conformity(v_batch, 1), 'A aprovação deve valer em outro fuso horário';
  ASSERT (SELECT decision FROM public.lab_approvals WHERE evaluation_id = v_prior_review) = 'rejected',
    'A reavaliação não pode apagar a rejeição anterior';
  ASSERT (SELECT count(*) FROM public.portus_audit_log
    WHERE action = 'lab.conformity.decided' AND resource_id IN (v_review::TEXT, v_prior_review::TEXT)) = 2;

  PERFORM public.lab_record_result(v_analysis, v_sample, v_optional, NULL, 'observação', NULL, NULL,
                                  v_actor, v_application, v_sector);
  UPDATE public.lab_results SET invalidated_at = clock_timestamp(), invalidated_by = v_actor,
    invalidation_reason = 'Invalidação QA' WHERE sample_id = v_sample AND parameter_id = v_optional;
  ASSERT NOT public.lab_batch_has_approved_conformity(v_batch, 1),
    'Remover uma medição opcional não deve restaurar uma aprovação anterior';

  PERFORM public.lab_add_sample(v_analysis, 'QA-2', v_actor, v_application, v_sector);
  ASSERT NOT public.lab_batch_has_approved_conformity(v_batch, 1),
    'Uma amostra nova invalida a aprovação anterior sem apagar sua evidência';
  ASSERT (SELECT count(*) FROM public.lab_conformity_items WHERE evaluation_id = v_review) = 3;
  v_analysis := public.lab_start_analysis(v_batch, v_specification, v_actor, v_application, v_sector);
  ASSERT (SELECT revision FROM public.lab_analysis_runs WHERE id = v_analysis) = 2;
  ASSERT NOT public.lab_batch_has_approved_conformity(v_batch, 1);
  RAISE NOTICE 'Conformidade EPA: limites, qualitativos, ausência, decisão e reanálise validados.';
END;
$$;

ROLLBACK;
