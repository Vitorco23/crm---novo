// intel-router — Central de Inteligência.
// Classifica a pergunta e delega para o especialista correto.
// Fase 3A (Phoenix): contexto, prompts e ferramentas vêm do AI Core compartilhado.
// Contrato público da função (rota, payload e retorno) permanece inalterado.

import { createClient } from "npm:@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-router.ts";
import { requireUser } from "../_shared/require-auth.ts";
import { UNTRUSTED_INPUT_SYSTEM_CLAUSE, safeParseJson } from "../_shared/untrusted-input.ts";
import {
  buildChatContext,
  buildQuestionBlock,
  composeSystem,
  normalizeHistory,
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
  return { content: r.content, model: r.modelUsed };
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
  return { content: r.content, model: r.modelUsed };
}

async function runMentor(question: string, ctx: CrmContext, authHeader: string, history?: ConversationTurn[]):
  Promise<{ content: string; model: string; citations: KnowledgeCitation[] }>
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
  return { content: r.content, model: r.modelUsed, citations };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

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
    const specialist: SpecialistId = body.specialistOverride
      ?? await classify(question, ctx);

    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization")!;
    const history = normalizeHistory(body.history);

    let content = "";
    let model = "";
    let citations: unknown = null;

    if (specialist === "diretor_comercial") {
      const r = await runDiretor(question, ctx, history);
      content = r.content; model = r.model;
    } else if (specialist === "consultor_leads") {
      if (!ctx.leadContext) {
        // Sem lead aberto: não bloqueia — responde como Diretor Comercial com o contexto disponível.
        const r = await runDiretor(question, ctx, history);
        content = r.content; model = r.model;
      } else {
        const r = await runConsultor(question, ctx, history);
        content = r.content; model = r.model;
      }
    } else {
      const r = await runMentor(question, ctx, authHeader, history);
      content = r.content; model = r.model; citations = r.citations;
    }

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

    return new Response(JSON.stringify({
      specialist, content, model, citations,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const err = e as Error & { status?: number };
    const status = err.status ?? 500;
    console.error(JSON.stringify({ evt: "intel_router_error", msg: err.message }));
    return new Response(JSON.stringify({
      error: status === 429 ? "rate_limited"
           : status === 402 ? "credits_exhausted"
           : "internal_error",
    }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
