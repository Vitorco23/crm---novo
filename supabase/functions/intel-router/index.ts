// intel-router — Central de Inteligência.
// Classifica a pergunta e delega para o especialista correto.
// Fase 4: Observabilidade, RAG otimizado e Auditoria de contexto.

import { createClient } from "npm:@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-router.ts";
import { requireUser } from "../_shared/require-auth.ts";
import { startAIExecution } from "../_shared/ai-core/observability.ts";
import { UNTRUSTED_INPUT_SYSTEM_CLAUSE, safeParseJson } from "../_shared/untrusted-input.ts";
import {
  buildChatContext,
  buildQuestionBlock,
  composeSystem,
  normalizeHistory,
  createKnowledgeEngineForSpecialist,
  runKnowledgeSearch,
  summarizeContext,
  type ConversationTurn,
  type CrmContext,
  type SpecialistId,
  type IntelIntent,
} from "../_shared/ai-core/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface IntelRequest {
  question: string;
  context?: CrmContext;
  conversationId?: string | null;
  specialistOverride?: SpecialistId;
  history?: ConversationTurn[];
}

async function classify(question: string, ctx: CrmContext): Promise<{ specialist: SpecialistId; intent: IntelIntent }> {
  const result = await callAI({
    task: "intel_router",
    system: composeSystem("intel.router.classifier"),
    user:
      `Contexto: ${JSON.stringify(summarizeContext(ctx))}\n` +
      `Pergunta:\n${buildQuestionBlock(question, "PERGUNTA DO USUÁRIO")}\n` +
      `Responda apenas JSON.`,
    json: true,
    temperature: 0.1,
    maxTokens: 200,
    inputChars: question.length,
  });
  const parsed = safeParseJson<{ specialist?: string; intent?: string }>(result.content);
  
  let s = parsed?.specialist as SpecialistId;
  if (!["diretor_comercial", "consultor_leads", "mentor_p21"].includes(s)) {
    s = ctx.leadContext ? "consultor_leads" : "diretor_comercial";
  }

  let intent = (parsed?.intent ?? "outra") as IntelIntent;
  
  return { specialist: s, intent };
}

async function runSpecialist(
  specialist: SpecialistId,
  intent: IntelIntent,
  question: string, 
  ctx: CrmContext, 
  authHeader: string,
  history?: ConversationTurn[]
) {
  const startTime = Date.now();
  // 1. RAG Global: Sempre pesquisa se a intenção envolver conhecimento institucional.
  const needsKnowledge = ["metodologia", "objecoes", "script_comunicacao", "prescricao_oferta", "conselho_estrategia", "lead_especifico"].includes(intent) || specialist === "mentor_p21";
  
  let chunks: any[] = [];
  let citations: any = null;
  let knowledgeStatus: "found" | "none" | "skipped" = "skipped";

  if (needsKnowledge) {
    const res = await runKnowledgeSearch({
      specialist,
      query: question,
      authHeader,
      matchCount: 8,
      minSimilarity: 0.25,
      engine: createKnowledgeEngineForSpecialist(),
    });
    chunks = res.chunks;
    citations = res.citations;
    knowledgeStatus = chunks.length > 0 ? "found" : "none";
  }

  // 2. Context Gating de Verdade: Seleção de dados por intenção
  const reducedCtx = { ...ctx, intent };
  const operationalUsed: string[] = [];
  
  // Decisão de carregamento baseada em intenção
  const isStrategic = intent === "conselho_estrategia";
  const isOperational = intent === "operacao_metricas";
  const isLeadSpecific = intent === "lead_especifico";
  const isRAGFocused = ["metodologia", "objecoes", "script_comunicacao"].includes(intent);

  if (isRAGFocused) {
    // Perguntas puramente metodológicas não precisam de dashboard global
    reducedCtx.dashboardSnapshot = null;
  } else if (isLeadSpecific && !question.toLowerCase().includes("comparar")) {
    // Foco no lead específico, remove dashboard global salvo se pedir comparação
    reducedCtx.dashboardSnapshot = null;
  } else if (isStrategic) {
    // Redução de ancoragem: mantém dashboard mas marcará como estratégico no builder
    operationalUsed.push("strategic_metrics");
  } else if (isOperational) {
    operationalUsed.push("full_dashboard");
  }

  if (reducedCtx.dashboardSnapshot) operationalUsed.push("dashboard");
  if (reducedCtx.leadContext) operationalUsed.push("lead");

  const built = buildChatContext({ history, crm: reducedCtx, knowledgeChunks: chunks });

  
  const promptId = specialist === "diretor_comercial" ? "intel.diretor.chat" 
                 : specialist === "consultor_leads" ? "intel.consultor.chat" 
                 : "intel.mentor.chat";

  const r = await callAI({
    task: specialist as any,
    system: composeSystem(promptId, UNTRUSTED_INPUT_SYSTEM_CLAUSE),
    user: built.text + `Pergunta atual:\n${buildQuestionBlock(question)}\n\nResponda em Markdown.`,
    json: false,
    temperature: specialist === "mentor_p21" ? 0.3 : 0.4,
    maxTokens: 1800,
    inputChars: built.inputChars,
  });

  const observability = {
    intention: intent,
    specialist,
    knowledge_result: knowledgeStatus,
    operational_data: operationalUsed,
    context_size_chars: built.inputChars,
    latency_ms: Date.now() - startTime,
    model: r.modelUsed,
    knowledge_sources: citations?.map((c: any) => ({
      document_id: c.documentId,
      titulo: c.titulo,
      categoria: c.categoria,
      similarity: c.similarity
    })) ?? []
  };

  return { content: r.content, model: r.modelUsed, citations, observability };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  const authHeaderRaw = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const telemetry = startAIExecution({
    task: "intel_router",
    userId: auth.userId,
    authHeader: authHeaderRaw,
  });

  try {
    const body = (await req.json().catch(() => ({}))) as IntelRequest;
    const question = String(body.question ?? "").trim();
    if (!question) {
      return new Response(JSON.stringify({ error: "question_required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ctx: CrmContext = body.context ?? {};
    const { specialist, intent } = body.specialistOverride 
      ? { specialist: body.specialistOverride, intent: "outra" as IntelIntent }
      : await classify(question, ctx);

    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization")!;
    const history = normalizeHistory(body.history);

    telemetry.setSpecialist(specialist);
    telemetry.setConversation(body.conversationId ?? null);
    
    const r = await runSpecialist(specialist, intent, question, ctx, authHeader, history);
    
    // Persiste user + assistant se houver conversationId
    if (body.conversationId) {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
      );
      await sb.from("intel_messages").insert([
        {
          conversation_id: body.conversationId,
          role: "user",
          content: question,
          specialist,
          context_snapshot: summarizeContext(ctx),
        },
        {
          conversation_id: body.conversationId,
          role: "assistant",
          content: r.content,
          specialist,
          citations: r.citations,
          model_used: r.model,
          observability: r.observability,
        },
      ]);
    }

    await telemetry.success({
      model: r.model || null,
      inputChars: question.length,
      outputChars: r.content.length,
    });

    return new Response(JSON.stringify({
      specialist, 
      content: r.content, 
      model: r.model, 
      citations: r.citations,
      observability: r.observability,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const err = e as Error & { status?: number };
    const status = err.status ?? 500;
    console.error(JSON.stringify({ evt: "intel_router_error", msg: err.message }));
    await telemetry.failure(err);
    return new Response(JSON.stringify({
      error: status === 429 ? "rate_limited"
           : status === 402 ? "credits_exhausted"
           : "internal_error",
    }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
