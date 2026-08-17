-- Habilita o Realtime para a tabela leads_inbound
ALTER TABLE public.leads_inbound REPLICA IDENTITY FULL;

-- Garante que o usuário autenticado tenha permissões necessárias para drenar a fila
GRANT SELECT, DELETE ON public.leads_inbound TO authenticated;
GRANT ALL ON public.leads_inbound TO service_role;
