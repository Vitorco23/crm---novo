// AI Core — Tool Registry (Projeto Phoenix, Fase 3A).
// Declara as ferramentas autorizadas, seus contratos, permissões e limites.
// Nenhum especialista deve chamar uma capacidade fora deste catálogo.

import type { SpecialistId, ToolDefinition } from "./types.ts";

export type ToolId = "knowledge.search" | "memory.retrieve";

const REGISTRY: Record<ToolId, ToolDefinition> = {
  "knowledge.search": {
    id: "knowledge.search",
    purpose: "Busca semântica de trechos na Knowledge Base oficial (fonte complementar).",
    allowedFor: ["mentor_p21"],
    requiresUserAuth: true,
  },
  "memory.retrieve": {
    id: "memory.retrieve",
    purpose: "Recupera memórias comerciais e padrões relevantes ao contexto.",
    allowedFor: ["diretor_comercial", "consultor_leads", "mentor_p21"],
    requiresUserAuth: false,
  },
};

export function getTool(id: ToolId): ToolDefinition {
  const t = REGISTRY[id];
  if (!t) throw new Error(`Ferramenta não registrada: ${id}`);
  return t;
}

export function isToolAllowed(id: ToolId, specialist: SpecialistId): boolean {
  return REGISTRY[id]?.allowedFor.includes(specialist) ?? false;
}

export function listTools(): ToolDefinition[] {
  return Object.values(REGISTRY);
}

export interface KnowledgeChunk {
  document_id: string;
  content: string;
  titulo: string;
  categoria: string;
  versao: number;
  similarity: number;
}

export interface KnowledgeCitation {
  documentId: string;
  titulo: string;
  categoria: string;
  versao: number;
  similarity: number;
}

/**
 * Executa a busca semântica na Knowledge Base.
 * Best-effort por contrato: falha nunca bloqueia a resposta do especialista.
 */
export async function runKnowledgeSearch(params: {
  specialist: SpecialistId;
  query: string;
  authHeader: string;
  matchCount?: number;
  minSimilarity?: number;
}): Promise<{ chunks: KnowledgeChunk[]; citations: KnowledgeCitation[] }> {
  const empty = { chunks: [] as KnowledgeChunk[], citations: [] as KnowledgeCitation[] };
  if (!isToolAllowed("knowledge.search", params.specialist)) return empty;

  try {
    const searchUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/knowledge-search`;
    const res = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: params.authHeader,
        apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
      },
      body: JSON.stringify({
        query: params.query,
        matchCount: params.matchCount ?? 6,
        minSimilarity: params.minSimilarity ?? 0.30,
      }),
    });
    const data = await res.json().catch(() => ({}));
    const chunks: KnowledgeChunk[] = data?.chunks ?? [];
    return {
      chunks,
      citations: chunks.map((c) => ({
        documentId: c.document_id,
        titulo: c.titulo,
        categoria: c.categoria,
        versao: c.versao,
        similarity: c.similarity,
      })),
    };
  } catch (e) {
    console.error(JSON.stringify({ evt: "tool_knowledge_search_failed", msg: (e as Error).message }));
    return empty;
  }
}
