-- ==============================================================================
-- CATÁLOGO PÚBLICO v2 (get_public_catalog)
-- Ejecutar UNA vez en el SQL Editor de Supabase. Reemplaza la función existente.
--
-- Cambios respecto a la versión anterior:
--   1. Devuelve también "openingHours" (Horario de Atención) y "storeHolder"
--      (Titular de la cuenta) para que la página web los muestre.
--   2. Ya NO expone el costo de compra ("cost") de los productos a la web pública.
--   3. Los productos siguen incluyendo "variants" (talles/colores con stock),
--      que se guardan dentro del JSON de productos; no requiere cambios de tablas.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_public_catalog(target_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  filtered_products JSONB;
  categories JSONB;
  public_settings JSONB;
BEGIN
  -- Productos no fraccionables, sin el costo de compra
  SELECT COALESCE(
    (
      SELECT jsonb_agg(elem - 'cost')
      FROM jsonb_array_elements(COALESCE(state->'products', '[]'::jsonb)) AS elem
      WHERE COALESCE((elem->>'isFractional')::boolean, false) = false
    ),
    '[]'::jsonb
  ) INTO filtered_products
  FROM public.store_states
  WHERE store_id = target_store_id;

  SELECT COALESCE(state->'settings'->'categories', '[]'::jsonb) INTO categories
  FROM public.store_states
  WHERE store_id = target_store_id;

  SELECT jsonb_build_object(
      'storeName', COALESCE(state->'settings'->>'storeName', 'DH Motopartes'),
      'storeAddress', COALESCE(state->'settings'->>'storeAddress', ''),
      'storePhone', COALESCE(state->'settings'->>'storePhone', ''),
      'openingHours', COALESCE(state->'settings'->>'openingHours', ''),
      'storeAlias', COALESCE(state->'settings'->>'storeAlias', ''),
      'storeHolder', COALESCE(state->'settings'->>'storeHolder', ''),
      'currency', COALESCE(state->'settings'->>'currency', '$'),
      'logo', COALESCE(state->'settings'->>'logo', ''),
      'whatsapp', COALESCE(state->'settings'->>'whatsapp', ''),
      'instagram', COALESCE(state->'settings'->>'instagram', ''),
      'brandDescription', COALESCE(state->'settings'->>'brandDescription', '')
    ) INTO public_settings
  FROM public.store_states
  WHERE store_id = target_store_id;

  IF public_settings IS NULL THEN
    public_settings := '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'products', COALESCE(filtered_products, '[]'::jsonb),
    'categories', COALESCE(categories, '[]'::jsonb),
    'settings', COALESCE(public_settings, '{}'::jsonb)
  );
END;
$$;
