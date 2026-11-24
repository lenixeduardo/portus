ALTER TABLE public.batches
  ADD COLUMN lab_analysis_cycle BIGINT NOT NULL DEFAULT 1 CHECK (lab_analysis_cycle > 0),
  ADD COLUMN lab_analysis_serial BIGINT NOT NULL DEFAULT 0 CHECK (lab_analysis_serial >= 0),
  ADD CONSTRAINT lab_batches_identity UNIQUE (id, product_id);

ALTER TABLE public.readings
  ADD CONSTRAINT lab_readings_batch_identity UNIQUE (id, batch_id);

-- Actor IDs remain as historical identifiers when existing PORTUS user deletion removes an account.
CREATE TABLE public.lab_analysis_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  specification_id BIGINT NOT NULL,
  template_version_id BIGINT NOT NULL,
  cycle BIGINT NOT NULL DEFAULT 1 CHECK (cycle > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invalidated_at TIMESTAMPTZ,
  invalidated_by BIGINT,
  invalidation_reason TEXT CHECK (btrim(invalidation_reason) <> ''),
  FOREIGN KEY (batch_id, product_id) REFERENCES public.batches(id, product_id),
  FOREIGN KEY (specification_id, product_id, template_version_id)
    REFERENCES public.lab_product_specifications(id, product_id, template_version_id),
  UNIQUE (batch_id, cycle, revision),
  UNIQUE (id, batch_id, template_version_id),
  CHECK ((invalidated_at IS NULL AND invalidated_by IS NULL AND invalidation_reason IS NULL)
      OR (invalidated_at >= created_at AND invalidated_by IS NOT NULL AND invalidation_reason IS NOT NULL
          AND invalidated_at IS NOT NULL))
);

CREATE TABLE public.lab_samples (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  analysis_run_id BIGINT NOT NULL REFERENCES public.lab_analysis_runs(id),
  identification TEXT NOT NULL CHECK (btrim(identification) <> ''),
  created_by BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (analysis_run_id, identification),
  UNIQUE (id, analysis_run_id)
);

CREATE TABLE public.lab_results (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  analysis_run_id BIGINT NOT NULL,
  batch_id BIGINT NOT NULL,
  template_version_id BIGINT NOT NULL,
  sample_id BIGINT NOT NULL,
  parameter_id BIGINT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('quantitative', 'qualitative')),
  origin TEXT NOT NULL CHECK (origin IN ('manual', 'instrumental', 'calculated')),
  unit TEXT CHECK (btrim(unit) <> ''),
  numeric_value NUMERIC,
  qualitative_value TEXT CHECK (btrim(qualitative_value) <> ''),
  reading_id BIGINT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invalidated_at TIMESTAMPTZ,
  invalidated_by BIGINT,
  invalidation_reason TEXT CHECK (btrim(invalidation_reason) <> ''),
  FOREIGN KEY (analysis_run_id, batch_id, template_version_id)
    REFERENCES public.lab_analysis_runs(id, batch_id, template_version_id),
  FOREIGN KEY (sample_id, analysis_run_id) REFERENCES public.lab_samples(id, analysis_run_id),
  FOREIGN KEY (template_version_id, parameter_id)
    REFERENCES public.lab_template_parameters(template_version_id, parameter_id),
  FOREIGN KEY (reading_id, batch_id) REFERENCES public.readings(id, batch_id),
  UNIQUE (sample_id, parameter_id, revision),
  CHECK ((origin = 'instrumental') = (reading_id IS NOT NULL)),
  CHECK (numeric_value NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  CHECK ((value_type = 'quantitative' AND numeric_value IS NOT NULL AND qualitative_value IS NULL AND unit IS NOT NULL)
      OR (value_type = 'qualitative' AND qualitative_value IS NOT NULL AND numeric_value IS NULL AND unit IS NULL)),
  CHECK ((invalidated_at IS NULL AND invalidated_by IS NULL AND invalidation_reason IS NULL)
      OR (invalidated_at >= created_at AND invalidated_by IS NOT NULL AND invalidation_reason IS NOT NULL
          AND invalidated_at IS NOT NULL))
);

