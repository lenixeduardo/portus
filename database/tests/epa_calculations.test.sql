\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  fixture record;
  actual numeric;
BEGIN
  FOR fixture IN SELECT * FROM (VALUES
    ('cor_spencer', '{"B3":{"value":0.6,"unit":"Abs"}}', 124.855::numeric),
    ('poder_tintorial', '{"B5":{"value":0.187,"unit":"Abs"}}', 0.187),
    ('poder_corante', '{"B7":{"value":0.482,"unit":"Abs"}}', 24100),
    ('indice_hue', '{"B4":{"value":0.04,"unit":"Abs"},"B6":{"value":0.17,"unit":"Abs"}}', 6.2838893005031151),
    ('concentracao_be', '{"B15":{"value":1.28,"unit":"g/mL"}}', 31.77875)
  ) AS f(code, inputs, expected)
  LOOP
    actual := public.lab_calculate(fixture.code, 1, fixture.inputs::jsonb);
    IF actual IS NULL OR abs(actual - fixture.expected) > 0.00000000000001 THEN
      RAISE EXCEPTION 'Fórmula %: esperado %, obtido %', fixture.code, fixture.expected, actual;
    END IF;
  END LOOP;

  IF public.lab_calculate('cor_spencer', 1, '{"B3":{"value":0.6,"unit":"Abs"}}', 2) <> 124.86
     OR public.lab_calculate('poder_corante', 1, '{"B7":{"value":1e100,"unit":"Abs"}}') <> 5e104 THEN
    RAISE EXCEPTION 'Arredondamento ou valor extremo calculado incorretamente';
  END IF;

  FOR fixture IN SELECT * FROM (VALUES
    ('cor_spencer', '{"B3":{"value":0,"unit":"Abs"}}'),
    ('cor_spencer', '{"B3":{"value":null,"unit":"Abs"}}'),
    ('cor_spencer', '{"B3":{"value":"NaN","unit":"Abs"}}'),
    ('cor_spencer', NULL),
    ('indice_hue', '{"B4":{"value":-1,"unit":"Abs"},"B6":{"value":1,"unit":"Abs"}}'),
    ('indice_hue', '{"B4":{"value":1,"unit":"Abs"},"B6":{"value":0,"unit":"Abs"}}'),
    ('concentracao_be', '{"B15":{"value":1280,"unit":"g/L"}}'),
    ('poder_tintorial', '{"B5":{"value":0.187,"unit":"Abs"},"B6":{"value":1,"unit":"Abs"}}')
  ) AS f(code, inputs)
  LOOP
    BEGIN
      PERFORM public.lab_calculate(fixture.code, 1, fixture.inputs::jsonb);
      RAISE EXCEPTION 'Entrada inválida aceita: % %', fixture.code, fixture.inputs;
    EXCEPTION WHEN invalid_parameter_value THEN
      NULL;
    END;
  END LOOP;

  IF NOT EXISTS (SELECT FROM public.lab_formula_versions
                 WHERE code = 'concentracao_be' AND source_validation = 'blocked') THEN
    RAISE EXCEPTION 'Unidade ambígua da densidade não foi sinalizada';
  END IF;
END;
$$;
ROLLBACK;
