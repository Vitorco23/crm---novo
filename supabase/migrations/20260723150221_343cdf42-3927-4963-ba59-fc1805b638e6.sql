DROP POLICY IF EXISTS "Authenticated users can read inbound leads" ON public.leads_inbound;
DROP POLICY IF EXISTS "Authenticated users can delete inbound leads" ON public.leads_inbound;

CREATE POLICY "Owner can read inbound leads"
ON public.leads_inbound
FOR SELECT
TO authenticated
USING ((auth.jwt() ->> 'email') = 'vitor@performance21.com.br');

CREATE POLICY "Owner can delete inbound leads"
ON public.leads_inbound
FOR DELETE
TO authenticated
USING ((auth.jwt() ->> 'email') = 'vitor@performance21.com.br');