CREATE UNIQUE INDEX lab_results_current_idx
  ON public.lab_results (sample_id, parameter_id) WHERE invalidated_at IS NULL;
CREATE INDEX lab_results_analysis_idx ON public.lab_results (analysis_run_id);
CREATE INDEX lab_results_reading_idx ON public.lab_results (reading_id) WHERE reading_id IS NOT NULL;

CREATE FUNCTION public.lab_touch_batch(p_batch_id BIGINT)
RETURNS public.batches
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  locked_batch public.batches;
BEGIN
  UPDATE public.batches SET lab_analysis_serial = lab_analysis_serial + 1
    WHERE id = p_batch_id RETURNING * INTO locked_batch;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Laboratory batch does not exist' USING ERRCODE = '23503';
  END IF;
  RETURN locked_batch;
END;
$$;

CREATE FUNCTION public.lab_guard_analysis_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  locked_batch public.batches;
  analysis_run public.lab_analysis_runs;
  parameter public.lab_template_parameters;
  instrument public.readings;
  instrument_numeric NUMERIC;
  actor_id BIGINT;
  next_revision INTEGER;
  current_specification_id BIGINT;
  current_specification_ends_at TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Laboratory analysis history is immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'lab_analysis_runs' THEN
    locked_batch := public.lab_touch_batch(NEW.batch_id);
    analysis_run := NEW;
  ELSE
    SELECT * INTO analysis_run FROM public.lab_analysis_runs WHERE id = NEW.analysis_run_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Laboratory analysis run does not exist' USING ERRCODE = '23503';
    END IF;
    locked_batch := public.lab_touch_batch(analysis_run.batch_id);
    SELECT * INTO STRICT analysis_run FROM public.lab_analysis_runs WHERE id = NEW.analysis_run_id;
  END IF;

  IF locked_batch.status <> 'open' OR analysis_run.cycle <> locked_batch.lab_analysis_cycle THEN
    RAISE EXCEPTION 'Only the current cycle of an open batch can change' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME <> 'lab_analysis_runs' AND analysis_run.invalidated_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invalidated analysis is immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'lab_samples' THEN
      RAISE EXCEPTION 'Laboratory samples are immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.invalidated_at IS NOT NULL OR NEW.invalidated_at IS NULL OR
      (to_jsonb(OLD) - ARRAY['invalidated_at', 'invalidated_by', 'invalidation_reason'])
        IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['invalidated_at', 'invalidated_by', 'invalidation_reason']) THEN
      RAISE EXCEPTION 'Laboratory records can only be invalidated once and cannot be overwritten' USING ERRCODE = '23514';
    END IF;
    actor_id := NEW.invalidated_by;
  ELSE
    actor_id := NEW.created_by;
    IF TG_TABLE_NAME <> 'lab_samples' AND to_jsonb(NEW) ->> 'invalidated_at' IS NOT NULL THEN
      RAISE EXCEPTION 'New laboratory records cannot be invalidated' USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM 1 FROM public.users WHERE id = actor_id AND active FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active user must record laboratory evidence' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' OR TG_TABLE_NAME = 'lab_samples' THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'lab_analysis_runs' THEN
    PERFORM public.lab_touch_specifications(locked_batch.product_id);
    -- A replacement retires its predecessors from prospective use, including
    -- after the replacement expires. Existing runs retain their original spec.
    SELECT id, effective_until INTO current_specification_id, current_specification_ends_at
    FROM public.lab_product_specifications
    WHERE product_id = locked_batch.product_id AND status = 'approved'
      AND statement_timestamp() >= effective_from
    ORDER BY effective_from DESC LIMIT 1;
    IF current_specification_id IS NULL OR NEW.specification_id <> current_specification_id
      OR statement_timestamp() >= current_specification_ends_at THEN
      RAISE EXCEPTION 'The latest effective specification is required to start laboratory analysis' USING ERRCODE = '23514';
    END IF;
    SELECT coalesce(max(revision), 0) + 1 INTO next_revision FROM public.lab_analysis_runs
      WHERE batch_id = NEW.batch_id AND cycle = NEW.cycle;
  ELSE
    SELECT * INTO parameter FROM public.lab_template_parameters
      WHERE template_version_id = NEW.template_version_id AND parameter_id = NEW.parameter_id;
    IF parameter.value_type IS DISTINCT FROM NEW.value_type
      OR parameter.origin IS DISTINCT FROM NEW.origin OR parameter.unit IS DISTINCT FROM NEW.unit THEN
      RAISE EXCEPTION 'Result type, unit or origin differs from the template parameter' USING ERRCODE = '23514';
    END IF;
    IF NEW.reading_id IS NOT NULL THEN
      SELECT reading.* INTO instrument
      FROM public.readings AS reading
      JOIN public.capture_sessions AS capture ON capture.id = reading.capture_session_id
      WHERE reading.id = NEW.reading_id AND reading.batch_id = NEW.batch_id AND capture.batch_id = NEW.batch_id
      FOR SHARE OF reading, capture;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Instrument reading belongs to a different batch or session' USING ERRCODE = '23503';
      END IF;
      IF parameter.equipment_id IS NOT NULL AND parameter.equipment_id <> instrument.equipment_id THEN
        RAISE EXCEPTION 'Instrument reading differs from the required equipment' USING ERRCODE = '23514';
      END IF;
      IF instrument.value_parsed IS NULL OR instrument.parse_failure_reason IS NOT NULL THEN
        RAISE EXCEPTION 'Instrument reading has no valid parsed value' USING ERRCODE = '23514';
      END IF;
      IF NEW.value_type = 'quantitative' THEN
        BEGIN
          instrument_numeric := replace(btrim(instrument.value_parsed), ',', '.')::numeric;
        EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
          RAISE EXCEPTION 'Instrument reading is not a valid numeric value' USING ERRCODE = '23514';
        END;
        IF NEW.numeric_value IS DISTINCT FROM instrument_numeric THEN
          RAISE EXCEPTION 'Result differs from the parsed instrument reading' USING ERRCODE = '23514';
        END IF;
      ELSIF NEW.qualitative_value IS DISTINCT FROM btrim(instrument.value_parsed) THEN
        RAISE EXCEPTION 'Result differs from the parsed instrument reading' USING ERRCODE = '23514';
      END IF;
    END IF;
    SELECT coalesce(max(revision), 0) + 1 INTO next_revision FROM public.lab_results
      WHERE sample_id = NEW.sample_id AND parameter_id = NEW.parameter_id;
  END IF;

  IF NEW.revision <> next_revision THEN
    RAISE EXCEPTION 'Laboratory records must use the next revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lab_analysis_runs_guard BEFORE INSERT OR UPDATE OR DELETE ON public.lab_analysis_runs
  FOR EACH ROW EXECUTE FUNCTION public.lab_guard_analysis_write();
CREATE TRIGGER lab_samples_guard BEFORE INSERT OR UPDATE OR DELETE ON public.lab_samples
  FOR EACH ROW EXECUTE FUNCTION public.lab_guard_analysis_write();
CREATE TRIGGER lab_results_guard BEFORE INSERT OR UPDATE OR DELETE ON public.lab_results
  FOR EACH ROW EXECUTE FUNCTION public.lab_guard_analysis_write();

REVOKE ALL ON public.lab_analysis_runs, public.lab_samples, public.lab_results FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lab_touch_batch(BIGINT), public.lab_guard_analysis_write() FROM PUBLIC;
