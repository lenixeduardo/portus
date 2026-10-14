-- Run against a migrated disposable database; all fixtures are rolled back.
BEGIN;
DO $$
DECLARE
  u BIGINT; p BIGINT; a BIGINT; s BIGINT; b BIGINT; result batches%ROWTYPE;
BEGIN
  INSERT INTO applications(code,name) VALUES ('LAB_FINALIZE_QA','Laboratory QA') RETURNING id INTO a;
  INSERT INTO sectors(code,name) VALUES ('LABORATORY','Laboratório') ON CONFLICT(code) DO NOTHING;
  SELECT id INTO s FROM sectors WHERE code='LABORATORY';
  INSERT INTO users(username,password_hash,role) VALUES ('lab_finalize_qa','test-only','operator') RETURNING id INTO u;
  INSERT INTO user_sector_permissions(user_id,sector_id,can_read) VALUES(u,s,TRUE);
  INSERT INTO application_sector_permissions(application_id,sector_id,can_read) VALUES(a,s,TRUE);
  INSERT INTO products(name,created_by) VALUES('QA',u) RETURNING id INTO p;
  INSERT INTO batches(product_id,code,created_by) VALUES(p,'LAB-FINALIZE-QA',u) RETURNING id INTO b;
  BEGIN
    PERFORM supervisor_finalize_batch(b,u,a,s);
    RAISE EXCEPTION 'Uncompleted batch was finalized';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  PERFORM set_batch_completed(b,u,a,s,TRUE);
  SELECT * INTO result FROM supervisor_finalize_batch(b,u,a,s);
  IF result.status <> 'closed' OR result.closed_by <> u OR result.closed_at IS NULL THEN
    RAISE EXCEPTION 'Laboratory did not finalize batch correctly';
  END IF;
  PERFORM supervisor_finalize_batch(b,u,a,s);
  IF (SELECT count(*) FROM batch_history WHERE batch_id=b AND action='BATCH_FINALIZED') <> 1 THEN
    RAISE EXCEPTION 'Finalization history missing or duplicated on retry';
  END IF;
END; $$;
ROLLBACK;
