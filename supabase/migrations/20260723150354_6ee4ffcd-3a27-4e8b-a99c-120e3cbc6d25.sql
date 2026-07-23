DROP POLICY IF EXISTS "Owner can read inbound leads" ON public.leads_inbound;
DROP POLICY IF EXISTS "Owner can delete inbound leads" ON public.leads_inbound;

CREATE POLICY "Owner can read inbound leads"
ON public.leads_inbound
FOR SELECT
TO authenticated
USING ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

CREATE POLICY "Owner can delete inbound leads"
ON public.leads_inbound
FOR DELETE
TO authenticated
USING ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');