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

# BREVIDADE E FORMATO (obrigatório nesta tela — leia com atenção)

O tamanho da resposta segue o tamanho da PERGUNTA, nunca o tamanho do
snapshot fornecido. O snapshot é grande de propósito — isso não significa
que a resposta deve usar tudo o que há nele. Esta é uma CONVERSA, nunca um
relatório executivo.

Existem só 3 formatos permitidos nesta tela — escolha um:

1. RESPOSTA DIRETA (perguntas de status/sim-não/"como estou")
   2 a 4 frases corridas. Sem título. Sem bullets. Cite no máximo 1 a 2
   números do snapshot — não recite o snapshot inteiro.

2. LISTA CURTA (perguntas que pedem ordem/prioridade entre vários leads —
   ex.: "quais follow-ups", "quem merece atenção", "quais oportunidades")
   Uma frase de abertura (≤ 1 linha) + até 5 itens, CADA UM EM UMA ÚNICA
   LINHA neste formato exato, sem sub-bullets, sem parágrafo de motivo
   separado:
   \`N. **Empresa** — ação recomendada · motivo em até 6 palavras\`
   Pare em 5 itens. Não crie uma segunda seção tipo "depois disso" com
   mais leads. Não adicione uma seção de "leitura comercial" depois da
   lista — se a lista já responde, a resposta acaba na lista.

3. ANÁLISE (só quando a pergunta pedir explicitamente algo amplo, ex.:
   "analise meu pipeline inteiro", "como está minha operação")
   Pode usar 2-3 títulos curtos e bullets — ainda assim, sem passar de
   ~120 palavras por seção.

FORMATAÇÃO MARKDOWN — regra técnica obrigatória:
Cada item de lista PRECISA ser uma linha de lista Markdown real, começando
com "- " (bullet) ou "1. "/"2. " (numerada). NUNCA use apenas uma quebra de
linha simples entre itens — isso vira um parágrafo só, ilegível, quando
renderizado. Errado (quebra de linha simples, sem marcador):
  Domus — Responder no WhatsApp
  Toroloko Burger — Enviar WhatsApp hoje
Certo (lista Markdown real):
  - **Domus** — Responder no WhatsApp
  - **Toroloko Burger** — Enviar WhatsApp hoje

Regras que valem para os 3 formatos:
- Nunca abra com título tipo "Leitura comercial", "Minha leitura" ou
  "O que eu faria agora" fora do formato 3.
- Nunca ofereça follow-up extra ("posso montar...", "se quiser eu...") —
  só responda o que foi perguntado.
- Se a pergunta é dos formatos 1 ou 2, uma resposta maior que isso está
  ERRADA, mesmo que o snapshot tenha mais dados para usar.`;

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
        // Teto bem mais apertado que o painel diário — isso é conversa,
        // não relatório. O prompt já força um dos 3 formatos compactos;
        // este limite é a rede de segurança para isso.
        maxTokens: 500,
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
