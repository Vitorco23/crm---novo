// Testes do Knowledge Engine (Projeto Phoenix, Fase 3C).
// Executar: deno test supabase/functions/_shared/ai-core/knowledge-engine.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createKnowledgeEngine,
  getKnowledgeContext,
  type KnowledgeFetcher,
} from "./knowledge-engine.ts";
import { applyChunkBudget, clampMatchCount, clampSimilarity, toCitations } from "./knowledge-governance.ts";

function chunk(doc: string, content: string, similarity = 0.8, categoria = "script") {
  return { document_id: doc, content, titulo: `Doc ${doc}`, categoria, versao: 1, similarity };
}

function makeFetcher(chunks: ReturnType<typeof chunk>[]) {
  const calls: unknown[] = [];
  const fetcher: KnowledgeFetcher = (params) => {
    calls.push(params);
    return Promise.resolve({ chunks });
  };
  return { fetcher, calls };
}

Deno.test("escopo category exige categoria", async () => {
  const { fetcher, calls } = makeFetcher([chunk("a", "conteudo")]);
  const res = await getKnowledgeContext({ scope: "category", queryText: "objeção preço" }, { fetcher });
  assertEquals(res.chunkCount, 0);
  assertEquals(calls.length, 0);
});

Deno.test("escopo category repassa filtro de categoria", async () => {
  const { fetcher, calls } = makeFetcher([chunk("a", "conteudo")]);
  const res = await getKnowledgeContext(
    { scope: "category", categoria: "script", queryText: "abordagem" },
    { fetcher },
  );
  assertEquals(res.chunkCount, 1);
  assertEquals((calls[0] as { categoria: string }).categoria, "script");
});

Deno.test("escopo document isola trechos de outros documentos", async () => {
  const { fetcher } = makeFetcher([chunk("a", "do doc A"), chunk("b", "do doc B")]);
  const res = await getKnowledgeContext(
    { scope: "document", documentId: "a", queryText: "resumo" },
    { fetcher },
  );
  assertEquals(res.chunkCount, 1);
  assertEquals(res.chunks[0].document_id, "a");
});

Deno.test("permissão negada não consulta a KB", async () => {
  const { fetcher, calls } = makeFetcher([chunk("a", "conteudo")]);
  const res = await getKnowledgeContext(
    { scope: "global", queryText: "x", specialist: "diretor_comercial" },
    { fetcher, permit: (s) => s === "mentor_p21" },
  );
  assertEquals(res.chunkCount, 0);
  assertEquals(calls.length, 0);
});

Deno.test("falha da KB degrada sem lançar", async () => {
  const fetcher: KnowledgeFetcher = () => Promise.reject(new Error("boom"));
  const res = await getKnowledgeContext({ scope: "global", queryText: "x" }, { fetcher });
  assertEquals(res.chunkCount, 0);
  assertEquals(res.citations.length, 0);
});

Deno.test("cache por execução evita consulta duplicada", async () => {
  const { fetcher, calls } = makeFetcher([chunk("a", "conteudo")]);
  const engine = createKnowledgeEngine({ fetcher });
  const q = { scope: "global" as const, queryText: "mesma pergunta" };
  const first = await engine.get(q);
  const second = await engine.get(q);
  assertEquals(calls.length, 1);
  assertEquals(first.cached, false);
  assertEquals(second.cached, true);
  assertEquals(engine.stats(), { queries: 1, hits: 1 });
});

Deno.test("cache não mistura escopos/entidades diferentes", async () => {
  const { fetcher, calls } = makeFetcher([chunk("a", "conteudo")]);
  const engine = createKnowledgeEngine({ fetcher });
  await engine.get({ scope: "category", categoria: "script", queryText: "q" });
  await engine.get({ scope: "category", categoria: "objecoes", queryText: "q" });
  assertEquals(calls.length, 2);
});

Deno.test("orçamento de caracteres descarta excedentes", () => {
  const big = chunk("a", "x".repeat(900));
  const other = chunk("b", "y".repeat(900));
  const { kept, dropped, totalChars } = applyChunkBudget([big, other], 1000);
  assertEquals(kept.length, 1);
  assertEquals(dropped, 1);
  assertEquals(totalChars, 900);
});

Deno.test("limites são aplicados", () => {
  assertEquals(clampMatchCount(999), 12);
  assertEquals(clampMatchCount(0), 1);
  assertEquals(clampSimilarity(5), 0.95);
  assertEquals(clampSimilarity(-1), 0.15);
});

Deno.test("citações são deduplicadas por documento", () => {
  const cits = toCitations([chunk("a", "c1", 0.5), chunk("a", "c2", 0.9), chunk("b", "c3", 0.7)]);
  assertEquals(cits.length, 2);
  assertEquals(cits[0].documentId, "a");
  assertEquals(cits[0].similarity, 0.9);
});
