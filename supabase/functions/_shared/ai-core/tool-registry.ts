// AI Core — Tool Registry (Projeto Phoenix, Fases 3A e 3C).
// Declara as ferramentas autorizadas, seus contratos, permissões e limites.
// Nenhum especialista deve chamar uma capacidade fora deste catálogo.

import type { SpecialistId, ToolDefinition } from "./types.ts";
import {
  createKnowledgeEngine,
  getKnowledgeContext,
  type KnowledgeEngine,
} from "./knowledge-engine.ts";

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
 *
 * Fase 3C: agora delega ao Knowledge Engine (governança + cache por execução).
 * O contrato de saída permanece idêntico ao da Fase 3A.
 */
export async function runKnowledgeSearch(params: {
  specialist: SpecialistId;
  query: string;
  authHeader: string;
  matchCount?: number;
  minSimilarity?: number;
  /** Opcional: engine com cache por execução. Sem ele, consulta direta. */
  engine?: KnowledgeEngine;
}): Promise<{ chunks: KnowledgeChunk[]; citations: KnowledgeCitation[] }> {
  const query = {
    scope: "global" as const,
    queryText: params.query,
    matchCount: params.matchCount ?? 6,
    minSimilarity: params.minSimilarity ?? 0.30,
    specialist: params.specialist,
    authHeader: params.authHeader,
  };
  const permit = (s: string | undefined) =>
    isToolAllowed("knowledge.search", s as SpecialistId);

  const ctx = params.engine
    ? await params.engine.get(query)
    : await getKnowledgeContext(query, { permit });

  const chunks = ctx.chunks as KnowledgeChunk[];
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
}

/** Fábrica do engine já vinculada às permissões do Tool Registry. */
export function createKnowledgeEngineForSpecialist(): KnowledgeEngine {
  return createKnowledgeEngine({
    permit: (s) => isToolAllowed("knowledge.search", s as SpecialistId),
  });
}
