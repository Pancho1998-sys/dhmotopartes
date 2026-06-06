-- ==============================================================================
-- PLAN DE MIGRACIÓN SAAS (Multi-Tenant) PARA DHMOTOPARTES
-- Ejecuta esto en el panel de SQL Editor de tu proyecto Supabase.
-- ==============================================================================

-- 1. Crear la tabla de Tiendas (Empresas)
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Modificar la tabla user_profiles para incluir el store_id
-- Si la tabla user_profiles ya existe, le agregamos la columna store_id
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

-- 3. Modificar la tabla app_state para usar store_id en lugar de id = 1
-- Vamos a crear una nueva tabla que reemplace a la original, para evitar conflictos de tipos.
CREATE TABLE IF NOT EXISTS public.store_states (
    store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Migrar los datos antiguos (si existen en app_state) a una tienda "Demo" inicial
-- a. Crear la tienda Demo
INSERT INTO public.stores (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Primera Tienda Demo')
ON CONFLICT DO NOTHING;

-- b. Migrar el estado
INSERT INTO public.store_states (store_id, state, updated_at)
SELECT '00000000-0000-0000-0000-000000000001', state, updated_at 
FROM public.app_state WHERE id = 1
ON CONFLICT (store_id) DO NOTHING;

-- Opcional: Eliminar la tabla vieja app_state luego de confirmar que la migración fue exitosa
-- DROP TABLE IF EXISTS public.app_state;

-- ==============================================================================
-- SEGURIDAD: ROW LEVEL SECURITY (RLS)
-- ==============================================================================

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_states ENABLE ROW LEVEL SECURITY;

-- Políticas para Stores (Tiendas)
-- Todos pueden ver las tiendas (o podrías restringirlo solo a saas_admin)
-- Por ahora permitimos lectura para que el app.js pueda listar el nombre de la tienda
CREATE POLICY "Permitir lectura de stores" ON public.stores FOR SELECT USING (true);
CREATE POLICY "Permitir insercion de stores a saas_admin" ON public.stores FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'saas_admin')
);

-- Políticas para Store States (Estado de la aplicación)
-- Solo puedes leer el estado si el store_id coincide con el store_id de tu perfil
CREATE POLICY "Leer state propio" ON public.store_states FOR SELECT USING (
    store_id IN (SELECT store_id FROM public.user_profiles WHERE id = auth.uid())
);

-- Solo puedes actualizar el estado si el store_id coincide con tu perfil y eres admin o superadmin
CREATE POLICY "Actualizar state propio" ON public.store_states FOR UPDATE USING (
    store_id IN (SELECT store_id FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

-- Solo saas_admin puede insertar un nuevo estado (cuando crea una tienda nueva)
CREATE POLICY "Insertar state saas_admin" ON public.store_states FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'saas_admin')
);

-- ==============================================================================
-- VISTAS O FUNCIONES ÚTILES PARA REALTIME
-- ==============================================================================
-- Debes habilitar REALTIME en la tabla store_states:
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_states;
