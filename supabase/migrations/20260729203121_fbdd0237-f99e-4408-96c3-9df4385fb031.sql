CREATE TABLE public.ai_execution_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  conversation_id uuid,
  lead_id text,
  execution_id uuid NOT NULL,
  specialist text,
  task text NOT NULL,
  prompt_id text,
  prompt_version text,
  model text,
  status text NOT NULL,
  latency_ms integer NOT NULL DEFAULT 0,
  input_chars integer,
  output_chars integer,
  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric,
  sources text[] NOT NULL DEFAULT '{}'::text[],
  tools_used text[] NOT NULL DEFAULT '{}'::text[],
  error_code text
);

GRANT SELECT, INSERT ON public.ai_execution_events TO authenticated;
GRANT ALL ON public.ai_execution_events TO service_role;

ALTER TABLE public.ai_execution_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own ai events"
  ON public.ai_execution_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own ai events"
  ON public.ai_execution_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX ai_execution_events_user_created_idx
  ON public.ai_execution_events (user_id, created_at DESC);

CREATE INDEX ai_execution_events_task_idx
  ON public.ai_execution_events (task, created_at DESC);