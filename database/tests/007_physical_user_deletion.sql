BEGIN;
DO $$
DECLARE
  v_actor BIGINT;
  v_target BIGINT;
  v_product BIGINT;
  v_batch BIGINT;
  v_session BIGINT;
  v_equipment BIGINT;
  v_sector BIGINT;
  v_login TEXT := 'DELETE-USER-QA-' || txid_current();
BEGIN
  SELECT id INTO v_actor FROM users WHERE role='master' AND active ORDER BY id LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Teste exige Master ativo'; END IF;
  SELECT id INTO v_equipment FROM equipments ORDER BY id LIMIT 1;
  SELECT id INTO v_sector FROM sectors WHERE code='PRODUCTION';
  INSERT INTO users(username,password_hash,role,sector_code,active)
  VALUES(v_login,'test-only','operator','PRODUCTION',FALSE) RETURNING id INTO v_target;
  INSERT INTO user_sector_permissions(user_id,sector_id) VALUES(v_target,v_sector);
  INSERT INTO products(name,created_by) VALUES(v_login,v_target) RETURNING id INTO v_product;
  INSERT INTO batches(product_id,code,created_by) VALUES(v_product,v_login,v_target) RETURNING id INTO v_batch;
  INSERT INTO capture_sessions(batch_id,user_id,timeout_seconds,status)
  VALUES(v_batch,v_target,30,'completed') RETURNING id INTO v_session;
  INSERT INTO readings(batch_id,capture_session_id,equipment_id,value_raw)
  VALUES(v_batch,v_session,v_equipment,'10.5');
  INSERT INTO batch_history(batch_id,action,user_id) VALUES(v_batch,'QA',v_target);
  INSERT INTO portus_legacy_import_ledger(station_code,entity_type,local_id,central_id,source_hash)
  VALUES('DELETE-QA','users',v_target,v_target,'test-only');

  PERFORM portus_delete_user(v_target,v_actor,'DELETE-QA');
  IF EXISTS(SELECT 1 FROM users WHERE id=v_target OR username=v_login) OR
     EXISTS(SELECT 1 FROM user_sector_permissions WHERE user_id=v_target) OR
     EXISTS(SELECT 1 FROM portus_legacy_import_ledger WHERE entity_type='users' AND central_id=v_target) THEN
    RAISE EXCEPTION 'Conta ou permissao ainda existe depois da exclusao';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM products WHERE id=v_product AND created_by IS NULL) OR
     NOT EXISTS(SELECT 1 FROM batches WHERE id=v_batch AND created_by IS NULL) OR
     NOT EXISTS(SELECT 1 FROM capture_sessions WHERE id=v_session AND user_id IS NULL) OR
     NOT EXISTS(SELECT 1 FROM readings WHERE capture_session_id=v_session) OR
     NOT EXISTS(SELECT 1 FROM batch_history WHERE batch_id=v_batch AND user_id IS NULL) THEN
    RAISE EXCEPTION 'Historico perdido na exclusao do usuario';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM portus_audit_log WHERE action='users.delete'
                AND resource_id=v_target::text AND details->>'physicalDeletion'='true') THEN
    RAISE EXCEPTION 'Auditoria da exclusao ausente';
  END IF;
  -- O nome fica disponivel novamente: nao ha uma conta oculta/desabilitada.
  INSERT INTO users(username,password_hash,role,sector_code)
  VALUES(v_login,'test-only','operator','PRODUCTION') RETURNING id INTO v_target;
  BEGIN
    PERFORM portus_delete_user(v_actor,v_actor,'DELETE-QA');
    RAISE EXCEPTION 'Autoexclusao foi aceita';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM portus_delete_user(v_actor,v_target,'DELETE-QA');
    RAISE EXCEPTION 'Operador conseguiu excluir conta administrativa';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO capture_sessions(batch_id,user_id,timeout_seconds,status)
  VALUES(v_batch,v_target,30,'active');
  BEGIN
    PERFORM portus_delete_user(v_target,v_actor,'DELETE-QA');
    RAISE EXCEPTION 'Conta com captura ativa foi removida';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=v_target) THEN
    RAISE EXCEPTION 'Conta removida apesar da captura ativa';
  END IF;
END;
$$;
ROLLBACK;
