-- Executa no PostgreSQL real do CI; transação revertida ao final.
BEGIN;
DO $$
DECLARE
  v_actor BIGINT;
  v_target BIGINT;
  v_username TEXT := 'supervisor-delete-ci-' || txid_current();
  v_barcode TEXT := 'SUPERVISOR-DELETE-CI-' || txid_current();
BEGIN
  SELECT id INTO v_actor FROM public.users WHERE role='master' AND active ORDER BY id LIMIT 1;
  IF v_actor IS NULL THEN
    -- O fixture de testes deve ter um ator Master explícito.
    INSERT INTO public.users(username,password_hash,role,sector_code,active)
    VALUES('master-delete-ci-' || txid_current(),'test-only','master','ADMIN',TRUE)
    RETURNING id INTO v_actor;
  END IF;
  INSERT INTO public.users(username,password_hash,role,sector_code,active,barcode_value)
  VALUES(v_username,'test-only','supervisor','PRODUCTION',TRUE,v_barcode)
  RETURNING id INTO v_target;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=v_target AND active AND role='supervisor') THEN
    RAISE EXCEPTION 'Falha ao criar Supervisor de teste';
  END IF;
  -- O login do aplicativo pesquisa somente contas ativas, por nome ou crachá.
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE lower(username)=lower(v_username) AND active)
     OR NOT EXISTS (SELECT 1 FROM public.users WHERE lower(barcode_value)=lower(v_barcode) AND active) THEN
    RAISE EXCEPTION 'Supervisor não pode autenticar antes da exclusão';
  END IF;
  IF public.portus_delete_user(v_target,v_actor,'QA-CI') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Exclusão não confirmada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id=v_target OR username=v_username OR barcode_value=v_barcode) THEN
    RAISE EXCEPTION 'Supervisor continua no PostgreSQL após exclusão';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE lower(username)=lower(v_username) AND active)
     OR EXISTS (SELECT 1 FROM public.users WHERE lower(barcode_value)=lower(v_barcode) AND active) THEN
    RAISE EXCEPTION 'Credenciais de usuário excluído continuam válidas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portus_audit_log WHERE action='users.delete' AND resource_id=v_target::text) THEN
    RAISE EXCEPTION 'Auditoria de exclusão não registrada';
  END IF;
END;
$$;
ROLLBACK;
