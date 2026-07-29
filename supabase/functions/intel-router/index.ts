// intel-router — Central de Inteligência.
// Classifica a pergunta e delega para o especialista correto.
// Nunca modifica funções existentes; usa apenas o AI Router compartilhado.

import { createClient } from "npm:@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-router.ts";
import { requireUser } from "../_shared/require-auth.ts";
import {
  UNTRUSTED_INPUT_SYSTEM_CLAUSE, wrapUntrusted, sanitizeExternal, safeParseJson,
} from "../_shared/untrusted-input.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Specialist = "diretor_comercial" | "consultor_leads" | "mentor_p21";

interface IntelContext {
  page?: string;
  leadContext?: Record<string, unknown> | null;
  dashboardSnapshot?: Record<string, unknown> | null;
}

interface IntelRequest {
  question: string;
  context?: IntelContext;
  conversationId?: string | null;
  specialistOverride?: Specialist;
}

const ROUTER_SYSTEM = `Você é um roteador de perguntas de um CRM comercial. Sua ÚNICA tarefa é decidir qual especialista deve responder.

Especialistas disponíveis:
- "diretor_comercial": indicadores, receita, forecast, metas, funil, produtividade, pomodoros, priorização geral, operação do CRM, dashboard.
- "consultor_leads": perguntas sobre UM lead específico aberto — diagnóstico, próxima ação, objeções, follow-up, histórico daquele lead.
- "mentor_p21": metodologia, playbooks, SPIN, BANT, ICP, scripts, cadências, engenharia de receita, boas práticas, treinamentos, processos internos.

Regras:
- Se há um lead aberto E a pergunta menciona "esse lead", "esse cliente", "esse contato", "insistir", "responder", "objeção dele" → consultor_leads.
- Se a pergunta é sobre metodologia, "como funciona", "o que é", "monte um script", "como abordar" → mentor_p21.
- Se a pergunta é sobre números, metas, produtividade, operação global → diretor_comercial.
- Em caso de dúvida entre diretor e mentor → diretor_comercial.

Responda APENAS com JSON válido: {"specialist":"diretor_comercial|consultor_leads|mentor_p21","confidence":0..1}`;

const DIRETOR_CHAT_SYSTEM = `Você é o Diretor Comercial da Performance21 conversando com o dono da operação.
- Responda em português do Brasil, tom consultivo, direto.
- Baseie-se APENAS nos números do snapshot fornecido. Se algo não está no snapshot, diga "sem dados suficientes".
- Use Markdown enxuto: bullets curtos, negritos em métricas, sem preâmbulo.
- Termine com UMA recomendação prática, no formato "**Próxima ação:** ..."`;

const CONSULTOR_SYSTEM = `Você é o Consultor de Leads da Performance21.
- Foco ABSOLUTO no lead descrito no contexto abaixo. Nunca fale sobre indicadores globais.
- Use SPIN e BANT como referência tácita.
- Português do Brasil, tom consultivo, direto, Markdown enxuto.
- Se faltar informação, diga o que precisa ser descoberto na próxima interação.
- Termine com "**Próxima ação:** ..." acionável.`;

const MENTOR_SYSTEM = `Você é o Mentor P21 — consultor interno da Performance21.
- Responda EXCLUSIVAMENTE com base nos trechos da Base de Conhecimento fornecidos abaixo (bloco KNOWLEDGE_CHUNKS).
- Nunca invente metodologia. Se os trechos não cobrem a pergunta, responda literalmente:
  "Não encontrei esse conhecimento na Base da Performance21. Posso responder de forma geral, mas recomendo adicionar esse conteúdo à Knowledge Base para manter a padronização." e então dê uma resposta geral breve.
- Sempre cite as fontes ao final no formato: "Fontes: [Título do Documento v.N]".
- Português do Brasil, Markdown enxuto.`;

