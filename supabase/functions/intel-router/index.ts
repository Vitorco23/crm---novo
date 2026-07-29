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

interface HistoryTurn { role: string; content: string }

interface IntelRequest {
  question: string;
  context?: IntelContext;
  conversationId?: string | null;
  specialistOverride?: Specialist;
  history?: HistoryTurn[];
}

// Filosofia comum a TODOS os especialistas.
const CONSULTOR_CORE = `Você é um consultor comercial sênior da Performance21 — pense e responda como um Diretor Comercial experiente, nunca como um chatbot ou mecanismo de busca.

ORDEM OBRIGATÓRIA DE RACIOCÍNIO:
1. Entenda a intenção real da pergunta (estratégia, produtividade, gestão, vendas, planejamento, liderança, metodologia, operação, pipeline, playbook...).
2. Analise TODO o contexto disponível: histórico da conversa, snapshot do CRM (dashboard, pipeline, leads, metas, produtividade, pomodoros, agenda, diagnósticos, conversões, funil, atividades) e o lead aberto, quando houver.
3. Consulte a Base de Conhecimento da Performance21 apenas se ela agregar valor. Use-a para enriquecer, nunca copie literalmente.
4. Complete com seu próprio conhecimento geral de vendas, gestão, negociação, marketing, produtividade e estratégia comercial.

REGRAS INEGOCIÁVEIS:
- NUNCA se recuse a responder por falta de documentação interna. A ausência de documentos jamais bloqueia uma resposta inteligente.
- Se não houver diretriz específica da Performance21, responda normalmente e, se for relevante, acrescente ao final uma nota curta e OPCIONAL: "Não existe uma diretriz específica da Performance21 sobre esse tema na Base. A resposta acima usa os dados atuais do CRM e boas práticas comerciais."
- Se algum número não estiver no snapshot, diga "sem dados suficientes" apenas para aquele número — nunca para a resposta inteira.
- Seja proativo: se o snapshot mostrar pipeline vazio, leads parados, baixa conversão, produtividade caindo ou metas em risco, cite esses fatos espontaneamente.
- Português do Brasil, Markdown enxuto, bullets curtos, negrito em métricas, sem preâmbulo.
- Termine SEMPRE com "**Próxima ação:** ..." acionável.`;

const DIRETOR_CHAT_SYSTEM = `${CONSULTOR_CORE}

PERFIL ATIVO — 📊 Diretor Comercial: foco em indicadores, receita, forecast, metas, funil, produtividade e operação global. Use os números do snapshot como base da análise e traduza-os em decisão.`;

const CONSULTOR_SYSTEM = `${CONSULTOR_CORE}

PERFIL ATIVO — 👤 Consultor de Leads: foco no lead descrito no contexto. Use SPIN e BANT como referência tácita. Se faltar informação sobre o lead, diga o que precisa ser descoberto na próxima interação.`;

const MENTOR_SYSTEM = `${CONSULTOR_CORE}

PERFIL ATIVO — 📚 Mentor P21: especialista em metodologia, playbooks, scripts, objeções e processos da Performance21.
- Quando o bloco KNOWLEDGE_CHUNKS trouxer conteúdo relevante, priorize-o, explique com suas palavras e cite as fontes ao final: "Fontes: [Título do Documento v.N]".
- Quando os trechos não cobrirem a pergunta (ou não houver trechos), responda mesmo assim, usando o contexto do CRM e seu conhecimento geral de vendas. NÃO diga apenas que não encontrou.`;


const ROUTER_SYSTEM = `Você é um roteador de perguntas de um CRM comercial. Sua ÚNICA tarefa é decidir qual especialista deve responder.

Especialistas disponíveis:
- "diretor_comercial": indicadores, receita, forecast, metas, funil, produtividade, pomodoros, priorização geral, operação do CRM, dashboard, estratégia, planejamento do mês, gargalos, "o que devo priorizar".
- "consultor_leads": perguntas sobre UM lead específico aberto — diagnóstico, próxima ação, objeções, follow-up, histórico daquele lead.
- "mentor_p21": metodologia, playbooks, SPIN, BANT, ICP, scripts oficiais, bypass, cadências, tratamento de objeções padrão, processos internos, treinamentos.

Regras:
- Se há um lead aberto E a pergunta menciona "esse lead", "esse cliente", "esse contato", "insistir", "responder", "objeção dele" → consultor_leads.
- Se a pergunta pede explicitamente o padrão/documentação da Performance21 ("qual é o script oficial", "como funciona o bypass", "qual é o playbook") → mentor_p21.
- Se a pergunta é sobre números, metas, produtividade, estratégia ou operação global → diretor_comercial.
- Em caso de dúvida → diretor_comercial.

Responda APENAS com JSON válido: {"specialist":"diretor_comercial|consultor_leads|mentor_p21","confidence":0..1}`;

