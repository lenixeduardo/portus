-- Executar depois da migration 015; nao deixa registros de teste no banco.
BEGIN;
DO $$
DECLARE
  v_id BIGINT;
  v_sector TEXT;
BEGIN
  INSERT INTO public.users(username, password_hash, role, sector_code)
  VALUES ('MASTER-SECTOR-QA-' || txid_current(), 'test-only', 'master', 'PRODUCTION')
  RETURNING id, sector_code INTO v_id, v_sector;
  IF v_sector <> 'ADMIN' THEN
    RAISE EXCEPTION 'Master novo nao foi classificado como ADMIN';
  END IF;
  UPDATE public.users SET sector_code = 'LABORATORY', laboratory_profile = 'capture' WHERE id = v_id;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_id AND role = 'master'
                 AND sector_code = 'ADMIN' AND laboratory_profile IS NULL) THEN
    RAISE EXCEPTION 'Atualizacao legada alterou o setor administrativo do Master';
  END IF;
  BEGIN
    INSERT INTO public.users(username, password_hash, role, sector_code)
    VALUES ('OPERATOR-SECTOR-QA-' || txid_current(), 'test-only', 'operator', 'ADMIN');
    RAISE EXCEPTION 'Operador foi aceito no setor ADMIN';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;
ROLLBACK;
