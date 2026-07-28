CREATE TABLE public.interactions_inbound (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dados JSONB NOT NULL,
  phone_normalized TEXT,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.interactions_inbound TO authenticated;
GRANT ALL ON public.interactions_inbound TO service_role;

ALTER TABLE public.interactions_inbound ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read interactions inbound"
  ON public.interactions_inbound FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

CREATE POLICY "Owner can update interactions inbound"
  ON public.interactions_inbound FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

CREATE POLICY "Owner can delete interactions inbound"
  ON public.interactions_inbound FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

CREATE INDEX idx_interactions_inbound_processed_created
  ON public.interactions_inbound (processed, created_at DESC);

CREATE INDEX idx_interactions_inbound_phone
  ON public.interactions_inbound (phone_normalized);