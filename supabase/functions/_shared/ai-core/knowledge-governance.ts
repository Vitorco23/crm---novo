// AI Core — Knowledge Governance (Projeto Phoenix, Fase 3C).
// Regras de governança da Knowledge Platform. Camada puramente determinística:
// não faz I/O, não conhece Supabase e não altera contratos existentes.
//
// Responsabilidades:
//   • limites duros de consulta (match count, similaridade, orçamento de texto);
//   • normalização/validação de escopo (global | category | document);
//   • tratamento do conteúdo da KB como entrada NÃO CONFIÁVEL;
//   • citações normalizadas e deduplicadas;
//   • observabilidade padronizada (evento knowledge_query).

import { sanitizeExternal } from "../untrusted-input.ts";

export type KnowledgeScope = "global" | "category" | "document";

/** Limites duros. Qualquer chamada é obrigatoriamente reduzida a estes valores. */
export const KNOWLEDGE_LIMITS = {
  minMatchCount: 1,
  maxMatchCount: 12,
  defaultMatchCount: 6,
  minSimilarity: 0.15,
  maxSimilarity: 0.95,
  defaultSimilarity: 0.3,
  /** Caracteres máximos por trecho injetado no prompt. */
  maxChunkChars: 4000,
  /** Orçamento total de conteúdo de KB por execução de IA. */
  maxTotalChars: 12000,
  /** Tamanho máximo do texto de consulta enviado ao embedding. */
  maxQueryChars: 2000,
  maxCategoryChars: 60,
} as const;

export interface KnowledgeChunkShape {
  document_id: string;
  content: string;
  titulo: string;
  categoria: string;
  versao: number;
  similarity: number;
}

export interface KnowledgeCitationShape {
  documentId: string;
  titulo: string;
  categoria: string;
  versao: number;
  similarity: number;
}

export function clampMatchCount(n: number | undefined): number {
  const v = Number.isFinite(n) ? Math.trunc(n as number) : KNOWLEDGE_LIMITS.defaultMatchCount;
  return Math.min(Math.max(v, KNOWLEDGE_LIMITS.minMatchCount), KNOWLEDGE_LIMITS.maxMatchCount);
}

export function clampSimilarity(n: number | undefined): number {
  const v = Number.isFinite(n) ? (n as number) : KNOWLEDGE_LIMITS.defaultSimilarity;
  return Math.min(Math.max(v, KNOWLEDGE_LIMITS.minSimilarity), KNOWLEDGE_LIMITS.maxSimilarity);
}

/** Normaliza a categoria: string curta, sem quebras de linha nem caracteres de controle. */
export function normalizeCategory(c: unknown): string | null {
  if (typeof c !== "string") return null;
  const clean = c.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if (!clean) return null;
  return clean.slice(0, KNOWLEDGE_LIMITS.maxCategoryChars);
}

/** Normaliza o texto de consulta (sempre tratado como entrada do usuário). */
export function normalizeQueryText(q: unknown): string {
  if (typeof q !== "string") return "";
  return sanitizeExternal(q, KNOWLEDGE_LIMITS.maxQueryChars).trim();
}

/**
 * Valida a coerência escopo × entidade.
 * Retorna a entidade normalizada ou null quando o escopo é inválido.
 */
export function resolveScopeEntity(
  scope: KnowledgeScope,
  opts: { categoria?: string | null; documentId?: string | null },
): { ok: true; entity: string; categoria: string | null } | { ok: false; reason: string } {
  if (scope === "global") return { ok: true, entity: "", categoria: null };
  if (scope === "category") {
    const cat = normalizeCategory(opts.categoria);
    if (!cat) return { ok: false, reason: "category_required" };
    return { ok: true, entity: cat, categoria: cat };
  }
  const doc = typeof opts.documentId === "string" ? opts.documentId.trim() : "";
  if (!doc) return { ok: false, reason: "document_required" };
  return { ok: true, entity: doc, categoria: normalizeCategory(opts.categoria) };
}

/** Garante que o conteúdo vindo da KB nunca funcione como instrução ao modelo. */
export function sanitizeChunk(chunk: KnowledgeChunkShape): KnowledgeChunkShape {
  return {
    document_id: String(chunk.document_id ?? ""),
    titulo: sanitizeExternal(String(chunk.titulo ?? ""), 200),
    categoria: normalizeCategory(chunk.categoria) ?? "",
    versao: Number.isFinite(chunk.versao) ? Number(chunk.versao) : 1,
    similarity: Number.isFinite(chunk.similarity) ? Number(chunk.similarity) : 0,
    content: sanitizeExternal(String(chunk.content ?? ""), KNOWLEDGE_LIMITS.maxChunkChars),
  };
}

/**
 * Aplica o orçamento total de caracteres, preservando a ordem de relevância.
 * Trechos que estouram o orçamento são descartados (nunca truncados no meio
 * de forma silenciosa sem registro).
 */
export function applyChunkBudget(
  chunks: KnowledgeChunkShape[],
  maxTotalChars: number = KNOWLEDGE_LIMITS.maxTotalChars,
): { kept: KnowledgeChunkShape[]; dropped: number; totalChars: number } {
  const kept: KnowledgeChunkShape[] = [];
  let total = 0;
  let dropped = 0;
  for (const c of chunks) {
    const len = c.content.length;
    if (total + len > maxTotalChars) {
      dropped++;
      continue;
    }
    kept.push(c);
    total += len;
  }
  return { kept, dropped, totalChars: total };
}

/** Citações normalizadas e deduplicadas por documento (maior similaridade vence). */
export function toCitations(chunks: KnowledgeChunkShape[]): KnowledgeCitationShape[] {
  const byDoc = new Map<string, KnowledgeCitationShape>();
  for (const c of chunks) {
    const prev = byDoc.get(c.document_id);
    if (prev && prev.similarity >= c.similarity) continue;
    byDoc.set(c.document_id, {
      documentId: c.document_id,
      titulo: c.titulo,
      categoria: c.categoria,
      versao: c.versao,
      similarity: c.similarity,
    });
  }
  return [...byDoc.values()].sort((a, b) => b.similarity - a.similarity);
}

/**
 * Deduplica trechos com base no conteúdo (remove redundância textual exata
 * ou muito similar). Simples deduplicação por set de conteúdo limpo.
 */
export function deduplicateChunks(chunks: KnowledgeChunkShape[]): KnowledgeChunkShape[] {
  const seen = new Set<string>();
  const unique: KnowledgeChunkShape[] = [];
  for (const c of chunks) {
    const key = c.content.trim().toLowerCase().slice(0, 500); // Primeiros 500 chars como chave
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  return unique;
}

/** Log padronizado — nunca inclui conteúdo da KB nem a consulta do usuário. */
export function logKnowledgeAccess(entry: {
  scope: KnowledgeScope;
  specialist?: string;
  allowed: boolean;
  hasEntity: boolean;
  chunkCount: number;
  droppedChunks: number;
  totalChars: number;
  cached: boolean;
  reason?: string;
}): void {
  console.log(JSON.stringify({ evt: "knowledge_query", ...entry }));
}
