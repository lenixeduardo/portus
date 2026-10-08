-- Conta Master de DESENVOLVIMENTO. Executar somente sob -SeedDevAdmin
-- em um PostgreSQL local isolado. Nunca aplicar como migration de produção.
-- bcrypt custo 12: senha intencional de desenvolvimento 'admin'.
-- Apenas CRIA se o login ainda não existir; não altera contas preexistentes.
BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('portus:development-admin', 0));

WITH new_admin AS (
  INSERT INTO public.users
    (username, password_hash, display_name, role, sector_code, active)
  SELECT
    'admin',
    '$2b$12$Hlt6Ovi0lL0vi1nmeBGRKeb3XtQw5NIUPWWDKsZBdy0j9qjUzP1v2',
    'Administrador (desenvolvimento)',
    'master',
    'PRODUCTION',
    TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM public.users WHERE lower(username) = 'admin'
  )
  ON CONFLICT (username) DO NOTHING
  RETURNING id
)
INSERT INTO public.user_sector_permissions
  (user_id, sector_id, can_read, can_open, can_capture, can_move,
   can_confirm_production, can_confirm_laboratory)
SELECT
  a.id, s.id, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE
FROM new_admin a
JOIN public.sectors s ON s.code IN ('PRODUCTION', 'LABORATORY')
ON CONFLICT (user_id, sector_id) DO NOTHING;

COMMIT;
