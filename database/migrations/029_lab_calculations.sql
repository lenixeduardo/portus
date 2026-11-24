CREATE TABLE public.lab_formula_versions (
  code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  excel_cell text NOT NULL,
  excel_expression text NOT NULL,
  source_validation text NOT NULL CHECK (source_validation IN ('verified', 'blocked')),
  validation_note text,
  PRIMARY KEY (code, version),
  CHECK (source_validation <> 'blocked' OR nullif(btrim(validation_note), '') IS NOT NULL)
);

CREATE TABLE public.lab_formula_inputs (
  formula_code text NOT NULL,
  formula_version integer NOT NULL,
  excel_cell text NOT NULL,
  unit text NOT NULL,
  quantity_description text NOT NULL,
  positive boolean NOT NULL,
  PRIMARY KEY (formula_code, formula_version, excel_cell),
  FOREIGN KEY (formula_code, formula_version) REFERENCES public.lab_formula_versions (code, version)
);

INSERT INTO public.lab_formula_versions VALUES
  ('cor_spencer', 1, 'B8', '=74.913/B3', 'verified', NULL),
  ('poder_tintorial', 1, 'B9', '=B5', 'verified', NULL),
  ('poder_corante', 1, 'B10', '=B7*2000*25', 'verified', NULL),
  ('indice_hue', 1, 'B11', '=(LOG10(B6/B4))*10', 'verified', NULL),
  ('concentracao_be', 1, 'B14', '=(((145/B15))-145)*-1+0.8-0.74', 'blocked',
    'B15 a 25 °C está rotulada g/ml (ou g/L). g/mL é apenas a hipótese do cálculo de referência.');

INSERT INTO public.lab_formula_inputs VALUES
  ('cor_spencer', 1, 'B3', 'Abs', 'Absorbância 0,4%, 610 nm, cubeta 1 cm', true),
  ('poder_tintorial', 1, 'B5', 'Abs', 'Absorbância 0,1%, 560 nm, cubeta 1 cm', false),
  ('poder_corante', 1, 'B7', 'Abs', 'Absorbância 0,05%, 430 nm, cubeta 1 cm', false),
  ('indice_hue', 1, 'B4', 'Abs', 'Absorbância 0,1%, 610 nm, cubeta 1 cm', true),
  ('indice_hue', 1, 'B6', 'Abs', 'Absorbância 0,1%, 510 nm, cubeta 1 cm', true),
  ('concentracao_be', 1, 'B15', 'g/mL', 'Hipótese documentada: densidade a 25 °C', true);

ALTER TABLE public.lab_template_parameters
  ADD COLUMN formula_code text,
  ADD COLUMN formula_version integer,
  ADD FOREIGN KEY (formula_code, formula_version)
    REFERENCES public.lab_formula_versions (code, version) MATCH FULL,
  ADD CHECK (formula_code IS NULL OR (origin = 'calculated' AND value_type = 'quantitative'));

CREATE FUNCTION public.lab_validate_template_formulas() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.status = 'approved' AND EXISTS (
    SELECT FROM public.lab_template_parameters tp
    JOIN public.lab_parameters p ON p.id = tp.parameter_id
    LEFT JOIN public.lab_formula_versions f ON (f.code, f.version) = (tp.formula_code, tp.formula_version)
    WHERE tp.template_version_id = NEW.id AND tp.origin = 'calculated'
      AND (p.code IS DISTINCT FROM f.code OR f.source_validation IS DISTINCT FROM 'verified')
  ) THEN
    RAISE EXCEPTION 'Parâmetro calculado exige fórmula compatível com unidade validada' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lab_validate_template_formulas
BEFORE UPDATE OF status ON public.lab_template_versions
FOR EACH ROW EXECUTE FUNCTION public.lab_validate_template_formulas();

