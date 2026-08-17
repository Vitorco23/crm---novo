-- Lovable Cloud uses a managed publication for Realtime.
-- We must ensure the table is added to it.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'leads_inbound'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.leads_inbound;
    END IF;
END $$;