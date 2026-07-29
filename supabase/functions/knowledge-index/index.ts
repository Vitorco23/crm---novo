// knowledge-index — chunkifica um documento e regrava embeddings.
// Chamada após criar/editar/importar um documento na Knowledge Base.
//
// Fase 3C+: governança de ingestão aplicada via AI Core
// (limites, validação, sanitização, marcação de conteúdo suspeito e logs).
// Ownership: o documento é lido com o JWT do usuário (RLS aplicada) — um
// documento de outra conta simplesmente não é encontrado (404).

import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser } from "../_shared/require-auth.ts";
import {
  buildChunkMetadata,
  KNOWLEDGE_INGESTION_LIMITS,
  logKnowledgeIngest,
  planChunks,
  scanIngestContent,
  validateIngestionDocument,
} from "../_shared/ai-core/knowledge-ingestion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMBEDDING_MODEL = "openai/text-embedding-3-small"; // 1536 dims

async function embed(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`embedding_${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.data?.[0]?.embedding as number[];
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  const startedAt = Date.now();
  try {
    const { documentId } = await req.json().catch(() => ({}));
    if (!documentId || typeof documentId !== "string" || documentId.length > 64) {
      logKnowledgeIngest({ evt: "knowledge_index", stage: "rejected", reason: "documentId_required" });
      return json({ error: "documentId_required" }, 400);
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    // Cliente com o JWT do usuário: RLS decide o que é visível. Nunca service_role.
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization")!;
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );

    const { data: doc, error: docErr } = await sb
      .from("knowledge_documents")
      .select("id, titulo, categoria, tags, ativo, versao, conteudo_markdown")
      .eq("id", documentId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) {
      // Inclui o caso "documento de outra conta": RLS o torna inexistente.
      logKnowledgeIngest({ evt: "knowledge_index", stage: "not_found", documentId });
      return json({ error: "not_found" }, 404);
    }

    // --- Governança: validação + normalização -------------------------------
    const validation = validateIngestionDocument(doc);
    if (!validation.ok) {
      logKnowledgeIngest({
        evt: "knowledge_index", stage: "invalid", documentId: doc.id, reason: validation.errors.join(","),
      });
      return json({ error: "invalid_document", details: validation.errors }, 422);
    }
    const { titulo, categoria, content, ativo } = validation.value;
    const flags = scanIngestContent(content.text);

    // --- Governança: chunking com teto --------------------------------------
    const plan = planChunks(content.text);

    logKnowledgeIngest({
      evt: "knowledge_index",
      stage: "start",
      documentId: doc.id,
      chars: content.chars,
      originalChars: content.originalChars,
      truncated: content.truncated,
      chunks: plan.chunks.length,
      droppedChunks: plan.dropped,
      capped: plan.capped,
      ativo,
      versao: Number(doc.versao ?? 1),
      suspicious: flags.suspicious,
      patterns: flags.patterns,
      warnings: validation.warnings,
    });

    // Reindexação: remove o índice anterior (também sob RLS).
    const { error: delErr } = await sb.from("knowledge_chunks").delete().eq("document_id", documentId);
    if (delErr) throw new Error(`delete_chunks: ${delErr.message}`);

    if (plan.chunks.length === 0) {
      logKnowledgeIngest({ evt: "knowledge_index", stage: "empty", documentId: doc.id, chunks: 0, ms: Date.now() - startedAt });
      return json({ ok: true, chunks: 0, truncated: content.truncated, capped: plan.capped });
    }

    const metadata = buildChunkMetadata({ titulo, categoria, versao: Number(doc.versao ?? 1), flags });

    // Embeddings sequenciais (respeita rate limit) e inserção em lotes.
    const BATCH = 100;
    let inserted = 0;
    for (let start = 0; start < plan.chunks.length; start += BATCH) {
      const slice = plan.chunks.slice(start, start + BATCH);
      const rows: Array<Record<string, unknown>> = [];
      for (let i = 0; i < slice.length; i++) {
        const emb = await embed(slice[i], apiKey);
        rows.push({
          document_id: documentId,
          chunk_index: start + i,
          content: slice[i],
          embedding: emb,
          metadata,
        });
      }
      const { error: insErr } = await sb.from("knowledge_chunks").insert(rows);
      if (insErr) throw new Error(`insert_chunks: ${insErr.message}`);
      inserted += rows.length;
    }

    logKnowledgeIngest({
      evt: "knowledge_index",
      stage: "ok",
      documentId: doc.id,
      chunks: inserted,
      droppedChunks: plan.dropped,
      capped: plan.capped,
      truncated: content.truncated,
      ativo,
      versao: Number(doc.versao ?? 1),
      ms: Date.now() - startedAt,
    });
    return json({
      ok: true,
      chunks: inserted,
      droppedChunks: plan.dropped,
      capped: plan.capped,
      truncated: content.truncated,
      // Documento não publicado é indexado, mas não aparece na busca (ativo=false).
      searchable: ativo,
      limits: { maxChunks: KNOWLEDGE_INGESTION_LIMITS.maxChunks, maxDocumentChars: KNOWLEDGE_INGESTION_LIMITS.maxDocumentChars },
    });
  } catch (e) {
    logKnowledgeIngest({ evt: "knowledge_index", stage: "error", reason: (e as Error).message.slice(0, 200), ms: Date.now() - startedAt });
    return json({ error: "internal_error", detail: (e as Error).message }, 500);
  }
});
