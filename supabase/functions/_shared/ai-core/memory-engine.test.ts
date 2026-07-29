// Testes do Memory Engine (Projeto Phoenix, Fase 3B).
// Cobrem: isolamento entre leads/nichos, escopo niche vs global,
// deduplicação por execução, resiliência a falhas e ausência de cache global.
//
// Rodar: deno test --allow-env supabase/functions/_shared/ai-core/memory-engine.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createMemoryEngine, type MemoryFetcher } from "./memory-engine.ts";

interface Call { queryText: string; niche: string | null }

function fakeFetcher(calls: Call[]): MemoryFetcher {
  return (async (args: any) => {
    calls.push({ queryText: args.queryText, niche: args.niche ?? null });
    return {
      block: `MEM(${args.niche ?? "global"}):${args.queryText}`,
      memories: [{
        id: `mem-${args.niche ?? "global"}-${calls.length}`,
        kind: "insight",
        title: `titulo ${args.queryText}`,
        content: "c",
        similarity: 0.9,
        metadata: {},
      }],
      memoryCount: 1,
      patternCount: 0,
    };
  }) as unknown as MemoryFetcher;
}

Deno.test("leads diferentes nao compartilham contexto de memoria", async () => {
  const calls: Call[] = [];
  const engine = createMemoryEngine(fakeFetcher(calls));
  const a = await engine.get({ scope: "lead", leadId: "lead-A", queryText: "empresa A" });
  const b = await engine.get({ scope: "lead", leadId: "lead-B", queryText: "empresa B" });

  assertEquals(calls.length, 2, "cada lead deve gerar sua propria consulta");
  assertEquals(a.cached, false);
  assertEquals(b.cached, false);
  assertEquals(a.block.includes("empresa A"), true);
  assertEquals(b.block.includes("empresa B"), true);
  assertEquals(a.references[0].id === b.references[0].id, false);
});

Deno.test("mesmo texto em leads diferentes nao reutiliza cache", async () => {
  const calls: Call[] = [];
  const engine = createMemoryEngine(fakeFetcher(calls));
  await engine.get({ scope: "lead", leadId: "lead-A", queryText: "mesmo texto" });
  const second = await engine.get({ scope: "lead", leadId: "lead-B", queryText: "mesmo texto" });
  assertEquals(calls.length, 2);
  assertEquals(second.cached, false);
});

Deno.test("escopo niche envia o nicho; escopo global nunca filtra por nicho", async () => {
  const calls: Call[] = [];
  const engine = createMemoryEngine(fakeFetcher(calls));

  const comNicho = await engine.get({ scope: "niche", niche: "Clinicas", queryText: "lead com nicho" });
  const semNicho = await engine.get({ scope: "global", niche: "Clinicas", queryText: "lead sem nicho" });

  assertEquals(comNicho.scope, "niche");
  assertEquals(calls[0].niche, "Clinicas");
  assertEquals(semNicho.scope, "global");
  assertEquals(calls[1].niche, null, "escopo global deve ignorar nicho");
});

Deno.test("escopo invalido nao consulta e devolve contexto vazio", async () => {
  const calls: Call[] = [];
  const engine = createMemoryEngine(fakeFetcher(calls));
  const semLead = await engine.get({ scope: "lead", queryText: "x" });
  const semNiche = await engine.get({ scope: "niche", queryText: "x" });
  assertEquals(calls.length, 0);
  assertEquals(semLead.block, "");
  assertEquals(semNiche.block, "");
});

Deno.test("consulta identica na mesma execucao nao duplica busca", async () => {
  const calls: Call[] = [];
  const engine = createMemoryEngine(fakeFetcher(calls));
  const q = { scope: "lead" as const, leadId: "lead-A", queryText: "briefing" };
  const first = await engine.get(q);
  const second = await engine.get(q);
  const third = await engine.get(q);

  assertEquals(calls.length, 1, "tres leituras, uma unica busca");
  assertEquals(first.cached, false);
  assertEquals(second.cached, true);
  assertEquals(third.block, first.block);
  assertEquals(engine.stats(), { queries: 1, hits: 2 });
});

Deno.test("falha da memoria nao quebra: contexto vazio e IA segue", async () => {
  const failing = (async () => { throw new Error("pgvector indisponivel"); }) as unknown as MemoryFetcher;
  const engine = createMemoryEngine(failing);
  const ctx = await engine.get({ scope: "global", queryText: "diagnostico do lead" });
  assertEquals(ctx.block, "");
  assertEquals(ctx.references.length, 0);
  assertEquals(ctx.memoryCount, 0);
  assertEquals(ctx.scope, "global");
});

Deno.test("cache e por execucao: engines distintos nao compartilham nada", async () => {
  const calls: Call[] = [];
  const fetcher = fakeFetcher(calls);
  const req1 = createMemoryEngine(fetcher);
  const req2 = createMemoryEngine(fetcher);
  const q = { scope: "global" as const, queryText: "mesma pergunta" };

  const a = await req1.get(q);
  const b = await req2.get(q);

  assertEquals(calls.length, 2, "cada requisicao faz sua propria busca");
  assertEquals(a.cached, false);
  assertEquals(b.cached, false);
  assertEquals(req1.stats().queries, 1);
  assertEquals(req2.stats().queries, 1);
});
