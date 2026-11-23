\set ON_ERROR_STOP on
-- Execute após a migration 026 e o seed de referência. Nenhum registro é persistido.
BEGIN;
DO $$
DECLARE
  v_app BIGINT;
  v_sector BIGINT;
  v_user BIGINT;
  v_product_a BIGINT;
  v_product_b BIGINT;
  v_batch_a BIGINT;
  v_batch_b BIGINT;
  v_code TEXT := 'QA-COMPOSITE-IDENTITY-026';
BEGIN
  SELECT id INTO v_app FROM applications WHERE code = 'PORTUS';
  SELECT id INTO v_sector FROM sectors WHERE code = 'PRODUCTION';
  IF v_app IS NULL OR v_sector IS NULL THEN
    RAISE EXCEPTION 'Aplicação ou setor de referência ausente';
  END IF;

  INSERT INTO users (username, password_hash, display_name, role)
  VALUES ('qa_composite_identity_026', 'unused-test-value', 'QA composite identity', 'master')
  RETURNING id INTO v_user;

  INSERT INTO products (name, description, created_by)
  VALUES ('QA composite product A 026', 'QA', v_user)
  RETURNING id INTO v_product_a;
  INSERT INTO products (name, description, created_by)
  VALUES ('QA composite product B 026', 'QA', v_user)
  RETURNING id INTO v_product_b;

  SELECT id INTO v_batch_a FROM open_batch(v_product_a, v_code, v_user, v_app, v_sector, 'A');
  SELECT id INTO v_batch_b FROM open_batch(v_product_b, v_code, v_user, v_app, v_sector, 'A');
  IF v_batch_a = v_batch_b OR (SELECT COUNT(*) FROM batches WHERE code = v_code) <> 2 THEN
    RAISE EXCEPTION 'Mesmo código não foi aceito para produtos diferentes';
  END IF;

  BEGIN
    PERFORM open_batch(v_product_a, v_code, v_user, v_app, v_sector, 'A');
    RAISE EXCEPTION 'Lote duplicado do mesmo produto foi permitido';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- Esperado: restrição única (product_id, code).
  END;

  IF (SELECT COUNT(*) FROM batches WHERE code = v_code AND product_id = v_product_a) <> 1 THEN
    RAISE EXCEPTION 'Lote duplicado do produto A foi persistido';
  END IF;
  RAISE NOTICE 'Chave composta validada: lotes % e %', v_batch_a, v_batch_b;
END;
$$;
ROLLBACK;