async function classify(question: string, ctx: IntelContext): Promise<Specialist> {
  const ctxSummary = {
    page: ctx.page ?? null,
    hasLead: !!ctx.leadContext,
    hasDashboard: !!ctx.dashboardSnapshot,
  };
  const result = await callAI({
    task: "intel_router",
    system: ROUTER_SYSTEM,
    user:
      `Contexto: ${JSON.stringify(ctxSummary)}\n` +
      `Pergunta:\n${wrapUntrusted(question, { maxChars: 2000, label: "PERGUNTA DO USUÁRIO" })}\n` +
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

async function runDiretor(question: string, snapshot: unknown): Promise<{ content: string; model: string }> {
  const snapshotSafe = sanitizeExternal(JSON.stringify(snapshot ?? {}), 12000);
  const r = await callAI({
    task: "diretor_comercial",
    system: DIRETOR_CHAT_SYSTEM + "\n\n" + UNTRUSTED_INPUT_SYSTEM_CLAUSE,
    user:
      wrapUntrusted(snapshotSafe, { maxChars: 12000, label: "SNAPSHOT OPERACIONAL (JSON)" }) +
      `\n\nPergunta:\n${wrapUntrusted(question, { maxChars: 2000, label: "PERGUNTA" })}\n\nResponda em Markdown.`,
    json: false,
    temperature: 0.3,
    maxTokens: 1500,
  });
  return { content: r.content, model: r.modelUsed };
}

async function runConsultor(question: string, leadContext: unknown): Promise<{ content: string; model: string }> {
  const ctxSafe = sanitizeExternal(JSON.stringify(leadContext ?? {}), 12000);
  const r = await callAI({
    task: "consultor_leads",
    system: CONSULTOR_SYSTEM + "\n\n" + UNTRUSTED_INPUT_SYSTEM_CLAUSE,
    user:
      wrapUntrusted(ctxSafe, { maxChars: 12000, label: "CONTEXTO DO LEAD (JSON)" }) +
      `\n\nPergunta do usuário:\n${wrapUntrusted(question, { maxChars: 2000, label: "PERGUNTA" })}\n\nResponda em Markdown.`,
    json: false,
    temperature: 0.4,
    maxTokens: 1500,
  });
  return { content: r.content, model: r.modelUsed };
}

async function runMentor(question: string, apiKey: string, authHeader: string):
  Promise<{ content: string; model: string; citations: Array<{ documentId: string; titulo: string; categoria: string; versao: number; similarity: number }> }>
{
  // 1. Busca semântica via edge function irmã (mesma auth)
  const searchUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/knowledge-search`;
  const searchRes = await fetch(searchUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
    body: JSON.stringify({ query: question, matchCount: 6, minSimilarity: 0.30 }),
  });
  const searchData = await searchRes.json().catch(() => ({}));
  const chunks: Array<{ document_id: string; content: string; titulo: string; categoria: string; versao: number; similarity: number }>
    = searchData?.chunks ?? [];

  const citations = chunks.map((c) => ({
    documentId: c.document_id, titulo: c.titulo, categoria: c.categoria, versao: c.versao, similarity: c.similarity,
  }));

  const knowledgeBlock = chunks.length
    ? chunks.map((c, i) =>
        `[TRECHO ${i + 1}] Documento: "${c.titulo}" v${c.versao} · Categoria: ${c.categoria}\n${sanitizeExternal(c.content, 3000)}`,
      ).join("\n\n---\n\n")
    : "(nenhum trecho relevante encontrado na Base de Conhecimento)";

  const r = await callAI({
    task: "mentor_p21",
    system: MENTOR_SYSTEM + "\n\n" + UNTRUSTED_INPUT_SYSTEM_CLAUSE,
    user:
      wrapUntrusted(knowledgeBlock, { maxChars: 18000, label: "KNOWLEDGE_CHUNKS" }) +
      `\n\nPergunta:\n${wrapUntrusted(question, { maxChars: 2000, label: "PERGUNTA" })}\n\nResponda em Markdown.`,
    json: false,
    temperature: 0.2,
    maxTokens: 1500,
    inputChars: knowledgeBlock.length,
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

    const ctx: IntelContext = body.context ?? {};
    const specialist: Specialist = body.specialistOverride
      ?? await classify(question, ctx);

    const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization")!;

    let content = "";
    let model = "";
    let citations: unknown = null;

    if (specialist === "diretor_comercial") {
      const r = await runDiretor(question, ctx.dashboardSnapshot ?? {});
      content = r.content; model = r.model;
    } else if (specialist === "consultor_leads") {
      if (!ctx.leadContext) {
        content = "⚠️ Nenhum lead aberto. Abra um lead no CRM e faça a pergunta novamente para eu consultar diagnóstico, memória e próxima ação daquele lead.";
        model = "n/a";
      } else {
        const r = await runConsultor(question, ctx.leadContext);
        content = r.content; model = r.model;
      }
    } else {
      const r = await runMentor(question, apiKey, authHeader);
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
          context_snapshot: {
            page: ctx.page ?? null,
            hasLead: !!ctx.leadContext,
            hasDashboard: !!ctx.dashboardSnapshot,
          },
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