CREATE FUNCTION public.lab_calculate(
  p_code text, p_version integer, p_inputs jsonb, p_scale integer DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  input_def record;
  input_item jsonb;
  input_value numeric;
  inputs_count integer := 0;
  numbers jsonb := '{}'::jsonb;
  answer numeric;
BEGIN
  IF p_version IS DISTINCT FROM 1 OR jsonb_typeof(p_inputs) IS DISTINCT FROM 'object'
     OR p_scale NOT BETWEEN 0 AND 15 THEN
    RAISE EXCEPTION 'Versão, entradas ou precisão inválidas para o cálculo' USING ERRCODE = '22023';
  END IF;

  FOR input_def IN SELECT excel_cell, unit, positive FROM public.lab_formula_inputs
    WHERE formula_code = p_code AND formula_version = p_version
  LOOP
    input_item := p_inputs -> input_def.excel_cell;
    IF jsonb_typeof(input_item -> 'value') IS DISTINCT FROM 'number'
       OR input_item ->> 'unit' IS DISTINCT FROM input_def.unit THEN
      RAISE EXCEPTION 'Entrada % exige valor numérico e unidade %', input_def.excel_cell, input_def.unit
        USING ERRCODE = '22023';
    END IF;
    input_value := (input_item ->> 'value')::numeric;
    IF input_def.positive AND input_value <= 0 THEN
      RAISE EXCEPTION 'Entrada % deve ser positiva', input_def.excel_cell USING ERRCODE = '22023';
    END IF;
    numbers := jsonb_set(numbers, ARRAY[input_def.excel_cell], to_jsonb(input_value));
    inputs_count := inputs_count + 1;
  END LOOP;

  IF inputs_count = 0 OR inputs_count <> (SELECT count(*) FROM jsonb_object_keys(p_inputs)) THEN
    RAISE EXCEPTION 'Fórmula desconhecida ou conjunto de entradas inválido' USING ERRCODE = '22023';
  END IF;

  CASE p_code
    WHEN 'cor_spencer' THEN
      answer := 74.913000000000000000000000 / (numbers ->> 'B3')::numeric;
    WHEN 'poder_tintorial' THEN
      answer := (numbers ->> 'B5')::numeric;
    WHEN 'poder_corante' THEN
      answer := (numbers ->> 'B7')::numeric * 2000 * 25;
    WHEN 'indice_hue' THEN
      answer := 10 * (log((numbers ->> 'B6')::numeric) - log((numbers ->> 'B4')::numeric));
    WHEN 'concentracao_be' THEN
      answer := 145.06 - 145.000000000000000000000000 / (numbers ->> 'B15')::numeric;
    ELSE
      RAISE EXCEPTION 'Versão da fórmula não implementada' USING ERRCODE = '22023';
  END CASE;

  RETURN CASE WHEN p_scale IS NULL THEN answer ELSE round(answer, p_scale) END;
END;
$$;

CREATE TABLE public.lab_calculation_evidence (
  result_id bigint PRIMARY KEY REFERENCES public.lab_results(id),
  formula_code text NOT NULL,
  formula_version integer NOT NULL,
  inputs jsonb NOT NULL CHECK (jsonb_typeof(inputs) = 'object'),
  calculated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (formula_code, formula_version) REFERENCES public.lab_formula_versions (code, version)
);

CREATE FUNCTION public.lab_guard_formula_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Versões de fórmulas e evidências de cálculo são imutáveis' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER lab_formula_versions_immutable
BEFORE UPDATE OR DELETE ON public.lab_formula_versions
FOR EACH ROW EXECUTE FUNCTION public.lab_guard_formula_history();

CREATE TRIGGER lab_formula_inputs_immutable
BEFORE UPDATE OR DELETE ON public.lab_formula_inputs
FOR EACH ROW EXECUTE FUNCTION public.lab_guard_formula_history();

CREATE TRIGGER lab_calculation_evidence_immutable
BEFORE UPDATE OR DELETE ON public.lab_calculation_evidence
FOR EACH ROW EXECUTE FUNCTION public.lab_guard_formula_history();

CREATE FUNCTION public.lab_validate_calculation_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM public.lab_results r
    JOIN public.lab_template_parameters tp
      ON (tp.template_version_id, tp.parameter_id) = (r.template_version_id, r.parameter_id)
    JOIN public.lab_formula_versions f ON (f.code, f.version) = (tp.formula_code, tp.formula_version)
    WHERE r.id = NEW.result_id AND r.origin = 'calculated'
      AND (f.code, f.version) = (NEW.formula_code, NEW.formula_version)
      AND f.source_validation = 'verified'
      AND r.numeric_value = public.lab_calculate(f.code, f.version, NEW.inputs)
  ) THEN
    RAISE EXCEPTION 'Evidência incompatível com o resultado e a versão da fórmula aprovada' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lab_validate_calculation_evidence
