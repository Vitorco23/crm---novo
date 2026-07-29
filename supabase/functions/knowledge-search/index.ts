// knowledge-search — embed da pergunta + top-K chunks para o Mentor P21.

import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser } from "../_shared/require-auth.ts";
import { sanitizeExternal } from "../_shared/untrusted-input.ts";
import {
  clampMatchCount,
  clampSimilarity,
  normalizeCategory,
} from "../_shared/ai-core/knowledge-governance.ts";
import { startAIExecution } from "../_shared/ai-core/observability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMBEDDING_MODEL = "openai/text-embedding-3-small";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  const telemetry = startAIExecution({
    task: "knowledge_search",
    userId: auth.userId,
    authHeader: req.headers.get("Authorization") ?? req.headers.get("authorization"),
    sources: ["knowledge"],
    toolsUsed: ["knowledge.search"],
  });

  try {
    const { query, matchCount = 6, minSimilarity = 0.35, categoria = null } =
      (await req.json().catch(() => ({}))) as {
        query?: string; matchCount?: number; minSimilarity?: number; categoria?: string | null;
      };
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query_required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const safeQuery = sanitizeExternal(query, 2000);
    const embRes = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: safeQuery }),
    });
    if (!embRes.ok) {
      const body = await embRes.text().catch(() => "");
      throw new Error(`embedding_${embRes.status}: ${body.slice(0, 200)}`);
    }
    const embData = await embRes.json();
    const queryEmbedding = embData?.data?.[0]?.embedding as number[];

    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization")!;
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );

    const { data, error } = await sb.rpc("match_knowledge_chunks", {
      query_embedding: queryEmbedding,
      match_count: clampMatchCount(matchCount),
      min_similarity: clampSimilarity(minSimilarity),
      filter_categoria: normalizeCategory(categoria),
    });
    if (error) throw new Error(error.message);

    await telemetry.success({
      model: EMBEDDING_MODEL,
      inputChars: safeQuery.length,
      outputChars: null,
    });

    return new Response(JSON.stringify({ chunks: data ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(JSON.stringify({ evt: "kb_search_error", msg: (e as Error).message }));
    await telemetry.failure(e);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
