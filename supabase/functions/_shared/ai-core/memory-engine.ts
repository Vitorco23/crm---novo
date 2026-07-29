// AI Core — Memory Engine (Projeto Phoenix, Fase 3B).
// Camada única de acesso à Memória Comercial, com ESCOPOS explícitos e cache
// por execução. Objetivos:
//   • privilégio mínimo: cada consulta declara o escopo e a entidade;
//   • sem consulta duplicada: chamadas idênticas na mesma execução reusam cache;
//   • referências padronizadas para exibição na UI (MemoryReferencesBlock).
//
// Regra de isolamento: consultas com escopo "lead" ou "niche" SEMPRE carregam a
// entidade no cache key, de modo que o contexto de um lead nunca é reaproveitado
// por outro lead dentro da mesma execução.

import { buildMemoryContextBlock, type MemoryHit } from "../memory-retrieval.ts";

export type MemoryScope = "global" | "niche" | "lead";

export interface MemoryQuery {
  scope: MemoryScope;
  /** Texto de consulta (será embeddado). */
  queryText: string;
  /** Obrigatório quando scope = "niche". Ignorado quando scope = "global". */
  niche?: string | null;
  /** Obrigatório quando scope = "lead". Usado apenas para isolamento/cache. */
  leadId?: string | null;
  matchCount?: number;
  minSimilarity?: number;
  includePatterns?: boolean;
}

export interface MemoryReference {
  id: string;
  kind: string;
  title: string;
  similarity: number;
}

export interface MemoryContext {
  /** Bloco pronto para injeção no prompt ("" quando não há memória). */
  block: string;
  references: MemoryReference[];
  memoryCount: number;
  patternCount: number;
  scope: MemoryScope;
  /** true quando a resposta veio do cache da execução atual. */
  cached: boolean;
}

const EMPTY = (scope: MemoryScope): MemoryContext => ({
  block: "", references: [], memoryCount: 0, patternCount: 0, scope, cached: false,
});

function toReferences(hits: MemoryHit[]): MemoryReference[] {
  return hits.map((h) => ({
    id: h.id,
    kind: h.kind,
    title: h.title,
    similarity: typeof h.similarity === "number" ? h.similarity : 0,
  }));
}

/** Normaliza a query aplicando as regras do escopo (privilégio mínimo). */
function resolveQuery(q: MemoryQuery) {
  const niche = q.scope === "niche" ? (q.niche ?? null) : null;
  const entity = q.scope === "lead" ? (q.leadId ?? "") : q.scope === "niche" ? (niche ?? "") : "";
  return {
    niche,
    entity,
    queryText: String(q.queryText ?? "").slice(0, 6000),
    matchCount: q.matchCount ?? 5,
    minSimilarity: q.minSimilarity ?? 0.55,
    includePatterns: q.includePatterns !== false,
  };
}

function cacheKey(q: MemoryQuery): string {
  const r = resolveQuery(q);
  return [
    q.scope, r.entity, r.matchCount, r.minSimilarity, r.includePatterns ? 1 : 0, r.queryText,
  ].join("|");
}

/** Fonte de dados da memória (injetável para testes). */
export type MemoryFetcher = typeof buildMemoryContextBlock;

/** Consulta sem cache. Nunca lança: falha de memória jamais bloqueia a IA. */
export async function getMemoryContext(
  q: MemoryQuery,
  fetcher: MemoryFetcher = buildMemoryContextBlock,
): Promise<MemoryContext> {
  const r = resolveQuery(q);
  if (!r.queryText.trim()) return EMPTY(q.scope);
  if (q.scope === "lead" && !q.leadId) {
    console.warn(JSON.stringify({ evt: "memory_scope_missing_entity", scope: q.scope }));
    return EMPTY(q.scope);
  }
  if (q.scope === "niche" && !r.niche) {
    console.warn(JSON.stringify({ evt: "memory_scope_missing_entity", scope: q.scope }));
    return EMPTY(q.scope);
  }
  try {
    const res = await fetcher({
      queryText: r.queryText,
      niche: r.niche,
      matchCount: r.matchCount,
      minSimilarity: r.minSimilarity,
      includePatterns: r.includePatterns,
    });
    return {
      block: res.block,
      references: toReferences(res.memories ?? []),
      memoryCount: res.memoryCount,
      patternCount: res.patternCount,
      scope: q.scope,
      cached: false,
    };
  } catch (e) {
    console.warn(JSON.stringify({ evt: "memory_engine_failed", msg: (e as Error).message }));
    return EMPTY(q.scope);
  }
}

export interface MemoryEngine {
  get(q: MemoryQuery): Promise<MemoryContext>;
  /** Observabilidade: consultas efetivamente executadas nesta requisição. */
  stats(): { queries: number; hits: number };
}

/**
 * Cria um engine com cache por execução (uma requisição HTTP = um engine).
 * Duas chamadas com o mesmo escopo, entidade e consulta fazem UMA busca.
 */
export function createMemoryEngine(fetcher: MemoryFetcher = buildMemoryContextBlock): MemoryEngine {
  const cache = new Map<string, Promise<MemoryContext>>();
  let queries = 0;
  let hits = 0;
  return {
    async get(q: MemoryQuery) {
      const key = cacheKey(q);
      const existing = cache.get(key);
      if (existing) {
        hits++;
        return { ...(await existing), cached: true };
      }
      queries++;
      const p = getMemoryContext(q, fetcher);
      cache.set(key, p);
      return await p;
    },
    stats: () => ({ queries, hits }),
  };
}
