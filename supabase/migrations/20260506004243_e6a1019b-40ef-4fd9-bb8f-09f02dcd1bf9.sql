CREATE TABLE public.user_storage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE public.user_storage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own storage" ON public.user_storage
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own storage" ON public.user_storage
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own storage" ON public.user_storage
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own storage" ON public.user_storage
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX user_storage_user_idx ON public.user_storage(user_id);