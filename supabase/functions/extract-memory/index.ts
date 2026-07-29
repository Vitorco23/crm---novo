// extract-memory — recebe um evento comercial e persiste uma memória estruturada.
// Chamado a partir do client (fire-and-forget) após Ganho / Perdido / análise com objeção.
//
// Body: {
//   kind: 'won_pattern'|'lost_pattern'|'objection_handled'|'niche_insight'|'sequence_insight',
//   context: string,           // texto livre com todo o contexto (lead + histórico + resumos)
//   leadId?: string,
//   metadata?: Record<string, unknown>  // niche, city, serviceType, stage, contractValue, outcome
// }
//
// Retorna: { inserted: boolean, memoryId?: string, reason?: string }

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-router.ts";
import { embedText } from "../_shared/memory-retrieval.ts";
import { requireUser } from "../_shared/require-auth.ts";
import {
  UNTRUSTED_INPUT_SYSTEM_CLAUSE,
  wrapUntrusted,
  sanitizeExternal,
  assertSafeAIOutput,
  UnsafeAIOutputError,
} from "../_shared/untrusted-input.ts";


const JSON_TAIL = `\nExtras opcionais: pode incluir "motivo" (string curta), "objecoes" (array), "argumentos" (array). Use somente informações reais do contexto.`;

