// knowledge-index — chunkifica um documento e regrava embeddings.
// Chamada após criar/editar/importar um documento na Knowledge Base.

import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser } from "../_shared/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CHUNK_SIZE = 1200; // ~800 tokens
const CHUNK_OVERLAP = 200;
const EMBEDDING_MODEL = "openai/text-embedding-3-small"; // 1536 dims

function chunkMarkdown(text: string): string[] {
  const clean = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    if ((buf + "\n\n" + p).length <= CHUNK_SIZE) {
      buf = buf ? `${buf}\n\n${p}` : p;
    } else {
      if (buf) chunks.push(buf);
      if (p.length <= CHUNK_SIZE) {
        buf = p;
      } else {
        // Split long paragraph
        for (let i = 0; i < p.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
          chunks.push(p.slice(i, i + CHUNK_SIZE));
        }
        buf = "";
      }
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  try {
    const { documentId } = await req.json().catch(() => ({}));
    if (!documentId || typeof documentId !== "string") {
      return new Response(JSON.stringify({ error: "documentId_required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization")!;
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );

    const { data: doc, error: docErr } = await sb
      .from("knowledge_documents")
      .select("id, titulo, categoria, conteudo_markdown")
      .eq("id", documentId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chunks = chunkMarkdown(doc.conteudo_markdown);
    console.log(JSON.stringify({ evt: "kb_index_start", doc: doc.id, chunks: chunks.length }));

    // Wipe old chunks
    const { error: delErr } = await sb.from("knowledge_chunks").delete().eq("document_id", documentId);
    if (delErr) throw new Error(`delete_chunks: ${delErr.message}`);

    if (chunks.length === 0) {
      return new Response(JSON.stringify({ ok: true, chunks: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Embed sequentially to respect rate limits (documents are usually small)
    const rows: Array<{ document_id: string; chunk_index: number; content: string; embedding: number[]; metadata: Record<string, unknown> }> = [];
    for (let i = 0; i < chunks.length; i++) {
      const emb = await embed(chunks[i], apiKey);
      rows.push({
        document_id: documentId,
        chunk_index: i,
        content: chunks[i],
        embedding: emb,
        metadata: { titulo: doc.titulo, categoria: doc.categoria },
      });
    }

    // Batch insert
    const { error: insErr } = await sb.from("knowledge_chunks").insert(rows);
    if (insErr) throw new Error(`insert_chunks: ${insErr.message}`);

    console.log(JSON.stringify({ evt: "kb_index_ok", doc: doc.id, chunks: rows.length }));
    return new Response(JSON.stringify({ ok: true, chunks: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(JSON.stringify({ evt: "kb_index_error", msg: (e as Error).message }));
    return new Response(JSON.stringify({ error: "internal_error", detail: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
