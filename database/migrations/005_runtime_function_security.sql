BEGIN;

-- As funções de domínio são a fronteira de escrita do cliente operacional.
-- SECURITY DEFINER permite conceder EXECUTE sem expor INSERT/UPDATE/DELETE
-- diretos nas tabelas de lote. search_path fixo evita resolução maliciosa.
DO $$
DECLARE fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'portus_assert_permission', 'portus_application_code',
         'portus_record_batch_history', 'open_batch', 'register_reading',
         'move_batch_to_stage', 'confirm_production_close',
         'confirm_laboratory_close'
       )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = public, pg_temp', fn.signature);
  END LOOP;
END;
$$;

COMMIT;
