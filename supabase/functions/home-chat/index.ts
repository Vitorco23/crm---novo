// Home Chat ("Comando") — Sprint 3. Chat conversacional read-only da nova
// Home do CRM. Usa o AI Router existente (task: diretor_comercial, mesmo
// persona/tier do Diretor Comercial) e o Prompt Registry existente
// (intel.diretor.chat) — nenhum provedor/gateway novo foi adicionado.
//
// Importa os módulos do AI Core DIRETAMENTE (não via ./ai-core/index.ts):
// o barrel hoje re-exporta tool-registry.ts, que importa um
// knowledge-engine.ts inexistente no repositório — um problema pré-existente,
// não introduzido aqui. Esta function não usa knowledge.search/RAG, então
// evita esse import por completo.
//
// Read-only por construção: nenhuma tabela de lead/tarefa/reunião/meta é
// escrita aqui — a única ação possível é gerar texto de resposta.

import { callAI } from "../_shared/ai-router.ts";
import { requireUser } from "../_shared/require-auth.ts";
import { composeSystem } from "../_shared/ai-core/prompt-registry.ts";
import { buildChatContext, normalizeHistory, buildQuestionBlock } from "../_shared/ai-core/context-builder.ts";
import { buildUserContextBlock, parseUserContext } from "../_shared/ai-core/user-block.ts";
import { startAIExecution } from "../_shared/ai-core/observability.ts";
import { UNTRUSTED_INPUT_SYSTEM_CLAUSE, sanitizeExternal } from "../_shared/untrusted-input.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Sprint 3 — reforça, além do estilo já definido em intel.diretor.chat, o
// limite específico desta tela: somente leitura, nunca afirmar execução.
const READ_ONLY_CLAUSE = `# REGRA DESTA TELA (Home conversacional — Sprint 3)

Os dados fornecidos abaixo (SNAPSHOT OPERACIONAL DO CRM) são a fonte factual
real da operação agora. Nunca invente números ausentes — se um dado não
estiver no snapshot, diga que não tem essa informação.

Você é somente consultivo nesta conversa. Você pode recomendar, priorizar e
sugerir — nunca pode afirmar que executou uma ação no CRM (não moveu lead,
não concluiu tarefa, não criou follow-up, não agendou reunião, não enviou
mensagem, não ligou para ninguém). Use sempre linguagem de recomendação
("eu priorizaria", "eu ligaria para", "vale resolver") e nunca de execução
passada ("coloquei", "movi", "concluí", "agendei").

# BREVIDADE (obrigatória nesta tela)

O tamanho da resposta segue o tamanho da PERGUNTA, nunca o tamanho do
snapshot fornecido. O snapshot é grande de propósito — isso não significa
que a resposta deve usar tudo o que há nele.

- Pergunta simples/direta ("quem devo ligar agora?", "como estou na meta?")
  → responda em 2 a 4 frases corridas, sem título, sem bullets, sem seções.
  Cite no máximo 1 a 3 leads/números — não liste tudo que existe no snapshot.
- Só use títulos, bullets ou múltiplas seções quando a pergunta pedir
  explicitamente uma análise ampla (ex.: "analise meu pipeline inteiro").
- Nunca abra com título tipo "Leitura comercial" ou "O que eu faria agora"
  para uma pergunta curta — isso é formato de relatório, não de conversa.
- Não ofereça follow-up extra ("posso montar...", "se quiser...") em
  respostas curtas — só quando a resposta já for longa por necessidade real.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  const telemetry = startAIExecution({
    task: "diretor_comercial",
    userId: auth.userId,
    authHeader: req.headers.get("Authorization") ?? req.headers.get("authorization"),
    specialist: "diretor_comercial",
    promptId: "intel.diretor.chat",
    sources: ["crm", "history"],
    toolsUsed: [],
  });

  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) {
      return new Response(
        JSON.stringify({ error: "Mensagem ausente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const commercialContext = body?.commercialContext;
    if (!commercialContext || typeof commercialContext !== "object") {
      return new Response(
        JSON.stringify({ error: "Contexto comercial ausente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const history = normalizeHistory(body?.history);
    const userContextBlock = buildUserContextBlock(parseUserContext(body?.userContext));

    const context = buildChatContext({
      history,
      crm: { dashboardSnapshot: commercialContext, page: "home" },
    });

    const userPrompt =
      (userContextBlock ? userContextBlock + "\n\n" : "") +
      context.text +
      buildQuestionBlock(sanitizeExternal(message, 2000));

    let result;
    try {
      result = await callAI({
        task: "diretor_comercial",
        system: composeSystem("intel.diretor.chat", UNTRUSTED_INPUT_SYSTEM_CLAUSE, READ_ONLY_CLAUSE),
        user: userPrompt,
        json: false,
        temperature: 0.4,
        // Teto mais apertado que o painel diário — isso é conversa, não
        // relatório. O prompt já pede respostas curtas para perguntas
        // simples; este limite é a rede de segurança para isso.
        maxTokens: 700,
        inputChars: context.inputChars + message.length,
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      const status = err.status ?? 502;
      await telemetry.failure(err, { inputChars: userPrompt.length });
      const friendly =
        status === 429
          ? "Limite de requisições atingido. Tente novamente em instantes."
          : status === 402
          ? "Créditos de IA esgotados. Adicione créditos nas configurações do workspace."
          : "Não foi possível responder agora. Tente novamente em instantes.";
      return new Response(
        JSON.stringify({ error: friendly }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const content = (result.content || "").trim().slice(0, 6000);
    if (!content) {
      await telemetry.failure(new Error("empty_response"), { inputChars: userPrompt.length });
      return new Response(
        JSON.stringify({ error: "Não recebi uma resposta válida. Tente novamente." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await telemetry.success({
      model: result.modelUsed ?? null,
      inputChars: userPrompt.length,
      outputChars: content.length,
    });

    return new Response(
      JSON.stringify({ content, model: result.modelUsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(JSON.stringify({ evt: "home_chat_error", msg: (e as Error).message }));
    await telemetry.failure(e);
    return new Response(
      JSON.stringify({ error: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
