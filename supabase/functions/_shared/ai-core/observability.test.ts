// Testes de Observabilidade de IA (Projeto Phoenix, Fase 3D.1).
// Rodar: deno test --allow-env supabase/functions/_shared/ai-core/observability.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type AIExecutionEvent,
  buildEvent,
  normalizeErrorCode,
  startAIExecution,
} from "./observability.ts";

const SENSITIVE = [
  "Qual a melhor abordagem para o lead da Padaria X?",
  "Resposta completa da IA com estratégia detalhada",
  "Você é o DIRETOR COMERCIAL da Performance21",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def",
  "sk-live-1234567890",
  "transcrição da ligação: cliente disse que...",
];

function captured(): { events: AIExecutionEvent[]; persist: (e: AIExecutionEvent) => Promise<void> } {
  const events: AIExecutionEvent[] = [];
  return { events, persist: async (e) => { events.push(e); } };
}

function serialized(e: AIExecutionEvent) {
  return JSON.stringify(e);
}

Deno.test("execução bem-sucedida gera evento sem dados sensíveis", async () => {
  const { events, persist } = captured();
  const rec = startAIExecution({
    task: "intel_router",
    userId: "11111111-1111-1111-1111-111111111111",
    conversationId: "22222222-2222-2222-2222-222222222222",
    specialist: "mentor_p21",
    promptId: "mentor.p21.base",
    promptVersion: "1",
    sources: ["crm", "history"],
    inputChars: 420,
  }, persist);
  rec.addSource("knowledge");
  rec.addTool("knowledge.search");
  await rec.success({ model: "google/gemini-2.5-flash", outputChars: 980 });

  assertEquals(events.length, 1);
  const e = events[0];
  assertEquals(e.status, "success");
  assertEquals(e.error_code, null);
  assertEquals(e.model, "google/gemini-2.5-flash");
  assertEquals(e.sources, ["crm", "history", "knowledge"]);
  assertEquals(e.tools_used, ["knowledge.search"]);
  assertEquals(e.input_chars, 420);
  assertEquals(e.output_chars, 980);
  assert(e.latency_ms >= 0);
  // Métricas não fornecidas ficam null (nunca estimadas)
  assertEquals(e.input_tokens, null);
  assertEquals(e.output_tokens, null);
  assertEquals(e.estimated_cost, null);
  for (const s of SENSITIVE) assert(!serialized(e).includes(s));
});

Deno.test("execução com erro gera status e código normalizado", async () => {
  const { events, persist } = captured();
  const rec = startAIExecution({ task: "diretor_comercial", userId: "u1" }, persist);
  const err = Object.assign(new Error("Rate limit"), { status: 429 });
  await rec.failure(err);
  assertEquals(events[0].status, "error");
  assertEquals(events[0].error_code, "rate_limited");
  assert(!serialized(events[0]).includes("Rate limit"));
});

Deno.test("normalizeErrorCode cobre casos comuns sem vazar mensagem", () => {
  assertEquals(normalizeErrorCode(Object.assign(new Error("x"), { status: 402 })), "credits_exhausted");
  assertEquals(normalizeErrorCode(Object.assign(new Error("x"), { status: 401 })), "unauthorized");
  assertEquals(normalizeErrorCode(new Error("Request timeout after 30s")), "timeout");
  assertEquals(normalizeErrorCode(new Error("embedding_500: boom")), "embedding_failed");
  assertEquals(normalizeErrorCode(new Error("lead João disse algo")), "unknown_error");
  assertEquals(normalizeErrorCode(null), "unknown_error");
});

Deno.test("falha ao persistir telemetry não quebra a execução", async () => {
  const rec = startAIExecution({ task: "knowledge_search", userId: "u1" }, async () => {
    throw new Error("db down");
  });
  // Não deve lançar
  await rec.success({ model: "m" });
  await rec.failure(new Error("boom"));
});

Deno.test("usuário não autenticado não gera evento", async () => {
  const { events, persist } = captured();
  const rec = startAIExecution({ task: "intel_router", userId: "" }, persist);
  await rec.success({ model: "m" });
  assertEquals(events.length, 0);
});

Deno.test("sources e tools aceitam somente identificadores agregados", () => {
  const e = buildEvent(
    {
      task: "auto_diagnose",
      userId: "u1",
      sources: ["knowledge", "chunk: cliente disse que o preço está alto", "memory"],
      toolsUsed: ["memory.retrieve", "conteúdo do anexo confidencial"],
    },
    { status: "success" },
    12,
    "exec-1",
  );
  assertEquals(e.sources, ["knowledge", "memory"]);
  assertEquals(e.tools_used, ["memory.retrieve"]);
});

Deno.test("campos livres são truncados e IDs inválidos viram null", () => {
  const e = buildEvent(
    {
      task: "t".repeat(200),
      userId: "u1",
      conversationId: "not-a-uuid",
      specialist: "consultor_leads",
      promptId: "p".repeat(200),
    },
    { status: "error", errorCode: "rate_limited", model: "m".repeat(300) },
    5,
    "exec-2",
  );
  assertEquals(e.conversation_id, null);
  assertEquals(e.task.length, 48);
  assertEquals(e.prompt_id!.length, 64);
  assertEquals(e.model!.length, 96);
  assertEquals(e.error_code, "rate_limited");
});

Deno.test("evento nunca contém conteúdo de pergunta/resposta/prompt", async () => {
  const { events, persist } = captured();
  const rec = startAIExecution({
    task: "extract_memory",
    userId: "u1",
    leadId: "lead-123",
    sources: ["memory"],
  }, persist);
  await rec.success({ model: "openai/gpt-5-mini", outputChars: SENSITIVE[1].length });
  const dump = serialized(events[0]);
  for (const s of SENSITIVE) assert(!dump.includes(s));
  assert(!/eyJ[A-Za-z0-9_-]{5,}/.test(dump));
});
