-- Idempotency key column for the Matteline webhook queue.
ALTER TABLE public.interactions_inbound
  ADD COLUMN IF NOT EXISTS call_id text;

-- Unique partial index prevents duplicate rows for the same call
-- when Matteline / n8n retries the webhook. NULLs are ignored so
-- legacy rows without call_id are untouched.
CREATE UNIQUE INDEX IF NOT EXISTS interactions_inbound_call_id_uniq
  ON public.interactions_inbound (call_id)
  WHERE call_id IS NOT NULL;