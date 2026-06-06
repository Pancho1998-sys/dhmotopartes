-- ==============================================================================
-- SCRIPT DE INSTALACIÓN COMPLETA PARA DHMOTOPARTES (SaaS / Multi-Tenant)
-- Ejecuta esto en el panel de SQL Editor de tu proyecto Supabase.
-- Como es un proyecto nuevo, este script creará todo desde cero.
-- ==============================================================================

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
  INSERT INTO public.user_profiles (id, first_name, last_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
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
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'saas_admin')
);

-- Políticas para User Profiles
DROP POLICY IF EXISTS "Lectura de perfiles" ON public.user_profiles;
CREATE POLICY "Lectura de perfiles" ON public.user_profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Actualizacion de perfiles" ON public.user_profiles;
CREATE POLICY "Actualizacion de perfiles" ON public.user_profiles FOR UPDATE TO authenticated USING (
    id = auth.uid() OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('superadmin', 'saas_admin'))
);

-- Políticas para Store States (Estado de la aplicación)
DROP POLICY IF EXISTS "Leer state propio" ON public.store_states;
CREATE POLICY "Leer state propio" ON public.store_states FOR SELECT TO authenticated USING (
    store_id IN (SELECT store_id FROM public.user_profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Actualizar state propio" ON public.store_states;
CREATE POLICY "Actualizar state propio" ON public.store_states FOR UPDATE TO authenticated USING (
    store_id IN (SELECT store_id FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

DROP POLICY IF EXISTS "Insertar state propio" ON public.store_states;
CREATE POLICY "Insertar state propio" ON public.store_states FOR INSERT TO authenticated WITH CHECK (
    store_id IN (SELECT store_id FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

-- ==============================================================================
-- HABILITAR REALTIME (Para sincronización en vivo)
-- ==============================================================================
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_states;
