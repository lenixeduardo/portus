BEGIN;

-- O catálogo é administrado pela estação, mas o PostgreSQL continua sendo a
-- fonte de verdade para lotes. Esta função cria apenas o produto ausente e
-- mantém a escrita direta em products fora do alcance do usuário operacional.
CREATE OR REPLACE FUNCTION ensure_product(
  p_name TEXT,
  p_description TEXT,
  p_user_id BIGINT,
  p_application_id BIGINT,
  p_sector_id BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product_id BIGINT;
  v_name TEXT := trim(p_name);
BEGIN
  PERFORM portus_assert_permission(
    p_user_id, p_application_id, p_sector_id, 'open'
  );

  IF v_name IS NULL OR length(v_name) = 0 THEN
    RAISE EXCEPTION 'Nome do produto é obrigatório'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO products (name, description, created_by)
  VALUES (v_name, NULLIF(trim(p_description), ''), p_user_id)
  ON CONFLICT (name) DO NOTHING
  RETURNING id INTO v_product_id;

  IF v_product_id IS NULL THEN
    SELECT id INTO v_product_id FROM products WHERE name = v_name;
  END IF;

  RETURN v_product_id;
END;
$$;

COMMIT;
