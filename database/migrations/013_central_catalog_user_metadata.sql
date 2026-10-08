BEGIN;

-- 013: Cadastro compartilhado de produtos e metadados de identidade.
-- Os IDs passam a ser centralizados no PostgreSQL, independentemente da estação.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS barcode_value TEXT,
  ADD COLUMN IF NOT EXISTS sector_code TEXT NOT NULL DEFAULT 'PRODUCTION',
  ADD COLUMN IF NOT EXISTS laboratory_profile TEXT;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_sector_code_check;
ALTER TABLE users ADD CONSTRAINT users_sector_code_check
  CHECK (sector_code IN ('PRODUCTION', 'LABORATORY'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_laboratory_profile_check;
ALTER TABLE users ADD CONSTRAINT users_laboratory_profile_check
  CHECK (laboratory_profile IS NULL OR laboratory_profile = 'capture');

UPDATE users SET sector_code = 'LABORATORY'
 WHERE role = 'laboratory' AND sector_code <> 'LABORATORY';

CREATE UNIQUE INDEX IF NOT EXISTS idx_portus_users_barcode_nocase
  ON users (lower(barcode_value))
  WHERE barcode_value IS NOT NULL;

CREATE OR REPLACE FUNCTION portus_save_product(
  p_id BIGINT,
  p_name TEXT,
  p_description TEXT,
  p_actor_username TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id BIGINT;
  v_name TEXT := trim(p_name);
  v_product_id BIGINT;
BEGIN
  SELECT id INTO v_actor_id FROM users
   WHERE username = p_actor_username AND active;
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autorizado a cadastrar produtos'
      USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR length(v_name) = 0 THEN
    RAISE EXCEPTION 'Nome do produto obrigatório'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM products
     WHERE lower(name) = lower(v_name) AND (p_id IS NULL OR id <> p_id)
  ) THEN
    RAISE EXCEPTION 'Já existe um produto com esse nome'
      USING ERRCODE = '23505';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO products (name, description, created_by)
    VALUES (v_name, NULLIF(trim(p_description), ''), v_actor_id)
    RETURNING id INTO v_product_id;
  ELSE
    UPDATE products
       SET name = v_name, description = NULLIF(trim(p_description), '')
     WHERE id = p_id
    RETURNING id INTO v_product_id;
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN v_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION portus_delete_product(
  p_product_id BIGINT,
  p_actor_username TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id BIGINT;
BEGIN
  SELECT id INTO v_actor_id FROM users
   WHERE username = p_actor_username AND active;
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autorizado a excluir produtos'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM batches WHERE product_id = p_product_id) THEN
    RAISE EXCEPTION 'Produto com histórico de lotes não pode ser excluído'
      USING ERRCODE = '23503';
  END IF;
  DELETE FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'P0002';
  END IF;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION portus_save_product(BIGINT,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION portus_delete_product(BIGINT,TEXT) FROM PUBLIC;

-- Mantém o mesmo usuário PostgreSQL que já opera os lotes centrais.
DO $$
DECLARE
  v_grantee TEXT;
BEGIN
  FOR v_grantee IN
    SELECT DISTINCT grantee
      FROM information_schema.routine_privileges
     WHERE specific_schema = 'public'
       AND routine_name = 'open_batch'
       AND privilege_type = 'EXECUTE'
       AND grantee <> 'PUBLIC'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION portus_save_product(BIGINT,TEXT,TEXT,TEXT) TO %I', v_grantee);
    EXECUTE format('GRANT EXECUTE ON FUNCTION portus_delete_product(BIGINT,TEXT) TO %I', v_grantee);
  END LOOP;
END;
$$;

COMMIT;
