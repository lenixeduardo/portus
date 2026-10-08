-- Redefinição EXPLÍCITA da senha Master local (admin/admin).
-- Jamais executar no servidor em produção.
BEGIN;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.users WHERE lower(username) = 'admin') <> 1 THEN
    RAISE EXCEPTION 'Conta admin não encontrada ou duplicada; não é seguro redefinir a senha.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(username) = 'admin' AND role = 'master' AND active
  ) THEN
    RAISE EXCEPTION 'Conta admin existente não é Master ativo; alteração recusada.';
  END IF;
END;
$$;

UPDATE public.users
SET password_hash = '$2b$12$Hlt6Ovi0lL0vi1nmeBGRKeb3XtQw5NIUPWWDKsZBdy0j9qjUzP1v2'
WHERE lower(username) = 'admin' AND role = 'master' AND active;

COMMIT;
