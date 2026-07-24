CREATE TABLE public.ai_router_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  task TEXT NOT NULL,
  model TEXT NOT NULL,
  attempt_index INTEGER NOT NULL DEFAULT 0,
  input_chars INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL,
  error_type TEXT,
  fallback_reason TEXT
);

GRANT ALL ON public.ai_router_logs TO service_role;

ALTER TABLE public.ai_router_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON public.ai_router_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX ai_router_logs_task_created_idx ON public.ai_router_logs (task, created_at DESC);