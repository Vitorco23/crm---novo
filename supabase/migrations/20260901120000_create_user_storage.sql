-- user_storage: fonte de verdade de TODOS os dados do CRM (leads, pipeline,
-- tarefas, reunioes, metas, etc. - tudo salvo como JSON por chave/usuario).
-- Esta tabela nunca existiu como migration no repositorio: era provisionada
-- automaticamente pelo recurso "Cloud Sync" do Lovable, fora de qualquer
-- controle de versao. Recriada aqui a partir do uso real em
-- src/shared/services/userStorage.ts para permitir migrar para um projeto
-- Supabase proprio.

CREATE TABLE public.user_storage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE public.user_storage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage only their own storage"
ON public.user_storage
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.user_storage TO authenticated;