BEFORE INSERT ON public.lab_calculation_evidence
FOR EACH ROW EXECUTE FUNCTION public.lab_validate_calculation_evidence();

CREATE FUNCTION public.lab_require_calculation_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT FROM public.lab_calculation_evidence WHERE result_id = NEW.id) THEN
    RAISE EXCEPTION 'Resultado calculado exige evidência da fórmula e de suas entradas' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER lab_require_calculation_evidence
AFTER INSERT ON public.lab_results DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (NEW.origin = 'calculated')
EXECUTE FUNCTION public.lab_require_calculation_evidence();

CREATE FUNCTION public.lab_record_calculation(
  p_run bigint, p_sample bigint, p_parameter bigint, p_formula text, p_version integer,
  p_inputs jsonb, p_actor bigint, p_application bigint, p_sector bigint,
  p_revision_reason text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  analysis public.lab_analysis_runs%ROWTYPE;
  previous_result public.lab_results%ROWTYPE;
  result_unit text;
  result_value numeric;
  new_result bigint;
BEGIN
  PERFORM public.lab_assert_actor(p_actor, p_application, p_sector, 'capture');
  analysis := public.lab_lock_current_analysis(p_run);

  IF NOT EXISTS (SELECT FROM public.lab_formula_versions
     WHERE code = p_formula AND version = p_version AND source_validation = 'verified') THEN
    RAISE EXCEPTION 'A fórmula não possui unidade validada para uso em laudo' USING ERRCODE = '55000';
  END IF;

  SELECT tp.unit INTO STRICT result_unit
  FROM public.lab_template_parameters tp
  JOIN public.lab_parameters p ON p.id = tp.parameter_id
  WHERE tp.template_version_id = analysis.template_version_id
    AND p.id = p_parameter AND p.code = p_formula AND tp.origin = 'calculated'
    AND (tp.formula_code, tp.formula_version) = (p_formula, p_version);

  result_value := public.lab_calculate(p_formula, p_version, p_inputs);
  SELECT * INTO previous_result FROM public.lab_results
  WHERE analysis_run_id = p_run AND sample_id = p_sample AND parameter_id = p_parameter
  ORDER BY revision DESC LIMIT 1;

  IF previous_result.id IS NOT NULL THEN
    IF nullif(btrim(p_revision_reason), '') IS NULL THEN
      RAISE EXCEPTION 'Revisar cálculo exige justificativa' USING ERRCODE = '22023';
    END IF;
    UPDATE public.lab_results SET invalidated_at = clock_timestamp(), invalidated_by = p_actor,
      invalidation_reason = btrim(p_revision_reason)
    WHERE id = previous_result.id AND invalidated_at IS NULL;
  END IF;

  INSERT INTO public.lab_results
    (analysis_run_id, batch_id, template_version_id, sample_id, parameter_id, value_type,
     origin, unit, numeric_value, revision, created_by)
  VALUES
    (p_run, analysis.batch_id, analysis.template_version_id, p_sample, p_parameter, 'quantitative',
     'calculated', result_unit, result_value, coalesce(previous_result.revision, 0) + 1, p_actor)
  RETURNING id INTO new_result;

  INSERT INTO public.lab_calculation_evidence (result_id, formula_code, formula_version, inputs)
    VALUES (new_result, p_formula, p_version, p_inputs);
  RETURN new_result;
END;
$$;

REVOKE ALL ON public.lab_formula_versions, public.lab_formula_inputs, public.lab_calculation_evidence FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lab_calculate(text, integer, jsonb, integer),
  public.lab_require_calculation_evidence(), public.lab_validate_template_formulas(),
  public.lab_guard_formula_history(), public.lab_validate_calculation_evidence(),
  public.lab_record_calculation(bigint,bigint,bigint,text,integer,jsonb,bigint,bigint,bigint,text) FROM PUBLIC;
