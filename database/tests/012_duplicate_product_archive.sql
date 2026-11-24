\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  actor bigint;
  duplicate bigint;
  canonical bigint;
  unrelated bigint;
  duplicate_batch bigint;
  canonical_batch bigint;
  equipment bigint;
  capture bigint;
  reading bigint;
BEGIN
  INSERT INTO users(username, display_name, password_hash, role)
    VALUES ('qa_product_duplicate', 'QA produto duplicado', 'unused', 'master') RETURNING id INTO actor;
  INSERT INTO products(name, description, created_by)
    VALUES ('QA produto duplicado', '9912.3456.7891', actor) RETURNING id INTO duplicate;
  INSERT INTO products(name, description, created_by)
    VALUES ('QA produto vigente', '991234567891', actor) RETURNING id INTO canonical;
  INSERT INTO products(name, description, created_by)
    VALUES ('QA produto sem duplicata', '9912.3456.7892', actor) RETURNING id INTO unrelated;
  INSERT INTO batches(product_id, code, created_by)
    VALUES (duplicate, '93525', actor) RETURNING id INTO duplicate_batch;
  INSERT INTO batches(product_id, code, created_by)
    VALUES (canonical, '93526', actor) RETURNING id INTO canonical_batch;
  INSERT INTO batches(product_id, code, created_by) VALUES (unrelated, '93525', actor);

  INSERT INTO equipments(code, name) VALUES ('QA-DUPLICATE-PRODUCT', 'QA')
    RETURNING id INTO equipment;
  INSERT INTO capture_sessions(batch_id, timeout_seconds)
    VALUES (duplicate_batch, 10) RETURNING id INTO capture;
  INSERT INTO readings(batch_id, equipment_id, capture_session_id, value_raw, value_parsed)
    VALUES (duplicate_batch, equipment, capture, 'QA:1,25', '1,25') RETURNING id INTO reading;

  BEGIN
    PERFORM public.portus_delete_product(unrelated, 'qa_product_duplicate');
    RAISE EXCEPTION 'Produto sem duplicata e com histórico foi desativado';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  PERFORM public.portus_delete_product(duplicate, 'qa_product_duplicate');
  ASSERT NOT (SELECT active FROM products WHERE id = duplicate);
  ASSERT (SELECT active FROM products WHERE id = canonical);
  ASSERT (SELECT product_id FROM batches WHERE id = duplicate_batch) = duplicate;
  ASSERT (SELECT product_id FROM batches WHERE id = canonical_batch) = canonical;
  ASSERT EXISTS (SELECT FROM readings WHERE id = reading AND batch_id = duplicate_batch
    AND capture_session_id = capture AND value_raw = 'QA:1,25' AND value_parsed = '1,25');

  BEGIN
    PERFORM public.portus_delete_product(canonical, 'qa_product_duplicate');
    RAISE EXCEPTION 'Último produto ativo com histórico foi desativado';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END;
$$;
ROLLBACK;
