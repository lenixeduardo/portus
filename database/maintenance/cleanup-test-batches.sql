BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE batches, products, users, capture_sessions, readings IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE selected_test_batches(id BIGINT PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE selected_test_products(id BIGINT PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE selected_test_users(id BIGINT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO selected_test_batches SELECT DISTINCT unnest(string_to_array(:'batch_ids', ',')::bigint[]);
INSERT INTO selected_test_products SELECT DISTINCT unnest(string_to_array(:'product_ids', ',')::bigint[]);
INSERT INTO selected_test_users SELECT DISTINCT unnest(string_to_array(:'user_ids', ',')::bigint[]);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM selected_test_batches s LEFT JOIN batches b USING(id) WHERE b.id IS NULL)
     OR EXISTS (SELECT 1 FROM selected_test_products s LEFT JOIN products p USING(id) WHERE p.id IS NULL)
     OR EXISTS (SELECT 1 FROM selected_test_users s LEFT JOIN users u USING(id) WHERE u.id IS NULL) THEN
    RAISE EXCEPTION 'Selecao desatualizada. Atualize a previa; nenhuma exclusao realizada.';
  END IF;
  IF EXISTS (SELECT 1 FROM selected_test_users s JOIN users u USING(id) WHERE u.role='master') THEN
    RAISE EXCEPTION 'A conta Master nunca pode ser excluida.';
  END IF;
  IF EXISTS (SELECT 1 FROM capture_sessions s JOIN selected_test_batches t ON t.id=s.batch_id WHERE s.status='active') THEN
    RAISE EXCEPTION 'Ha captura ativa em lote selecionado.';
  END IF;
  IF EXISTS (SELECT 1 FROM batches b JOIN selected_test_products p ON p.id=b.product_id LEFT JOIN selected_test_batches s ON s.id=b.id WHERE s.id IS NULL) THEN
    RAISE EXCEPTION 'Produto selecionado possui lote nao selecionado. Selecione o lote tambem.';
  END IF;
  IF :'clear_history' = 'true' AND EXISTS (SELECT 1 FROM capture_sessions WHERE status='active') THEN
    RAISE EXCEPTION 'Nao e permitido limpar historicos enquanto houver capturas ativas.';
  END IF;
END;
$$;
CREATE TEMP TABLE selected_test_sessions ON COMMIT DROP AS
  SELECT id FROM capture_sessions WHERE batch_id IN (SELECT id FROM selected_test_batches);
CREATE TEMP TABLE selected_test_readings ON COMMIT DROP AS
  SELECT id FROM readings WHERE batch_id IN (SELECT id FROM selected_test_batches);
CREATE TEMP TABLE selected_test_history ON COMMIT DROP AS
  SELECT id FROM batch_history WHERE batch_id IN (SELECT id FROM selected_test_batches);
CREATE TEMP TABLE selected_test_errors ON COMMIT DROP AS
  SELECT id FROM capture_error_logs WHERE batch_id IN (SELECT id FROM selected_test_batches)
     OR capture_session_id IN (SELECT id FROM selected_test_sessions);
DELETE FROM portus_legacy_import_ledger
 WHERE (entity_type='batches' AND central_id IN (SELECT id FROM selected_test_batches))
    OR (entity_type='products' AND central_id IN (SELECT id FROM selected_test_products))
    OR (entity_type='users' AND central_id IN (SELECT id FROM selected_test_users))
    OR (entity_type='capture_sessions' AND central_id IN (SELECT id FROM selected_test_sessions))
    OR (entity_type='readings' AND central_id IN (SELECT id FROM selected_test_readings))
    OR (entity_type='batch_history' AND central_id IN (SELECT id FROM selected_test_history))
    OR (entity_type='capture_error_logs' AND central_id IN (SELECT id FROM selected_test_errors));
DELETE FROM capture_error_logs WHERE id IN (SELECT id FROM selected_test_errors);
DELETE FROM portus_audit_log
 WHERE (resource_type='batch' AND resource_id IN (SELECT id::text FROM selected_test_batches))
    OR (resource_type='user' AND resource_id IN (SELECT id::text FROM selected_test_users))
    OR (resource_type='product' AND resource_id IN (SELECT id::text FROM selected_test_products));
DELETE FROM batches WHERE id IN (SELECT id FROM selected_test_batches);
DELETE FROM products WHERE id IN (SELECT id FROM selected_test_products);
DELETE FROM users WHERE id IN (SELECT id FROM selected_test_users);
-- Opcao explicita remove historicos avulsos, sem apagar a estrutura/configuracoes.
DELETE FROM batch_history WHERE :'clear_history' = 'true';
DELETE FROM capture_error_logs WHERE :'clear_history' = 'true';
DELETE FROM portus_audit_log WHERE :'clear_history' = 'true';
DELETE FROM portus_legacy_import_ledger WHERE :'clear_history' = 'true'
  AND entity_type IN ('batches','products','users','capture_sessions','readings','batch_history','capture_error_logs');
INSERT INTO portus_audit_log(station_code,action,resource_type,details)
 VALUES ('DATABASE-UTILITY','maintenance.cleanup_selected_data','maintenance',
   jsonb_build_object('database_user',current_user,'backup',:'backup_path',
     'batches',(SELECT count(*) FROM selected_test_batches),
     'products',(SELECT count(*) FROM selected_test_products),
     'users',(SELECT count(*) FROM selected_test_users),
     'clear_history',:'clear_history'));
COMMIT;
