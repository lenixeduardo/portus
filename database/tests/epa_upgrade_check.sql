\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM public.batches b
    JOIN public.products p ON p.id = b.product_id
    JOIN public.capture_sessions cs ON cs.batch_id = b.id
    JOIN public.readings r ON r.batch_id = b.id AND r.capture_session_id = cs.id
    WHERE b.code = 'QA-EPA-UPGRADE' AND p.name = 'QA EPA upgrade'
      AND b.lab_analysis_cycle = 1 AND b.status = 'open'
      AND r.value_raw = '00042,60' AND r.value_parsed = '42.60'
  ) THEN
    RAISE EXCEPTION 'Atualização da migration 026 alterou ou perdeu dados originais de captura';
  END IF;
END;
$$;
ROLLBACK;
