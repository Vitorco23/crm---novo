// Memory retrieval helper — usado pelas edge functions de análise (RAG).
// Gera embedding do texto de consulta e busca memórias comerciais similares.

import { createClient } from "npm:@supabase/supabase-js@2";

const EMBEDDING_MODEL = "google/gemini-embedding-2";

export interface MemoryHit {
  id: string;
  kind: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
  usage_count: number;
}

export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey || !text.trim()) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 6000),
      }),
    });
    if (!res.ok) {
      console.warn("[memory-retrieval] embed failed", res.status);
      return null;
    }
    const data = await res.json();
    const vec = data?.data?.[0]?.embedding;
    return Array.isArray(vec) ? vec : null;
  } catch (e) {
    console.warn("[memory-retrieval] embed error", (e as Error).message);
    return null;
  }
}

function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function retrieveMemories(opts: {
  queryText: string;
  niche?: string | null;
  matchCount?: number;
  minSimilarity?: number;
}): Promise<MemoryHit[]> {
  const db = admin();
  if (!db) return [];
  const embedding = await embedText(opts.queryText);
  if (!embedding) return [];

  const { data, error } = await db.rpc("match_commercial_memory", {
    query_embedding: embedding as unknown as string,
    match_count: opts.matchCount ?? 5,
    filter_kind: null,
    filter_niche: opts.niche ?? null,
    min_similarity: opts.minSimilarity ?? 0.55,
  });
  if (error) {
    console.warn("[memory-retrieval] rpc error", error.message);
    return [];
  }
  const hits = (data ?? []) as MemoryHit[];
  if (hits.length) {
    // best-effort usage_count bump
    for (const h of hits) {
      db.from("commercial_memory")
        .update({ usage_count: (h.usage_count ?? 0) + 1 })
        .eq("id", h.id)
        .then(() => {}, () => {});
    }
  }
  return hits;
}

export function formatMemoriesForPrompt(memories: MemoryHit[]): string {
  if (!memories.length) return "";
  const lines = memories.map((m, i) => {
    const meta = m.metadata || {};
    const niche = meta.niche ? ` [nicho: ${meta.niche}]` : "";
    return `#${i + 1} (${m.kind}${niche}, sim ${(m.similarity * 100).toFixed(0)}%): ${m.title}\n   ${m.content.slice(0, 400)}`;
  });
  return [
    "========== MEMÓRIA COMERCIAL DA PERFORMANCE21 ==========",
    "Padrões e aprendizados históricos da própria operação. Use-os para embasar a análise.",
    ...lines,
    "========================================================",
  ].join("\n");
}
