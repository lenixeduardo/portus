BEGIN;

INSERT INTO applications (code, name)
VALUES ('PORTUS_LABORATORY', 'PORTUS Laboratório')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    active = TRUE;

INSERT INTO application_sector_permissions (
  application_id, sector_id, can_read, can_open, can_capture, can_move,
  can_confirm_production, can_confirm_laboratory
)
SELECT a.id, s.id, TRUE, FALSE, TRUE, FALSE, FALSE, TRUE
  FROM applications a
  JOIN sectors s ON s.code = 'LABORATORY'
 WHERE a.code = 'PORTUS_LABORATORY'
ON CONFLICT (application_id, sector_id) DO UPDATE SET
  can_read = TRUE,
  can_open = FALSE,
  can_capture = TRUE,
  can_move = FALSE,
  can_confirm_production = FALSE,
  can_confirm_laboratory = TRUE;

ALTER TABLE capture_sessions
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_capture_sessions_user
  ON capture_sessions(user_id);

COMMENT ON COLUMN capture_sessions.user_id IS
  'Usuário responsável por iniciar a sessão de captura.';

COMMIT;
