-- ==============================================================================
-- SCRIPT DE INSTALACIÓN COMPLETA PARA DHMOTOPARTES (SaaS / Multi-Tenant)
-- Ejecuta esto en el panel de SQL Editor de tu proyecto Supabase.
-- Como es un proyecto nuevo, este script creará todo desde cero.
-- ==============================================================================

-- 0. LIMPIEZA DE TABLAS ANTERIORES (Para evitar errores de esquemas viejos)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TABLE IF EXISTS public.store_states CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP TABLE IF EXISTS public.stores CASCADE;
DROP TABLE IF EXISTS public.app_state CASCADE;

-- 1. Crear la tabla de Tiendas (Empresas)
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Crear la tabla user_profiles (Perfiles de usuario)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    dni TEXT,
    role TEXT DEFAULT 'usuario'::text NOT NULL,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Crear la tabla store_states (Para guardar el JSON de cada tienda)
CREATE TABLE IF NOT EXISTS public.store_states (
    store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- TRIGGER PARA CREAR PERFIL AUTOMÁTICAMENTE CUANDO ALGUIEN SE REGISTRA
-- ==============================================================================
-- Esta función captura los registros de Firebase/Supabase Auth y crea su perfil en la base de datos
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, first_name, last_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email,
    CASE 
      WHEN NEW.email = 'francisco.r.s.w.98@gmail.com' THEN 'saas_admin'
      ELSE 'usuario'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar el trigger si ya existía para evitar errores
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Crear el trigger para que escuche a la tabla auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==============================================================================
-- SEGURIDAD: ROW LEVEL SECURITY (RLS)
-- ==============================================================================

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_states ENABLE ROW LEVEL SECURITY;

-- Políticas para Stores (Tiendas)
DROP POLICY IF EXISTS "Permitir lectura de stores" ON public.stores;
CREATE POLICY "Permitir lectura de stores" ON public.stores FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir insercion de stores a saas_admin" ON public.stores;
CREATE POLICY "Permitir insercion de stores a saas_admin" ON public.stores FOR INSERT TO authenticated WITH CHECK (
    public.get_my_role() = 'saas_admin'
);

-- Funciones auxiliares para seguridad y RLS
CREATE OR REPLACE FUNCTION public.get_my_store_id()
RETURNS UUID AS $$
  SELECT store_id FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Trigger para evitar la escalada de privilegios y saltos de tienda (cross-tenant)
CREATE OR REPLACE FUNCTION public.check_user_profile_update()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT;
  caller_store UUID;
BEGIN
  -- Si es una modificación directa en la base de datos (SQL Editor, Table Editor, Dashboard)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obtener el rol y tienda del usuario que está ejecutando la acción (auth.uid())
  SELECT role, store_id INTO caller_role, caller_store
  FROM public.user_profiles
  WHERE id = auth.uid();

  -- Si intentan cambiar el rol o el store_id
  IF (NEW.role IS DISTINCT FROM OLD.role) OR (NEW.store_id IS DISTINCT FROM OLD.store_id) THEN
    -- 1. Si es saas_admin, se permite cualquier cambio
    IF caller_role = 'saas_admin' THEN
      RETURN NEW;
    END IF;

    -- 2. Si es superadmin de la misma tienda:
    --    - Solo puede cambiar roles dentro de su propia tienda
    --    - No puede cambiar el store_id de nadie
    --    - No puede asignar roles 'saas_admin' ni 'superadmin'
    IF caller_role = 'superadmin' 
       AND OLD.store_id = caller_store 
       AND NEW.store_id = OLD.store_id 
       AND NEW.role NOT IN ('saas_admin', 'superadmin') THEN
      RETURN NEW;
    END IF;

    -- Si no cumple ninguna de las anteriores, rechazar la actualización
    RAISE EXCEPTION 'No tienes privilegios para modificar el rol o la tienda de este perfil.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS check_profiles_before_update ON public.user_profiles;
CREATE TRIGGER check_profiles_before_update
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE PROCEDURE public.check_user_profile_update();

-- Políticas para User Profiles
DROP POLICY IF EXISTS "Lectura de perfiles" ON public.user_profiles;
CREATE POLICY "Lectura de perfiles" ON public.user_profiles FOR SELECT TO authenticated USING (
    id = auth.uid()
    OR store_id = public.get_my_store_id()
    OR public.get_my_role() = 'saas_admin'
);

DROP POLICY IF EXISTS "Actualizacion de perfiles" ON public.user_profiles;
CREATE POLICY "Actualizacion de perfiles" ON public.user_profiles FOR UPDATE TO authenticated USING (
    id = auth.uid() OR public.get_my_role() IN ('superadmin', 'saas_admin')
);

-- Políticas para Store States (Estado de la aplicación)
DROP POLICY IF EXISTS "Leer state propio" ON public.store_states;
CREATE POLICY "Leer state propio" ON public.store_states FOR SELECT TO authenticated USING (
    store_id = public.get_my_store_id()
    OR public.get_my_role() = 'saas_admin'
);

DROP POLICY IF EXISTS "Actualizar state propio" ON public.store_states;
CREATE POLICY "Actualizar state propio" ON public.store_states FOR UPDATE TO authenticated USING (
    store_id = public.get_my_store_id() AND public.get_my_role() IN ('admin', 'superadmin', 'cajero')
);

DROP POLICY IF EXISTS "Insertar state propio" ON public.store_states;
CREATE POLICY "Insertar state propio" ON public.store_states FOR INSERT TO authenticated WITH CHECK (
    store_id = public.get_my_store_id() AND public.get_my_role() IN ('admin', 'superadmin', 'cajero')
);

-- ==============================================================================
-- HABILITAR REALTIME (Para sincronización en vivo)
-- ==============================================================================
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_states;

-- ==============================================================================
-- FUNCIÓN PÚBLICA PARA CATÁLOGO (RPC)
-- ==============================================================================
-- Esta función permite a la web pública leer únicamente los productos (catálogo)
-- sin exponer las ventas ni los datos de clientes que están en el mismo JSON.

CREATE OR REPLACE FUNCTION public.get_public_catalog(target_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Extraemos el arreglo de 'products' y 'categories' del JSON de estado
  SELECT jsonb_build_object(
    'products', COALESCE(state->'products', '[]'::jsonb),
    'categories', COALESCE(state->'settings'->'categories', '[]'::jsonb)
  ) INTO result
  FROM public.store_states
  WHERE store_id = target_store_id;

  -- Si no existe o es nulo, devolvemos un objeto por defecto
  RETURN COALESCE(result, '{"products":[], "categories":[]}'::jsonb);
END;
$$;
