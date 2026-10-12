BEGIN;

-- ADMIN classifica a identidade Master. Estacoes e sessoes continuam nos
-- setores operacionais PRODUCTION/LABORATORY, preservando a rastreabilidade.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_sector_code_check;
ALTER TABLE public.users ADD CONSTRAINT users_sector_code_check
  CHECK (sector_code IN ('PRODUCTION', 'LABORATORY', 'ADMIN'));

UPDATE public.users
   SET sector_code = 'ADMIN', laboratory_profile = NULL
 WHERE role = 'master';

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_master_administrative_sector_check;
ALTER TABLE public.users ADD CONSTRAINT users_master_administrative_sector_check
  CHECK ((role = 'master' AND sector_code = 'ADMIN') OR
         (role <> 'master' AND sector_code <> 'ADMIN'));

-- Protege instaladores/importadores antigos que ainda enviam PRODUCTION
-- como padrao: o cadastro central do Master sempre permanece administrativo.
CREATE OR REPLACE FUNCTION public.portus_normalize_master_sector()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role = 'master' THEN
    NEW.sector_code := 'ADMIN';
    NEW.laboratory_profile := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portus_master_administrative_sector ON public.users;
CREATE TRIGGER portus_master_administrative_sector
BEFORE INSERT OR UPDATE OF role, sector_code, laboratory_profile ON public.users
FOR EACH ROW EXECUTE FUNCTION public.portus_normalize_master_sector();

COMMIT;
