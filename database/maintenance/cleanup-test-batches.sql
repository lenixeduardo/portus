BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Impede que uma captura comece enquanto verificamos/removemos os lotes.
LOCK TABLE batches, capture_sessions, readings IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE selected_test_batches(id BIGINT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO selected_test_batches SELECT DISTINCT unnest(string_to_array(:'batch_ids', ',')::bigint[]);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM selected_test_batches) OR
     EXISTS (SELECT 1 FROM selected_test_batches s LEFT JOIN batches b ON b.id=s.id WHERE b.id IS NULL) THEN
    RAISE EXCEPTION 'Selecao vazia ou lote inexistente. Atualize a previa antes de limpar.';
  END IF;
  IF EXISTS (SELECT 1 FROM capture_sessions s JOIN selected_test_batches t ON t.id=s.batch_id WHERE s.status='active') THEN
    RAISE EXCEPTION 'Lote selecionado possui captura ativa. Encerre a captura antes de limpar.';
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
    OR (entity_type='capture_sessions' AND central_id IN (SELECT id FROM selected_test_sessions))
    OR (entity_type='readings' AND central_id IN (SELECT id FROM selected_test_readings))
    OR (entity_type='batch_history' AND central_id IN (SELECT id FROM selected_test_history))
    OR (entity_type='capture_error_logs' AND central_id IN (SELECT id FROM selected_test_errors));
DELETE FROM capture_error_logs WHERE id IN (SELECT id FROM selected_test_errors);
DELETE FROM portus_audit_log
 WHERE resource_type='batch' AND resource_id IN (SELECT id::text FROM selected_test_batches);
INSERT INTO portus_audit_log(station_code,action,resource_type,details)
 SELECT 'DATABASE-UTILITY','maintenance.cleanup_test_batches','maintenance',
   jsonb_build_object('database_user',current_user,'backup',:'backup_path',
     'batches',(SELECT jsonb_agg(jsonb_build_object('id',b.id::text,'code',b.code))
               FROM batches b JOIN selected_test_batches t ON t.id=b.id),
     'readings',(SELECT count(*) FROM selected_test_readings));
-- FKs removem sessoes, leituras, historico e referencias de exportacao.
-- Usuarios, produtos, equipamentos e configuracoes nao sao apagados.
DELETE FROM batches WHERE id IN (SELECT id FROM selected_test_batches);
COMMIT;
