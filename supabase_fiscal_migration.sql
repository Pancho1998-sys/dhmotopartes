-- ==============================================================================
-- SCRIPT DE MIGRACIÓN: CONFIGURACIÓN FISCAL DE TIENDAS (ARCA / AFIP)
-- Ejecuta esto en el panel de SQL Editor de tu proyecto Supabase.
-- ==============================================================================

-- 1. Crear la tabla de configuración fiscal si no existe
CREATE TABLE IF NOT EXISTS public.store_fiscal_configs (
    store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    cuit TEXT NOT NULL,
    pos_number INTEGER NOT NULL,
    iva_condition TEXT NOT NULL, -- 'RI' (Responsable Inscripto), 'MT' (Monotributista), 'EX' (Exento)
    environment TEXT NOT NULL DEFAULT 'homologacion', -- 'homologacion' o 'produccion'
    certificate_text TEXT, -- Certificado X.509
    private_key_text TEXT, -- Clave privada
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Habilitar Row Level Security (RLS)
ALTER TABLE public.store_fiscal_configs ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas RLS para garantizar el aislamiento estricto por tienda (Multi-Tenant)

-- Política de Lectura (SELECT)
-- Permite que solo los administradores, superadministradores de la misma tienda, y saas_admin puedan leer la configuración fiscal.
DROP POLICY IF EXISTS "Permitir lectura de config fiscal" ON public.store_fiscal_configs;
CREATE POLICY "Permitir lectura de config fiscal" ON public.store_fiscal_configs 
    FOR SELECT TO authenticated 
    USING (
        store_id = public.get_my_store_id() AND public.get_my_role() IN ('admin', 'superadmin')
        OR public.get_my_role() = 'saas_admin'
    );

-- Política de Escritura (INSERT / UPDATE / DELETE)
-- Permite que solo los administradores, superadministradores de la misma tienda, y saas_admin puedan modificar la configuración fiscal.
DROP POLICY IF EXISTS "Permitir guardar config fiscal" ON public.store_fiscal_configs;
CREATE POLICY "Permitir guardar config fiscal" ON public.store_fiscal_configs 
    FOR ALL TO authenticated 
    USING (
        store_id = public.get_my_store_id() AND public.get_my_role() IN ('admin', 'superadmin')
        OR public.get_my_role() = 'saas_admin'
    )
    WITH CHECK (
        store_id = public.get_my_store_id() AND public.get_my_role() IN ('admin', 'superadmin')
        OR public.get_my_role() = 'saas_admin'
    );

-- 4. Habilitar la replicación en tiempo real (Opcional, pero recomendado)
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_fiscal_configs;
