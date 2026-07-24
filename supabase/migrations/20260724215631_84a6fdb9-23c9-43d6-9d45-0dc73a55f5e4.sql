
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
SECURITY INVOKER
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
