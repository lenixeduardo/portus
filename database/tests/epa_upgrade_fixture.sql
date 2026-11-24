\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  actor bigint;
  product bigint;
  batch bigint;
  session bigint;
  instrument bigint;
BEGIN
  INSERT INTO public.users (username, password_hash, display_name, role)
    VALUES ('qa_epa_upgrade', 'unused', 'QA EPA upgrade', 'master') RETURNING id INTO actor;
  INSERT INTO public.products (name, created_by)
    VALUES ('QA EPA upgrade', actor) RETURNING id INTO product;
  INSERT INTO public.batches (product_id, code, created_by, opened_at)
    VALUES (product, 'QA-EPA-UPGRADE', actor, '2020-01-01Z') RETURNING id INTO batch;
  SELECT id INTO STRICT instrument FROM public.equipments ORDER BY id LIMIT 1;
  INSERT INTO public.capture_sessions (batch_id, timeout_seconds)
    VALUES (batch, 15) RETURNING id INTO session;
  INSERT INTO public.readings (batch_id, equipment_id, capture_session_id, value_raw, value_parsed)
    VALUES (batch, instrument, session, '00042,60', '42.60');
END;
$$;
COMMIT;
