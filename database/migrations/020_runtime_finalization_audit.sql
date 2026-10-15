BEGIN;

-- A migration 014 precede os GRANTs do runtime numa instalação nova.
-- Repara contas já autorizadas a finalizar lotes, sem permitir alterações
-- diretas nos lotes ou edição/exclusão de registros de auditoria.
DO $$
DECLARE
  v_grantee TEXT;
BEGIN
  FOR v_grantee IN
    SELECT DISTINCT grantee
      FROM information_schema.routine_privileges
     WHERE specific_schema = 'public'
       AND routine_name = 'supervisor_finalize_batch'
       AND privilege_type = 'EXECUTE'
       AND grantee <> 'PUBLIC'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT ON TABLE public.portus_audit_log TO %I', v_grantee);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.portus_audit_log_id_seq TO %I', v_grantee);
  END LOOP;
END;
$$;

COMMIT;
