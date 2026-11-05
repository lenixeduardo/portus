BEGIN;

-- Reconcilia a matriz de captura no PostgreSQL central. O setor de captura
-- pertence à estação física, mas só operadores que já tinham can_capture
-- em seu setor de origem recebem captura no outro setor.
-- Não altera leitura, abertura, movimentação ou finalização de lotes.
WITH authorized_operators AS (
  SELECT u.id AS user_id
    FROM users u
    JOIN sectors original_sector ON original_sector.code = u.sector_code
    JOIN user_sector_permissions original_permission
      ON original_permission.user_id = u.id
     AND original_permission.sector_id = original_sector.id
   WHERE u.active = TRUE
     AND u.role IN ('operator', 'laboratory')
     AND u.sector_code IN ('PRODUCTION', 'LABORATORY')
     AND original_permission.can_capture = TRUE
)
INSERT INTO user_sector_permissions (user_id, sector_id, can_capture)
SELECT authorized_operators.user_id, target_sector.id, TRUE
  FROM authorized_operators
  JOIN sectors target_sector ON target_sector.code IN ('PRODUCTION', 'LABORATORY') AND target_sector.active
ON CONFLICT (user_id, sector_id) DO UPDATE
SET can_capture = TRUE;

-- O contexto operacional é resolvido pelo setor da máquina. Repara somente
-- o par aplicação/setor correspondente à estação, sem abrir ações extras.
INSERT INTO application_sector_permissions (application_id, sector_id, can_capture)
SELECT a.id, s.id, TRUE
  FROM applications a
  JOIN sectors s ON
       (a.code = 'PORTUS' AND s.code = 'PRODUCTION')
    OR (a.code = 'PORTUS_LABORATORY' AND s.code = 'LABORATORY')
 WHERE a.active = TRUE AND s.active = TRUE
ON CONFLICT (application_id, sector_id) DO UPDATE
SET can_capture = TRUE;

COMMIT;
