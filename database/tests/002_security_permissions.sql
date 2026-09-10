BEGIN;

DO $$
DECLARE
  v_table TEXT;
  v_function REGPROCEDURE;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'batches',
    'capture_sessions',
    'readings',
    'batch_history',
    'capture_error_logs'
  ]
  LOOP
    IF has_table_privilege('public', v_table, 'INSERT')
       OR has_table_privilege('public', v_table, 'UPDATE')
       OR has_table_privilege('public', v_table, 'DELETE') THEN
      RAISE EXCEPTION 'PUBLIC ainda possui escrita direta em %', v_table;
    END IF;
  END LOOP;

  FOREACH v_function IN ARRAY ARRAY[
    'open_batch(bigint,text,bigint,bigint,bigint,text)'::REGPROCEDURE,
    'register_reading(bigint,bigint,bigint,text,text,text,text,bigint,bigint,bigint)'::REGPROCEDURE,
    'move_batch_to_stage(bigint,text,bigint,bigint,bigint)'::REGPROCEDURE,
    'confirm_production_close(bigint,bigint,bigint,bigint)'::REGPROCEDURE,
    'confirm_laboratory_close(bigint,bigint,bigint,bigint)'::REGPROCEDURE
  ]
  LOOP
    IF has_function_privilege('public', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'PUBLIC ainda pode executar %', v_function;
    END IF;
  END LOOP;

  RAISE NOTICE 'Stage 1 security permission test OK';
END;
$$;

ROLLBACK;
