-- O número do lote pode ser reutilizado por produtos diferentes.
-- A identidade operacional é (product_id, code), sem alterar IDs ou histórico.
BEGIN;

ALTER TABLE public.batches DROP CONSTRAINT IF EXISTS batches_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_batches_product_code
  ON public.batches (product_id, code);

COMMIT;
