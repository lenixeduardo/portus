BEGIN;

INSERT INTO applications (code, name)
VALUES
  ('PORTUS', 'PORTUS'),
  ('PORTUS_LABORATORY', 'PORTUS Laboratório'),
  ('SOFTWARE_B', 'Software B')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    active = TRUE;

INSERT INTO sectors (code, name)
VALUES
  ('PRODUCTION', 'Produção'),
  ('LABORATORY', 'Laboratório')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    active = TRUE;


-- Permissões de ambas as aplicações para a leitura compartilhada do lote.
INSERT INTO application_sector_permissions
  (application_id,sector_id,can_read,can_open,can_capture,can_move,
   can_confirm_production,can_confirm_laboratory)
SELECT a.id,s.id,TRUE,
       (a.code='PORTUS' AND s.code='PRODUCTION') OR
       (a.code='PORTUS_LABORATORY' AND s.code='LABORATORY'),
       (a.code='PORTUS' AND s.code='PRODUCTION') OR
       (a.code='PORTUS_LABORATORY' AND s.code='LABORATORY'),
       a.code='PORTUS' AND s.code='PRODUCTION',
       FALSE,FALSE
FROM applications a CROSS JOIN sectors s
WHERE a.code IN ('PORTUS','PORTUS_LABORATORY')
  AND s.code IN ('PRODUCTION','LABORATORY')
ON CONFLICT(application_id,sector_id) DO UPDATE SET
 can_read=EXCLUDED.can_read,
 can_open=EXCLUDED.can_open,
 can_capture=EXCLUDED.can_capture,
 can_move=EXCLUDED.can_move;

COMMIT;
