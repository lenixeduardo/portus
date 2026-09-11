BEGIN;

-- Catálogo inicial de equipamentos reconhecidos pelo PORTUS.
-- A configuração física (porta COM, baud rate, protocolo e parsing) pertence
-- a cada estação e permanece no banco/configuração local do aplicativo.
INSERT INTO equipments (code, name, enabled)
VALUES
  ('ESPECTROFOTOMETRO', 'Espectrofotômetro', TRUE),
  ('BALANCA',           'Balança',           TRUE),
  ('VISCOSIMETRO',      'Viscosímetro',      TRUE),
  ('PH_METRO',          'pH-metro',          TRUE),
  ('REFRATOMETRO',      'Refratômetro',      TRUE),
  ('RESERVA',           'RESERVA',           TRUE)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    enabled = TRUE;

COMMIT;
