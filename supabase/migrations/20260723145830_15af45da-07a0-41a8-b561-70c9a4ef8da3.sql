CREATE TABLE public.leads_inbound (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dados JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.leads_inbound TO authenticated;
GRANT ALL ON public.leads_inbound TO service_role;
ALTER TABLE public.leads_inbound ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read inbound leads"
  ON public.leads_inbound FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete inbound leads"
  ON public.leads_inbound FOR DELETE TO authenticated USING (true);
CREATE INDEX idx_leads_inbound_created_at ON public.leads_inbound(created_at);