const SYSTEM_PROMPTS: Record<string, string> = {
  won_pattern: `Você é o Curador de Memória Comercial da Performance21.
A partir do contexto de um Lead que fechou contrato, extraia o padrão de vitória em JSON.
CAMPOS: { "title": string curto (<80 chars), "content": 2-4 frases descrevendo o padrão (nicho, ticket, nº tentativas, objeções vencidas, tempo de ciclo, o que funcionou), "confidence": 0-1, "motivo"?: string, "objecoes"?: string[], "argumentos"?: string[] }
Sem markdown, sem preâmbulo. JSON puro.${JSON_TAIL}`,
  lost_pattern: `Você é o Curador de Memória Comercial da Performance21.
Extraia o padrão de perda deste Lead em JSON.
CAMPOS: { "title": string curto (<80 chars), "content": 2-4 frases (motivo, sinais precoces, etapa em que travou, o que evitar), "confidence": 0-1, "motivo"?: string, "objecoes"?: string[], "argumentos"?: string[] }
Sem markdown. JSON puro.${JSON_TAIL}`,
  objection_handled: `Você é o Curador de Memória Comercial da Performance21.
Extraia UMA objeção real do cliente e o argumento que funcionou em JSON.
CAMPOS: { "title": string curto (<80 chars, formato "Objeção X → Argumento Y"), "content": 2-3 frases descrevendo objeção + argumento + resultado, "confidence": 0-1, "objecoes"?: string[], "argumentos"?: string[] }
Se não houver objeção clara, retorne { "skip": true }. JSON puro.`,
  niche_insight: `Você é o Curador de Memória Comercial da Performance21.
Extraia um insight consolidado sobre este nicho em JSON.
CAMPOS: { "title": string curto (<80 chars), "content": 2-4 frases (conversão típica, cadência ideal, argumentos vencedores, sazonalidade), "confidence": 0-1, "objecoes"?: string[], "argumentos"?: string[] }
JSON puro.`,
  sequence_insight: `Você é o Curador de Memória Comercial da Performance21.
Extraia um insight sobre sequência/cadência em JSON.
CAMPOS: { "title": string curto (<80 chars), "content": 2-4 frases sobre o padrão de sequência que funcionou, "confidence": 0-1 }
JSON puro.`,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;
  try {
    const { kind, context, leadId, metadata } = await req.json();
    if (!kind || !context || typeof context !== "string") {
      return new Response(JSON.stringify({ error: "kind and context are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const system = SYSTEM_PROMPTS[kind as string];
    if (!system) {
      return new Response(JSON.stringify({ error: `unknown kind: ${kind}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("supabase env missing");
    const db = createClient(url, key, { auth: { persistSession: false } });

    // 1) Extract structured memory
    const contextSafe = sanitizeExternal(context, 6000);
    const metadataSafe = sanitizeExternal(JSON.stringify(metadata || {}), 2000);
    const userPrompt =
      wrapUntrusted(contextSafe, { maxChars: 6000, label: "CONTEXTO DO LEAD" }) +
      "\n\n" +
      wrapUntrusted(metadataSafe, { maxChars: 2000, label: "METADATA" }) +
      "\n\nRetorne o JSON solicitado.";

    let ai;
    try {
      ai = await callAI({
        task: "extract_memory",
        system: system + "\n\n" + UNTRUSTED_INPUT_SYSTEM_CLAUSE,
        user: userPrompt,
        json: true,
        temperature: 0.2,
        maxTokens: 512,
      });
    } catch (e) {
      console.error(JSON.stringify({ evt: "extract_memory_ai_failed", msg: (e as Error).message }));
      return new Response(JSON.stringify({ inserted: false, reason: "ai_failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    let parsed: {
      title?: string; content?: string; confidence?: number; skip?: boolean;
      motivo?: string; objecoes?: string[]; argumentos?: string[];
    };
    try {
      parsed = JSON.parse(ai.content);
    } catch {
      const m = ai.content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }
    if (parsed?.skip || !parsed?.title || !parsed?.content) {
      return new Response(JSON.stringify({ inserted: false, reason: "no_signal" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Anti-injection guard on AI-produced fields before they touch the DB.
    try {
      assertSafeAIOutput(parsed.title, "extract_memory.title");
      assertSafeAIOutput(parsed.content, "extract_memory.content");
      if (parsed.motivo) assertSafeAIOutput(parsed.motivo, "extract_memory.motivo");
      if (Array.isArray(parsed.objecoes)) parsed.objecoes.forEach((s, i) => assertSafeAIOutput(s, `extract_memory.objecoes[${i}]`));
      if (Array.isArray(parsed.argumentos)) parsed.argumentos.forEach((s, i) => assertSafeAIOutput(s, `extract_memory.argumentos[${i}]`));
    } catch (e) {
      if (e instanceof UnsafeAIOutputError) {
        return new Response(JSON.stringify({ inserted: false, reason: "unsafe_output", matches: e.matches }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw e;
    }


    // Enriquecer metadata com sinais qualitativos extraídos pela IA (motor de padrões consome).
    const md: Record<string, unknown> = { ...(metadata || {}) };
    if (parsed.motivo) md.motivo = String(parsed.motivo).slice(0, 240);
    if (Array.isArray(parsed.objecoes) && parsed.objecoes.length) {
      const existing = Array.isArray(md.objecoes) ? md.objecoes as string[] : [];
      md.objecoes = Array.from(new Set([...existing, ...parsed.objecoes.map((s) => String(s).slice(0, 120))])).slice(0, 8);
    }
    if (Array.isArray(parsed.argumentos) && parsed.argumentos.length) {
      const existing = Array.isArray(md.argumentos) ? md.argumentos as string[] : [];
      md.argumentos = Array.from(new Set([...existing, ...parsed.argumentos.map((s) => String(s).slice(0, 120))])).slice(0, 8);
    }


    // 2) Embed the memory content
    const embedInput = `${parsed.title}\n${parsed.content}`;
    const embedding = await embedText(embedInput);
    if (!embedding) {
      return new Response(JSON.stringify({ inserted: false, reason: "embed_failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3) Dedup: buscar memória mais parecida do mesmo kind; se sim > 0.92, ignora.
    try {
      const { data: sim } = await db.rpc("match_commercial_memory", {
        query_embedding: embedding as unknown as string,
        match_count: 1,
        filter_kind: kind,
        filter_niche: (metadata && (metadata as Record<string, unknown>).niche as string) || null,
        min_similarity: 0.92,
      });
      if (Array.isArray(sim) && sim.length > 0) {
        // increment usage of the duplicate instead
        await db.from("commercial_memory")
          .update({ usage_count: (sim[0] as { usage_count: number }).usage_count + 1 })
          .eq("id", (sim[0] as { id: string }).id);
        return new Response(JSON.stringify({ inserted: false, reason: "duplicate", matchedId: (sim[0] as { id: string }).id }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } catch (e) {
      console.warn(JSON.stringify({ evt: "extract_memory_dedup_failed", msg: (e as Error).message }));
    }

    // 4) Insert
    const { data: inserted, error: insertErr } = await db.from("commercial_memory")
      .insert({
        kind,
        title: parsed.title.slice(0, 200),
        content: parsed.content.slice(0, 2000),
        metadata: md,
        embedding: embedding as unknown as string,
        source_lead_id: leadId || null,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.7)),
      })
      .select("id")
      .single();
    if (insertErr) {
      console.error(JSON.stringify({ evt: "extract_memory_insert_failed", msg: insertErr.message }));
      return new Response(JSON.stringify({ inserted: false, reason: "insert_failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ inserted: true, memoryId: inserted.id, model: ai.modelUsed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(JSON.stringify({ evt: "extract_memory_error", msg: (e as Error).message }));
    return new Response(JSON.stringify({ error: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

});
