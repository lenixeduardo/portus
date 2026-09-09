BEGIN;

INSERT INTO applications (code, name)
VALUES
  ('PORTUS', 'PORTUS'),
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

COMMIT;
