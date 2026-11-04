BEGIN;

-- Operadores já autorizados a capturar em seu setor de origem também podem
-- capturar em uma estação física do outro setor. A identificação da estação
-- define o setor registrado na sessão; o usuário continua como responsável.
-- Não amplia permissões de abertura, movimentação ou finalização de lotes.
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
SELECT operator.user_id, target_sector.id, TRUE
  FROM authorized_operators operator
  JOIN sectors target_sector ON target_sector.code IN ('PRODUCTION', 'LABORATORY')
ON CONFLICT (user_id, sector_id) DO UPDATE
SET can_capture = EXCLUDED.can_capture;

COMMIT;
