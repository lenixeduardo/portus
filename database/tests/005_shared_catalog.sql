BEGIN;

-- Teste real PostgreSQL: Produto criado em Produção precisa existir na
-- mesma tabela acessada pelo Laboratório e pelo servidor, sem cópias locais.
INSERT INTO users (username, password_hash, role, sector_code, active)
VALUES
  ('__PORTUS_SYNC_TEST_PRODUCTION__', 'test-hash', 'operator', 'PRODUCTION', TRUE),
  ('__PORTUS_SYNC_TEST_LABORATORY__', 'test-hash', 'laboratory', 'LABORATORY', TRUE);

CREATE TEMP TABLE portus_test_product (id BIGINT NOT NULL);
INSERT INTO portus_test_product (id)
SELECT portus_save_product(
  NULL, '__PORTUS_PRODUCT_SYNC_TEST__', 'ref-prod',
  '__PORTUS_SYNC_TEST_PRODUCTION__'
);

DO $$
DECLARE
  v_id BIGINT;
  v_row products%ROWTYPE;
BEGIN
  SELECT id INTO STRICT v_id FROM portus_test_product;
  SELECT * INTO STRICT v_row FROM products WHERE id = v_id;
  IF v_row.name <> '__PORTUS_PRODUCT_SYNC_TEST__' OR v_row.description <> 'ref-prod' OR NOT v_row.active THEN
    RAISE EXCEPTION 'Produto criado na Produção não está disponível no PostgreSQL central';
  END IF;

  -- O operador do Laboratório atualiza o MESMO identificador.
  PERFORM portus_save_product(
    v_id, '__PORTUS_PRODUCT_SYNC_TEST__', 'ref-lab',
    '__PORTUS_SYNC_TEST_LABORATORY__'
  );
  SELECT * INTO STRICT v_row FROM products WHERE id = v_id;
  IF v_row.description <> 'ref-lab' THEN
    RAISE EXCEPTION 'A alteração do Laboratório não ficou visível no servidor';
  END IF;

  -- Não permite duas identidades de produto com o mesmo nome em case diferente.
  BEGIN
    PERFORM portus_save_product(
      NULL, '__portus_product_sync_test__', 'duplicado',
      '__PORTUS_SYNC_TEST_PRODUCTION__'
    );
    RAISE EXCEPTION 'Aceitou produto duplicado ignorando maiúsculas/minúsculas';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- Exclusão desativa o item, sem apagar o ID necessário para lotes antigos.
  PERFORM portus_delete_product(v_id, '__PORTUS_SYNC_TEST_PRODUCTION__');
  SELECT * INTO STRICT v_row FROM products WHERE id = v_id;
  IF v_row.active THEN
    RAISE EXCEPTION 'Produto desativado continua ativo';
  END IF;
END;
$$;

ROLLBACK;
