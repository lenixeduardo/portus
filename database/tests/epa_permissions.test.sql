\set ON_ERROR_STOP on
BEGIN;

CREATE ROLE portus_epa_runtime_qa NOLOGIN NOSUPERUSER;
CREATE ROLE portus_epa_ungranted_qa NOLOGIN NOSUPERUSER;
GRANT USAGE ON SCHEMA public TO portus_epa_runtime_qa, portus_epa_ungranted_qa;
-- Reproduce the legacy installer grants, then apply the laboratory whitelist.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO portus_epa_runtime_qa;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO portus_epa_runtime_qa;
SELECT public.lab_grant_runtime('portus_epa_runtime_qa');

DO $$
DECLARE
  v_lab BIGINT;
  v_production BIGINT;
  v_app BIGINT;
  v_reviewer BIGINT;
  v_actor BIGINT;
  v_inactive BIGINT;
  v_other_sector BIGINT;
  v_product BIGINT;
  v_batch BIGINT;
  v_template BIGINT;
  v_version BIGINT;
  v_parameter BIGINT;
  v_spec BIGINT;
  v_run BIGINT;
  v_sample BIGINT;
  v_evaluation BIGINT;
BEGIN
  ASSERT has_table_privilege('portus_epa_runtime_qa', 'public.batches', 'SELECT');
  ASSERT NOT has_table_privilege('portus_epa_runtime_qa', 'public.lab_approvals', 'SELECT');
  ASSERT NOT has_function_privilege('portus_epa_runtime_qa', 'public.lab_touch_batch(bigint)', 'EXECUTE');
  ASSERT NOT has_function_privilege('portus_epa_runtime_qa', 'public.lab_grant_runtime(name)', 'EXECUTE');
  ASSERT NOT has_function_privilege('portus_epa_ungranted_qa',
      'public.lab_evaluate_conformity(bigint,bigint,bigint,bigint)', 'EXECUTE');
  ASSERT NOT has_function_privilege('portus_epa_ungranted_qa',
      'public.lab_decide_conformity(bigint,text,text,bigint,bigint,bigint)', 'EXECUTE');

  SELECT id INTO STRICT v_lab FROM public.sectors WHERE code = 'LABORATORY';
  SELECT id INTO STRICT v_production FROM public.sectors WHERE code = 'PRODUCTION';
  SELECT id INTO STRICT v_app FROM public.applications WHERE code = 'PORTUS_LABORATORY';
  INSERT INTO public.users (username, password_hash, role, sector_code)
    VALUES ('qa_epa_perm_capture', 'unused', 'operator', 'LABORATORY') RETURNING id INTO v_actor;
  INSERT INTO public.users (username, password_hash, role, sector_code)
    VALUES ('qa_epa_perm_review', 'unused', 'supervisor', 'PRODUCTION') RETURNING id INTO v_reviewer;
  INSERT INTO public.users (username, password_hash, role, sector_code, active)
    VALUES ('qa_epa_perm_inactive', 'unused', 'laboratory', 'LABORATORY', FALSE) RETURNING id INTO v_inactive;
  INSERT INTO public.users (username, password_hash, role, sector_code)
    VALUES ('qa_epa_perm_prod', 'unused', 'operator', 'PRODUCTION') RETURNING id INTO v_other_sector;
  INSERT INTO public.user_sector_permissions (user_id, sector_id, can_read, can_capture)
    VALUES (v_actor, v_lab, TRUE, TRUE), (v_reviewer, v_lab, TRUE, TRUE), (v_inactive, v_lab, TRUE, TRUE),
           (v_other_sector, v_lab, TRUE, TRUE);
  INSERT INTO public.products (name, created_by) VALUES ('QA EPA Permissions', v_actor) RETURNING id INTO v_product;
  INSERT INTO public.batches (product_id, code, created_by)
    VALUES (v_product, 'QA-EPA-PERMISSIONS', v_actor) RETURNING id INTO v_batch;
  INSERT INTO public.lab_templates (code) VALUES ('QA-PERMISSIONS') RETURNING id INTO v_template;
  INSERT INTO public.lab_template_versions (template_id, version, source_document)
    VALUES (v_template, 1, 'QA synthetic') RETURNING id INTO v_version;
  INSERT INTO public.lab_parameters (code, name)
    VALUES ('qa_epa_permissions_ph', 'pH') RETURNING id INTO v_parameter;
  INSERT INTO public.lab_template_parameters
    (template_version_id, parameter_id, original_name, value_type, origin, unit, required, source_evidence)
    VALUES (v_version, v_parameter, 'pH', 'quantitative', 'manual', 'pH', TRUE, 'QA');
  INSERT INTO public.lab_product_specifications (product_id, template_version_id)
    VALUES (v_product, v_version) RETURNING id INTO v_spec;
  INSERT INTO public.lab_spec_limits
    (specification_id, template_version_id, parameter_id, value_type, unit, minimum_value, source_evidence)
    VALUES (v_spec, v_version, v_parameter, 'quantitative', 'pH', 3, 'QA');

  SET LOCAL ROLE portus_epa_runtime_qa;
  BEGIN
    PERFORM public.lab_approve_template(v_version, v_actor, v_app, v_lab);
    RAISE EXCEPTION 'Operador conseguiu aprovar modelo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM public.lab_approve_template(v_version, v_reviewer, v_app, v_lab);
  PERFORM public.lab_approve_specification(v_spec, v_reviewer, v_app, v_lab);
  BEGIN
    PERFORM public.lab_start_analysis(v_batch, v_spec, v_other_sector, v_app, v_lab);
    RAISE EXCEPTION 'Operador de Produção conseguiu iniciar análise';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.lab_start_analysis(v_batch, v_spec, v_actor, v_app, v_production);
    RAISE EXCEPTION 'Análise iniciada sob contexto de Produção';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.lab_start_analysis(v_batch, v_spec, v_inactive, v_app, v_lab);
    RAISE EXCEPTION 'Usuário inativo conseguiu iniciar análise';
  EXCEPTION WHEN SQLSTATE '28000' THEN NULL;
  END;

  v_run := public.lab_start_analysis(v_batch, v_spec, v_actor, v_app, v_lab);
  v_sample := public.lab_add_sample(v_run, 'QA', v_actor, v_app, v_lab);
  PERFORM public.lab_record_result(v_run, v_sample, v_parameter, 3, NULL, 'pH', NULL, v_actor, v_app, v_lab);
  v_evaluation := public.lab_evaluate_conformity(v_run, v_reviewer, v_app, v_lab);
  BEGIN
    PERFORM public.lab_decide_conformity(v_evaluation, 'approved', 'QA', v_actor, v_app, v_lab);
    RAISE EXCEPTION 'Operador sem autorização conseguiu aprovar';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.lab_decide_conformity(v_evaluation, 'approved', 'QA', v_reviewer, v_app, v_lab);
    RAISE EXCEPTION 'Supervisor conseguiu aprovar a própria avaliação';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.lab_conformity_evaluations SET outcome = 'conforming' WHERE id = v_evaluation;
    RAISE EXCEPTION 'Credencial operacional conseguiu alterar evidência';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.lab_approvals (evaluation_id, decision, decided_by, actor_role, reason)
      VALUES (v_evaluation, 'approved', v_reviewer, 'supervisor', 'QA');
    RAISE EXCEPTION 'Credencial operacional conseguiu contornar o fluxo de aprovação';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.lab_get_conformity(v_run, v_other_sector, v_app, v_lab);
    RAISE EXCEPTION 'Operador da Produção conseguiu ler evidência laboratorial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ASSERT jsonb_array_length(public.lab_get_conformity(v_run, v_actor, v_app, v_lab)) = 1;

  RESET ROLE;
  BEGIN
    UPDATE public.lab_conformity_evaluations SET outcome = 'conforming' WHERE id = v_evaluation;
    RAISE EXCEPTION 'Alteração da evidência persistida foi permitida ao proprietário';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  RAISE NOTICE 'Permissões EPA: credencial PostgreSQL, setor, usuário inativo, revisão e evidência validados.';
END;
$$;

ROLLBACK;
