-- PORTUS EPA: preflight somente leitura. Executar no banco de homologação com psql -v ON_ERROR_STOP=1 -f database/tests/epa_preflight.sql
-- Não aplica migrations nem altera dados.
SELECT current_database() AS database_name, current_user AS executing_role, version() AS postgres_version;
SELECT to_regclass('public.portus_schema_migrations') IS NOT NULL AS migration_ledger_present;
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name IN
 ('products','batches','capture_sessions','readings','equipments','users','batch_history','portus_audit_log')
 ORDER BY table_name;
SELECT indexname, indexdef FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'batches'
 ORDER BY indexname;
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS signature,
       p.prosecdef AS security_definer
 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
 AND p.proname IN ('open_batch','register_reading','supervisor_finalize_batch','portus_assert_permission')
 ORDER BY p.proname;
SELECT table_name, column_name, data_type
 FROM information_schema.columns
 WHERE table_schema = 'public'
 AND ((table_name = 'readings' AND column_name IN ('value_raw','value_parsed','batch_id','capture_session_id'))
   OR (table_name = 'batches' AND column_name IN ('product_id','code','completed','status')))
 ORDER BY table_name, column_name;
-- Esperado: indice UNIQUE em (product_id, code), ausencia de UNIQUE isolado em code.
-- Validar também via portus_schema_migrations conforme estrutura real do ledger.
