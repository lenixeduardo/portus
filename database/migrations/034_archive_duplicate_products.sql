BEGIN;

CREATE OR REPLACE FUNCTION public.portus_delete_product(
  p_product_id BIGINT,
  p_actor_username TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_prefix TEXT;
BEGIN
  IF NOT EXISTS (SELECT FROM public.users WHERE username = p_actor_username AND active) THEN
    RAISE EXCEPTION 'Usuário não autorizado a excluir produtos' USING ERRCODE = '42501';
  END IF;

  -- Serialize archival and catalog writes so that two duplicates cannot each
  -- rely on the other remaining active.
  LOCK TABLE public.products IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT FROM public.products WHERE id = p_product_id AND active) THEN
    RAISE EXCEPTION 'Produto não encontrado ou já desativado' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT FROM public.batches WHERE product_id = p_product_id) THEN
    FOR v_prefix IN
      SELECT DISTINCT left(regexp_replace(value, '[^0-9]', '', 'g'), 12)
      FROM public.products AS product
      CROSS JOIN LATERAL (VALUES (product.description), (product.name)) AS field(value)
      WHERE product.id = p_product_id AND length(regexp_replace(value, '[^0-9]', '', 'g')) >= 12
    LOOP
      PERFORM 1 FROM public.products AS peer
      WHERE peer.id <> p_product_id AND peer.active
        AND (left(regexp_replace(peer.description, '[^0-9]', '', 'g'), 12) = v_prefix
          OR left(regexp_replace(peer.name, '[^0-9]', '', 'g'), 12) = v_prefix)
      FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto com histórico de lotes não pode ser excluído' USING ERRCODE = '23503';
      END IF;
    END LOOP;
    IF v_prefix IS NULL THEN
      RAISE EXCEPTION 'Produto com histórico de lotes não pode ser excluído' USING ERRCODE = '23503';
    END IF;
  END IF;

  UPDATE public.products SET active = FALSE WHERE id = p_product_id AND active;
  RETURN TRUE;
END;
$$;

COMMIT;
