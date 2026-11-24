CREATE TABLE public.lab_feature_flags (
  code text PRIMARY KEY CHECK (code = 'release_gate'),
  enabled boolean NOT NULL DEFAULT false,
  enforce_from timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.lab_feature_flags (code) VALUES ('release_gate');

-- The existing closure/reopening functions lock this same batch row.
-- Locking the flag coordinates a concurrent configuration change with finalization.
CREATE FUNCTION public.lab_enforce_batch_release() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  gate public.lab_feature_flags%ROWTYPE;
BEGIN
  IF NEW.lab_analysis_cycle IS DISTINCT FROM OLD.lab_analysis_cycle THEN
    RAISE EXCEPTION 'O ciclo laboratorial só muda durante a reabertura' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'closed' AND NEW.status = 'open' THEN
    NEW.lab_analysis_cycle := OLD.lab_analysis_cycle + 1;
  ELSIF OLD.status = 'open' AND NEW.status = 'closed' THEN
    SELECT * INTO STRICT gate FROM public.lab_feature_flags WHERE code = 'release_gate' FOR SHARE;
    IF gate.enabled AND (OLD.opened_at >= gate.enforce_from OR OLD.lab_analysis_cycle > 1)
       AND NOT public.lab_batch_has_approved_conformity(OLD.id, OLD.lab_analysis_cycle) THEN
      RAISE EXCEPTION 'O lote exige aprovação de conformidade laboratorial para o ciclo atual'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER lab_enforce_batch_release
BEFORE UPDATE OF status, lab_analysis_cycle ON public.batches
FOR EACH ROW EXECUTE FUNCTION public.lab_enforce_batch_release();

REVOKE ALL ON public.lab_feature_flags FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lab_enforce_batch_release() FROM PUBLIC;

COMMENT ON TABLE public.lab_feature_flags IS
  'Gate desligado por padrão. Lotes abertos antes de enforce_from seguem a regra legada até sua primeira reabertura após a instalação.';
