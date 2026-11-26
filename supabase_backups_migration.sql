-- ==============================================================================
-- TABLA DE RESPALDOS DIARIOS AUTOMÁTICOS EN SUPABASE
-- Ejecuta este script una sola vez en el SQL Editor de Supabase para guardar
-- copias de seguridad diarias automáticas también en la nube.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.store_backups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    backup_date DATE NOT NULL,
    source TEXT NOT NULL DEFAULT 'nightly',
    products_count INTEGER NOT NULL DEFAULT 0,
    sales_count INTEGER NOT NULL DEFAULT 0,
    state JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT store_backups_store_date_unique UNIQUE (store_id, backup_date)
);

CREATE INDEX IF NOT EXISTS idx_store_backups_store_date
    ON public.store_backups (store_id, backup_date DESC);

ALTER TABLE public.store_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leer backups propios" ON public.store_backups;
CREATE POLICY "Leer backups propios"
    ON public.store_backups FOR SELECT TO authenticated
    USING (
        store_id = public.get_my_store_id()
        OR public.get_my_role() = 'saas_admin'
    );

DROP POLICY IF EXISTS "Insertar backups propios" ON public.store_backups;
CREATE POLICY "Insertar backups propios"
    ON public.store_backups FOR INSERT TO authenticated
    WITH CHECK (
        store_id = public.get_my_store_id()
        AND public.get_my_role() IN ('admin', 'superadmin', 'cajero')
    );

DROP POLICY IF EXISTS "Actualizar backups propios" ON public.store_backups;
CREATE POLICY "Actualizar backups propios"
    ON public.store_backups FOR UPDATE TO authenticated
    USING (
        store_id = public.get_my_store_id()
        AND public.get_my_role() IN ('admin', 'superadmin', 'cajero')
    );
