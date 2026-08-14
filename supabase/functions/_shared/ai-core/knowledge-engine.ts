// AI Core — Knowledge Engine (Projeto Phoenix, Fase 3C).
// Camada única de acesso à Knowledge Base para os especialistas de IA.
// Espelha o contrato do Memory Engine (Fase 3B): escopos explícitos, cache por
// execução, governança aplicada e falha sempre degradada (nunca bloqueia a IA).
//
// Compatibilidade: este engine é um ADAPTADOR sobre a edge function
// `knowledge-search` já existente. Não altera RLS, indexação, embeddings,
// contratos públicos nem o comportamento observado pelo usuário.

import {
  applyChunkBudget,
  clampMatchCount,
  clampSimilarity,
  deduplicateChunks,
  KNOWLEDGE_LIMITS,
  type KnowledgeChunkShape,
  type KnowledgeCitationShape,
  type KnowledgeScope,
  logKnowledgeAccess,
  normalizeQueryText,
  resolveScopeEntity,
  sanitizeChunk,
  toCitations,
} from "./knowledge-governance.ts";

export type { KnowledgeScope };

export interface KnowledgeQuery {
  scope: KnowledgeScope;
  queryText: string;
  /** Obrigatório quando scope = "category". */
  categoria?: string | null;
  /** Obrigatório quando scope = "document". */
  documentId?: string | null;
  matchCount?: number;
  minSimilarity?: number;
  /** Identificação do especialista (apenas para permissão/observabilidade). */
  specialist?: string;
  /** Header Authorization do usuário — a autorização real acontece no backend. */
  authHeader?: string;
}

export interface KnowledgeContext {
  chunks: KnowledgeChunkShape[];
  citations: KnowledgeCitationShape[];
  chunkCount: number;
  droppedChunks: number;
  totalChars: number;
  scope: KnowledgeScope;
  cached: boolean;
}

const EMPTY = (scope: KnowledgeScope): KnowledgeContext => ({
  chunks: [], citations: [], chunkCount: 0, droppedChunks: 0, totalChars: 0, scope, cached: false,
});

/** Fonte de dados da KB (injetável para testes). */
export type KnowledgeFetcher = (params: {
  query: string;
  matchCount: number;
  minSimilarity: number;
  categoria: string | null;
  authHeader?: string;
}) => Promise<{ chunks: KnowledgeChunkShape[] }>;

/** Fetcher padrão: delega para a edge function `knowledge-search` (JWT do usuário). */
export const defaultKnowledgeFetcher: KnowledgeFetcher = async (params) => {
  if (!params.authHeader) return { chunks: [] };
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/knowledge-search`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: params.authHeader,
      apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
    },
    body: JSON.stringify({
      query: params.query,
      matchCount: params.matchCount,
      minSimilarity: params.minSimilarity,
      categoria: params.categoria,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { chunks: Array.isArray(data?.chunks) ? data.chunks : [] };
};

export interface KnowledgeEngineOptions {
  fetcher?: KnowledgeFetcher;
  /** Verificação de permissão do especialista (Tool Registry). */
  permit?: (specialist: string | undefined) => boolean;
}

function cacheKey(q: KnowledgeQuery, entity: string, matchCount: number, minSim: number, text: string) {
  return [q.scope, entity, matchCount, minSim, text].join("|");
}

/** Consulta sem cache. Nunca lança. */
export async function getKnowledgeContext(
  q: KnowledgeQuery,
  opts: KnowledgeEngineOptions = {},
): Promise<KnowledgeContext> {
  const fetcher = opts.fetcher ?? defaultKnowledgeFetcher;
  const permit = opts.permit ?? (() => true);

  if (!permit(q.specialist)) {
    logKnowledgeAccess({
      scope: q.scope, specialist: q.specialist, allowed: false, hasEntity: false,
      chunkCount: 0, droppedChunks: 0, totalChars: 0, cached: false, reason: "tool_not_allowed",
    });
    return EMPTY(q.scope);
  }

  const text = normalizeQueryText(q.queryText);
  if (!text) return EMPTY(q.scope);

  const scoped = resolveScopeEntity(q.scope, { categoria: q.categoria, documentId: q.documentId });
  if (!scoped.ok) {
    logKnowledgeAccess({
      scope: q.scope, specialist: q.specialist, allowed: true, hasEntity: false,
      chunkCount: 0, droppedChunks: 0, totalChars: 0, cached: false, reason: scoped.reason,
    });
    return EMPTY(q.scope);
  }

  const matchCount = clampMatchCount(q.matchCount);
  const minSimilarity = clampSimilarity(q.minSimilarity);

  try {
    const raw = await fetcher({
      query: text,
      matchCount,
      minSimilarity,
      categoria: scoped.categoria,
      authHeader: q.authHeader,
    });
    let list = (raw?.chunks ?? []).map(sanitizeChunk).filter((c) => c.content.length > 0);
    if (q.scope === "document") {
      list = list.filter((c) => c.document_id === scoped.entity);
    }
    const { kept, dropped, totalChars } = applyChunkBudget(list, KNOWLEDGE_LIMITS.maxTotalChars);

    logKnowledgeAccess({
      scope: q.scope, specialist: q.specialist, allowed: true, hasEntity: Boolean(scoped.entity),
      chunkCount: kept.length, droppedChunks: dropped, totalChars, cached: false,
    });

    return {
      chunks: kept,
      citations: toCitations(kept),
      chunkCount: kept.length,
      droppedChunks: dropped,
      totalChars,
      scope: q.scope,
      cached: false,
    };
  } catch (e) {
    console.warn(JSON.stringify({ evt: "knowledge_engine_failed", msg: (e as Error).message }));
    return EMPTY(q.scope);
  }
}

export interface KnowledgeEngine {
  get(q: KnowledgeQuery): Promise<KnowledgeContext>;
  stats(): { queries: number; hits: number };
}

/**
 * Engine com cache por execução (uma requisição HTTP = um engine).
 * Consultas idênticas (mesmo escopo, entidade, limites e texto) fazem UMA busca.
 */
export function createKnowledgeEngine(opts: KnowledgeEngineOptions = {}): KnowledgeEngine {
  const cache = new Map<string, Promise<KnowledgeContext>>();
  let queries = 0;
  let hits = 0;

  return {
    async get(q: KnowledgeQuery): Promise<KnowledgeContext> {
      const text = normalizeQueryText(q.queryText);
      const scoped = resolveScopeEntity(q.scope, { categoria: q.categoria, documentId: q.documentId });
      const entity = scoped.ok ? scoped.entity : "__invalid__";
      const key = cacheKey(q, entity, clampMatchCount(q.matchCount), clampSimilarity(q.minSimilarity), text);

      const cachedPromise = cache.get(key);
      if (cachedPromise) {
        hits++;
        const res = await cachedPromise;
        return { ...res, cached: true };
      }
      queries++;
      const p = getKnowledgeContext(q, opts);
      cache.set(key, p);
      return await p;
    },
    stats: () => ({ queries, hits }),
  };
}
