// intel-router — Central de Inteligência.
// Classifica a pergunta e delega para o especialista correto.
// Fase 3A (Phoenix): contexto, prompts e ferramentas vêm do AI Core compartilhado.
// Contrato público da função (rota, payload e retorno) permanece inalterado.

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
  type KnowledgeCitation,
  type SpecialistId,
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

async function classify(question: string, ctx: CrmContext): Promise<SpecialistId> {
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
  const parsed = safeParseJson<{ specialist?: string }>(result.content);
  const s = parsed?.specialist;
  if (s === "diretor_comercial" || s === "consultor_leads" || s === "mentor_p21") return s;
  // fallback conservador
  return ctx.leadContext ? "consultor_leads" : "diretor_comercial";
}

async function runDiretor(question: string, ctx: CrmContext, history?: ConversationTurn[]) {
  const built = buildChatContext({ history, crm: ctx });
  const r = await callAI({
    task: "diretor_comercial",
    system: composeSystem("intel.diretor.chat", UNTRUSTED_INPUT_SYSTEM_CLAUSE),
    user: built.text + `Pergunta atual:\n${buildQuestionBlock(question)}\n\nResponda em Markdown.`,
    json: false,
    temperature: 0.4,
    maxTokens: 1800,
    inputChars: built.inputChars,
  });
  return r;
}

async function runConsultor(question: string, ctx: CrmContext, history?: ConversationTurn[]) {
  const built = buildChatContext({ history, crm: ctx });
  const r = await callAI({
    task: "consultor_leads",
    system: composeSystem("intel.consultor.chat", UNTRUSTED_INPUT_SYSTEM_CLAUSE),
    user: built.text + `Pergunta atual:\n${buildQuestionBlock(question)}\n\nResponda em Markdown.`,
    json: false,
    temperature: 0.4,
    maxTokens: 1800,
    inputChars: built.inputChars,
  });
  return r;
}

async function runMentor(question: string, ctx: CrmContext, authHeader: string, history?: ConversationTurn[]):
  Promise<{ content: string; modelUsed: string; citations: KnowledgeCitation[]; promptTokens?: number; completionTokens?: number }>
{
  // Ferramenta autorizada pelo Tool Registry. Best-effort: falha não bloqueia a resposta.
  // Fase 3C: engine com cache por execução + governança da Knowledge Platform.
  const { chunks, citations } = await runKnowledgeSearch({
    specialist: "mentor_p21",
    query: question,
    authHeader,
    matchCount: 6,
    minSimilarity: 0.30,
    engine: createKnowledgeEngineForSpecialist(),
  });

  const built = buildChatContext({ history, crm: ctx, knowledgeChunks: chunks });
  const r = await callAI({
    task: "mentor_p21",
    system: composeSystem("intel.mentor.chat", UNTRUSTED_INPUT_SYSTEM_CLAUSE),
    user: built.text + `Pergunta atual:\n${buildQuestionBlock(question)}\n\nResponda em Markdown.`,
    json: false,
    temperature: 0.3,
    maxTokens: 1800,
    inputChars: built.inputChars,
  });
  return { ...r, citations };
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

  console.log(`[IntelRouter] Pergunta recebida do usuário: ${auth.userId}`);

  try {
    const body = (await req.json().catch(() => ({}))) as IntelRequest;
    const question = String(body.question ?? "").trim();
    if (!question) {
      return new Response(JSON.stringify({ error: "question_required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (question.length > 4000) {
      return new Response(JSON.stringify({ error: "question_too_long" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ctx: CrmContext = body.context ?? {};
    console.log(`[IntelRouter] Classificando especialista para pergunta de ${question.length} chars...`);
    const specialist: SpecialistId = body.specialistOverride
      ?? await classify(question, ctx);

    console.log(`[IntelRouter] Especialista selecionado: ${specialist}`);

    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization")!;
    const history = normalizeHistory(body.history);

    // Observabilidade: somente metadados agregados (Fase 3D.1).
    telemetry.setSpecialist(specialist);
    telemetry.setConversation(body.conversationId ?? null);
    if (ctx && Object.keys(ctx).length) telemetry.addSource("crm");
    if (ctx.leadContext) telemetry.addSource("lead");
    if (history.length) telemetry.addSource("history");

    let content = "";
    let model = "";
    let citations: unknown = null;
    let tokensIn = 0;
    let tokensOut = 0;

    if (specialist === "diretor_comercial") {
      const r = await runDiretor(question, ctx, history);
      content = r.content; model = r.modelUsed;
      tokensIn = r.promptTokens ?? 0; tokensOut = r.completionTokens ?? 0;
    } else if (specialist === "consultor_leads") {
      if (!ctx.leadContext) {
        // Sem lead aberto: não bloqueia — responde como Diretor Comercial com o contexto disponível.
        const r = await runDiretor(question, ctx, history);
        content = r.content; model = r.modelUsed;
        tokensIn = r.promptTokens ?? 0; tokensOut = r.completionTokens ?? 0;
      } else {
        const r = await runConsultor(question, ctx, history);
        content = r.content; model = r.modelUsed;
        tokensIn = r.promptTokens ?? 0; tokensOut = r.completionTokens ?? 0;
      }
    } else {
      const r = await runMentor(question, ctx, authHeader, history);
      content = r.content; model = r.modelUsed; citations = r.citations;
      tokensIn = r.promptTokens ?? 0; tokensOut = r.completionTokens ?? 0;
      telemetry.addSource("knowledge");
      telemetry.addTool("knowledge.search");
    }

    console.log(`[IntelRouter] Resposta gerada. Modelo: ${model}. Chars: ${content.length}`);

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
          content,
          specialist,
          citations,
          model_used: model,
        },
      ]);
    }

    await telemetry.success({
      model: model || null,
      inputChars: question.length,
      outputChars: content.length,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
    });

    return new Response(JSON.stringify({
      specialist, content, model, citations,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(`[IntelRouter] ERRO:`, e);
    await telemetry.failure(e);
    const errInfo = telemetry.formatError(e);
    
    return new Response(JSON.stringify({
      error: errInfo.error,
      message: errInfo.message,
      code: errInfo.code,
      stack: (e as Error).stack
    }), { status: errInfo.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});