BEGIN;

-- A conta pode ser removida sem apagar produtos, lotes ou leituras.
ALTER TABLE public.products ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_created_by_fkey;
ALTER TABLE public.products ADD CONSTRAINT products_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.batches ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.batches DROP CONSTRAINT IF EXISTS batches_created_by_fkey;
ALTER TABLE public.batches ADD CONSTRAINT batches_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.portus_delete_user(
  p_user_id BIGINT, p_actor_id BIGINT, p_station_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role TEXT;
  v_target_role TEXT;
  v_target_active BOOLEAN;
BEGIN
  -- Serializa a remocao e impede iniciar uma sessao durante a verificacao.
  LOCK TABLE public.users, public.capture_sessions IN SHARE ROW EXCLUSIVE MODE;
  SELECT role INTO v_actor_role FROM public.users WHERE id=p_actor_id AND active;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('master','admin') THEN
    RAISE EXCEPTION 'Sem permissao para excluir usuarios' USING ERRCODE='42501';
  END IF;
  IF p_user_id=p_actor_id THEN
    RAISE EXCEPTION 'Nao e possivel excluir o usuario logado' USING ERRCODE='42501';
  END IF;
  SELECT role,active INTO v_target_role,v_target_active FROM public.users WHERE id=p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario nao encontrado' USING ERRCODE='P0002';
  END IF;
  IF v_target_role='master' AND v_actor_role<>'master' THEN
    RAISE EXCEPTION 'Somente Master pode excluir outro Master' USING ERRCODE='42501';
  END IF;
  IF v_target_active AND (SELECT count(*) FROM public.users WHERE active)<=1 THEN
    RAISE EXCEPTION 'Deve haver ao menos um usuario ativo' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.capture_sessions WHERE user_id=p_user_id AND status='active') THEN
    RAISE EXCEPTION 'Usuario possui captura ativa. Encerre a captura antes de excluir.' USING ERRCODE='55000';
  END IF;
  DELETE FROM public.portus_legacy_import_ledger WHERE entity_type='users' AND central_id=p_user_id;
  DELETE FROM public.users WHERE id=p_user_id;
  -- Permissoes sao removidas por CASCADE; demais vinculos usam SET NULL.
  INSERT INTO public.portus_audit_log(actor_user_id,station_code,action,resource_type,resource_id,details)
  VALUES(p_actor_id,COALESCE(NULLIF(trim(p_station_code),''),'UNKNOWN'),
         'users.delete','user',p_user_id::text,'{"physicalDeletion":true}'::jsonb);
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.portus_delete_user(BIGINT,BIGINT,TEXT) FROM PUBLIC;
DO $$
DECLARE v_grantee TEXT;
BEGIN
  FOR v_grantee IN SELECT DISTINCT grantee FROM information_schema.routine_privileges
    WHERE specific_schema='public' AND routine_name='open_batch'
      AND privilege_type='EXECUTE' AND grantee<>'PUBLIC'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.portus_delete_user(BIGINT,BIGINT,TEXT) TO %I',v_grantee);
  END LOOP;
END;
$$;

COMMIT;
