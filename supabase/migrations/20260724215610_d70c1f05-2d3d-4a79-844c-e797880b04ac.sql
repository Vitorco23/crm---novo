
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.commercial_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('won_pattern','lost_pattern','objection_handled','niche_insight','sequence_insight')),
  title text NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(3072) NOT NULL,
  source_lead_id text,
  confidence real NOT NULL DEFAULT 0.7,
  usage_count integer NOT NULL DEFAULT 0,
  approved boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.commercial_memory TO authenticated;
GRANT ALL ON public.commercial_memory TO service_role;

ALTER TABLE public.commercial_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads commercial memory"
  ON public.commercial_memory FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

CREATE POLICY "Owner updates commercial memory"
  ON public.commercial_memory FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

CREATE POLICY "Owner deletes commercial memory"
  ON public.commercial_memory FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

CREATE INDEX commercial_memory_kind_idx ON public.commercial_memory(kind);
CREATE INDEX commercial_memory_created_at_idx ON public.commercial_memory(created_at DESC);
CREATE INDEX commercial_memory_metadata_idx ON public.commercial_memory USING gin(metadata);
CREATE INDEX commercial_memory_embedding_idx
  ON public.commercial_memory
  USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

CREATE OR REPLACE FUNCTION public.update_commercial_memory_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER commercial_memory_updated_at
  BEFORE UPDATE ON public.commercial_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_commercial_memory_updated_at();

CREATE OR REPLACE FUNCTION public.match_commercial_memory(
  query_embedding vector(3072),
  match_count int DEFAULT 5,
  filter_kind text DEFAULT NULL,
  filter_niche text DEFAULT NULL,
  min_similarity real DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  kind text,
  title text,
  content text,
  metadata jsonb,
  usage_count integer,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.kind,
    m.title,
    m.content,
    m.metadata,
    m.usage_count,
    (1 - (m.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)))::real AS similarity
  FROM public.commercial_memory m
  WHERE m.approved = true
    AND (filter_kind IS NULL OR m.kind = filter_kind)
    AND (filter_niche IS NULL OR (m.metadata ->> 'niche') = filter_niche)
    AND (1 - (m.embedding::halfvec(3072) <=> query_embedding::halfvec(3072))) >= min_similarity
  ORDER BY m.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_commercial_memory(vector, int, text, text, real) TO authenticated, service_role;
