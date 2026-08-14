ALTER TABLE public.intel_messages ADD COLUMN IF NOT EXISTS observability jsonb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_messages TO authenticated;
GRANT ALL ON public.intel_messages TO service_role;
