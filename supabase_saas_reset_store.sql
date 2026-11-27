-- ==============================================================================
-- LIMPIEZA TOTAL DE TIENDA: SOLO ADMINISTRADOR SAAS
-- Ejecutar UNA vez en el SQL Editor de Supabase (se puede volver a ejecutar sin problema).
--
-- 1. Tabla store_reset_backups: copia completa del estado de la tienda antes de
--    cada limpieza (solo la ve el Administrador SaaS).
-- 2. Función saas_reset_store(target_store_id): vacía productos, ventas,
--    clientes y carrito de una tienda. Verifica en el SERVIDOR que quien la
--    llama sea saas_admin; cualquier otro rango recibe un error.
-- 3. Trigger guard_store_state_wipe: rechaza cualquier guardado que deje una
--    tienda con datos totalmente vacía si no lo hace un saas_admin
--    (protege aunque alguien intente saltarse la interfaz).
-- ==============================================================================

-- Cantidad de elementos de un arreglo JSON (0 si no es arreglo)
CREATE OR REPLACE FUNCTION public.jsonb_array_count(j JSONB)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN jsonb_typeof(j) = 'array' THEN jsonb_array_length(j) ELSE 0 END;
$$;

-- ------------------------------------------------------------------------------
-- 1. Respaldos previos a la limpieza
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_reset_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    reset_by UUID,
    products_count INTEGER NOT NULL DEFAULT 0,
    sales_count INTEGER NOT NULL DEFAULT 0,
    customers_count INTEGER NOT NULL DEFAULT 0,
    state JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_store_reset_backups_store
    ON public.store_reset_backups (store_id, created_at DESC);

ALTER TABLE public.store_reset_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo saas_admin lee respaldos de limpieza" ON public.store_reset_backups;
CREATE POLICY "Solo saas_admin lee respaldos de limpieza"
    ON public.store_reset_backups FOR SELECT TO authenticated
    USING (public.get_my_role() = 'saas_admin');
-- Sin políticas de INSERT/UPDATE/DELETE: solo la función (SECURITY DEFINER) escribe aquí.

-- ------------------------------------------------------------------------------
-- 2. Función de limpieza total (solo saas_admin)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.saas_reset_store(target_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_state JSONB;
  backup_id UUID;
  n_products INTEGER;
  n_sales INTEGER;
  n_customers INTEGER;
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'saas_admin' THEN
    RAISE EXCEPTION 'Solo el Administrador SaaS puede ejecutar la limpieza total del sistema.'
      USING ERRCODE = '42501';
  END IF;

  SELECT state INTO current_state
  FROM public.store_states
  WHERE store_id = target_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La tienda % no tiene datos guardados.', target_store_id;
  END IF;

  n_products  := public.jsonb_array_count(current_state->'products');
  n_sales     := public.jsonb_array_count(current_state->'sales');
  n_customers := public.jsonb_array_count(current_state->'customers');

  INSERT INTO public.store_reset_backups (store_id, reset_by, products_count, sales_count, customers_count, state)
  VALUES (target_store_id, auth.uid(), n_products, n_sales, n_customers, current_state)
  RETURNING id INTO backup_id;

  -- Mismo alcance que tenía el botón: productos, ventas, clientes y carrito.
  -- Se conservan configuración, caja, proveedores y demás datos.
  UPDATE public.store_states
  SET state = current_state
                || jsonb_build_object(
                     'products', '[]'::jsonb,
                     'sales', '[]'::jsonb,
                     'customers', '[]'::jsonb,
                     'cart', '[]'::jsonb
                   ),
      updated_at = timezone('utc'::text, now())
  WHERE store_id = target_store_id;

  RETURN jsonb_build_object(
    'backup_id', backup_id,
    'products', n_products,
    'sales', n_sales,
    'customers', n_customers
  );
END;
$$;

REVOKE ALL ON FUNCTION public.saas_reset_store(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.saas_reset_store(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.saas_reset_store(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. Guardia: nadie que no sea saas_admin puede dejar una tienda totalmente vacía
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_store_state_wipe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_total INTEGER;
  new_total INTEGER;
BEGIN
  -- Mantenimiento desde el SQL Editor / service role (sin usuario logueado): permitido
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  old_total := public.jsonb_array_count(OLD.state->'products')
             + public.jsonb_array_count(OLD.state->'sales')
             + public.jsonb_array_count(OLD.state->'customers');
  new_total := public.jsonb_array_count(NEW.state->'products')
             + public.jsonb_array_count(NEW.state->'sales')
             + public.jsonb_array_count(NEW.state->'customers');

  IF old_total > 0 AND new_total = 0 AND public.get_my_role() IS DISTINCT FROM 'saas_admin' THEN
    RAISE EXCEPTION 'Limpieza total bloqueada: solo el Administrador SaaS puede vaciar los datos de una tienda.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_store_state_wipe ON public.store_states;
CREATE TRIGGER guard_store_state_wipe
  BEFORE UPDATE ON public.store_states
  FOR EACH ROW EXECUTE FUNCTION public.guard_store_state_wipe();