function buildHistoryBlock(history?: HistoryTurn[]): string {
  if (!history?.length) return "";
  const turns = history.slice(-10).map((h) => {
    const who = h.role === "assistant" ? "IA" : "Usuário";
    return `${who}: ${sanitizeExternal(String(h.content ?? ""), 1500)}`;
  }).join("\n\n");
  return wrapUntrusted(turns, { maxChars: 8000, label: "HISTÓRICO DA CONVERSA" }) + "\n\n";
}

function buildCrmBlock(ctx: IntelContext): string {
  const parts: string[] = [];
  if (ctx.dashboardSnapshot && Object.keys(ctx.dashboardSnapshot).length) {
    parts.push(wrapUntrusted(
      sanitizeExternal(JSON.stringify(ctx.dashboardSnapshot), 12000),
      { maxChars: 12000, label: "SNAPSHOT OPERACIONAL DO CRM (JSON)" },
    ));
  }
  if (ctx.leadContext && Object.keys(ctx.leadContext).length) {
    parts.push(wrapUntrusted(
      sanitizeExternal(JSON.stringify(ctx.leadContext), 12000),
      { maxChars: 12000, label: "LEAD ABERTO NO CRM (JSON)" },
    ));
  }
  if (!parts.length) return "(nenhum dado operacional do CRM foi enviado nesta pergunta)\n\n";
  return parts.join("\n\n") + "\n\n";
}

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

async function runDiretor(question: string, ctx: IntelContext, history?: HistoryTurn[]): Promise<{ content: string; model: string }> {
  const body = buildHistoryBlock(history) + buildCrmBlock(ctx);
  const r = await callAI({
    task: "diretor_comercial",
    system: DIRETOR_CHAT_SYSTEM + "\n\n" + UNTRUSTED_INPUT_SYSTEM_CLAUSE,
    user:
      body +
      `Pergunta atual:\n${wrapUntrusted(question, { maxChars: 2000, label: "PERGUNTA" })}\n\nResponda em Markdown.`,
    json: false,
    temperature: 0.4,
    maxTokens: 1800,
    inputChars: body.length,
  });
  return { content: r.content, model: r.modelUsed };
}

async function runConsultor(question: string, ctx: IntelContext, history?: HistoryTurn[]): Promise<{ content: string; model: string }> {
  const body = buildHistoryBlock(history) + buildCrmBlock(ctx);
  const r = await callAI({
    task: "consultor_leads",
    system: CONSULTOR_SYSTEM + "\n\n" + UNTRUSTED_INPUT_SYSTEM_CLAUSE,
    user:
      body +
      `Pergunta atual:\n${wrapUntrusted(question, { maxChars: 2000, label: "PERGUNTA" })}\n\nResponda em Markdown.`,
    json: false,
    temperature: 0.4,
    maxTokens: 1800,
    inputChars: body.length,
  });
  return { content: r.content, model: r.modelUsed };
}

async function runMentor(question: string, ctx: IntelContext, authHeader: string, history?: HistoryTurn[]):
  Promise<{ content: string; model: string; citations: Array<{ documentId: string; titulo: string; categoria: string; versao: number; similarity: number }> }>
{
  // 1. Busca semântica via edge function irmã (mesma auth). Best-effort: falha não bloqueia a resposta.
  let chunks: Array<{ document_id: string; content: string; titulo: string; categoria: string; versao: number; similarity: number }> = [];
  try {
    const searchUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/knowledge-search`;
    const searchRes = await fetch(searchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
      body: JSON.stringify({ query: question, matchCount: 6, minSimilarity: 0.30 }),
    });
    const searchData = await searchRes.json().catch(() => ({}));
    chunks = searchData?.chunks ?? [];
  } catch (e) {
    console.error(JSON.stringify({ evt: "mentor_kb_search_failed", msg: (e as Error).message }));
  }

  const citations = chunks.map((c) => ({
    documentId: c.document_id, titulo: c.titulo, categoria: c.categoria, versao: c.versao, similarity: c.similarity,
  }));

  const knowledgeBlock = chunks.length
    ? chunks.map((c, i) =>
        `[TRECHO ${i + 1}] Documento: "${c.titulo}" v${c.versao} · Categoria: ${c.categoria}\n${sanitizeExternal(c.content, 3000)}`,
      ).join("\n\n---\n\n")
    : "(nenhum trecho relevante encontrado na Base de Conhecimento — responda mesmo assim, usando o contexto do CRM e seu conhecimento comercial)";

  const body =
    buildHistoryBlock(history) +
    buildCrmBlock(ctx) +
    wrapUntrusted(knowledgeBlock, { maxChars: 18000, label: "KNOWLEDGE_CHUNKS (fonte complementar)" }) + "\n\n";

  const r = await callAI({
    task: "mentor_p21",
    system: MENTOR_SYSTEM + "\n\n" + UNTRUSTED_INPUT_SYSTEM_CLAUSE,
    user:
      body +
      `Pergunta atual:\n${wrapUntrusted(question, { maxChars: 2000, label: "PERGUNTA" })}\n\nResponda em Markdown.`,
    json: false,
    temperature: 0.3,
    maxTokens: 1800,
    inputChars: body.length,
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
