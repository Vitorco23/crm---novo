// Home Chat ("Comando") — versão Gemini 2.5 Flash via Google AI Studio
// DIRETO (branch migracao-gemini). Duplicata deliberada de home-chat/
// index.ts, não uma edição — a function original continua servindo o
// Lovable/produção sem nenhuma alteração, já que os dois compartilham o
// mesmo projeto Supabase. Prompt e regras de formato são IDÊNTICOS ao
// original; a única coisa que muda é qual IA responde (callGeminiDirect em
// vez de callAI/AI Router) e o formato do schema estruturado (Gemini usa um
// subconjunto de OpenAPI 3.0, não o JSON Schema estrito da OpenAI).
//
// Read-only por construção: nenhuma tabela de lead/tarefa/reunião/meta é
// escrita aqui — a única ação possível é gerar texto de resposta.

import { callGeminiDirect, GeminiCallError, type GeminiSchema } from "../_shared/gemini-direct.ts";
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

// Mesmo prompt de home-chat/index.ts, verbatim — nenhuma regra de negócio
// nova. Só copiado aqui porque as duas functions rodam isoladas (Deno Deploy
// não compartilha módulo entre functions fora de _shared/).
const READ_ONLY_CLAUSE = `# REGRA DESTA TELA (Home conversacional)

Os dados fornecidos abaixo (SNAPSHOT OPERACIONAL DO CRM) são a fonte factual
real da operação agora. Nunca invente números ausentes — se um dado não
estiver no snapshot, diga que não tem essa informação.

Você é somente consultivo nesta conversa. Você pode recomendar, priorizar e
sugerir — nunca pode afirmar que executou uma ação no CRM (não moveu lead,
não concluiu tarefa, não criou follow-up, não agendou reunião, não enviou
mensagem, não ligou para ninguém). Use sempre linguagem de recomendação
("eu priorizaria", "eu ligaria para", "vale resolver") e nunca de execução
passada ("coloquei", "movi", "concluí", "agendei").

# FORMATO DE SAÍDA — resposta estruturada (obrigatório, sempre 3 campos)

O tamanho da resposta segue o tamanho da PERGUNTA, nunca o tamanho do
snapshot fornecido. O snapshot é grande de propósito — isso não significa
que a resposta deve usar tudo o que há nele. Esta é uma CONVERSA, nunca um
relatório executivo.

1. "texto_narrativo" — 1 a 2 frases em linguagem natural e direta, como se
   você estivesse comentando o resultado com a pessoa, não abrindo um
   relatório. Nunca comece com "Prioridade:", "Análise:" ou título em
   caixa alta, e nunca use markdown (sem **negrito**, sem listas, sem
   títulos) — é texto corrido puro. Cite no máximo 1 a 2 números aqui; os
   números de cada lead vão em "itens", não aqui.
   Tom de exemplo: "Hoje você tem 5 follow-ups que valem atenção — dois já
   estão atrasados e com boa chance de resposta rápida."
   Só quando a pergunta pedir uma análise ampla e explícita (ex.: "analise
   meu pipeline inteiro", "como está minha operação") este campo pode ter
   até 3 parágrafos curtos (separe parágrafos com uma linha em branco) —
   continua sem títulos e sem markdown.

2. "itens" — 0 a 5 cards, USADOS SOMENTE quando a resposta envolve
   leads/oportunidades específicos (priorização, follow-ups, "quem devo
   ligar", oportunidades esfriando). Perguntas de status simples ("como
   estou na meta?", "quantas ligações fiz?") devem devolver itens: [].
   Nunca ultrapasse 5 itens — se houver mais candidatos no snapshot,
   mostre só os 5 mais relevantes para a pergunta.
   Cada item:
     - nome: nome do lead/empresa, exatamente como aparece no snapshot.
     - acao: ação recomendada, curta, no imperativo ("Responder no
       WhatsApp", "Ligar agora", "Enviar proposta").
     - metricas: 1 a 3 pares {label, valor} com os dados do snapshot que
       justificam a prioridade (ex.: label "Dias sem contato" valor "17";
       label "Tarefas vencidas" valor "2"; label "Score" valor "82").
       Nunca invente números fora do snapshot.
   Nunca inclua na lista um lead que não está no snapshot.

3. "pergunta_fechamento" — OPCIONAL. Só use quando genuinamente ajudar a
   continuidade da conversa (ex.: dado ambíguo, falta uma decisão do
   usuário). Nunca genérica ("posso ajudar em algo mais?", "precisa de
   mais informações?", "quer que eu...?"). Use null sempre que:
   (a) a pergunta original for puramente factual, ou
   (b) o usuário já pediu uma entrega explícita e você a entregou em
       "texto_narrativo" — nesse caso NÃO pergunte se ele quer o que ele
       já pediu.
   Exemplo: "A Anma Odontologia está há 17 dias sem interação — quer que
   eu já prepare esse contato?" (só cabe quando o usuário NÃO pediu essa
   entrega ainda — se ele já pediu, prepare o contato direto no texto).

# QUANDO O USUÁRIO PEDE UMA ENTREGA EXPLÍCITA

Pedidos como "me ajude a pensar na abordagem", "escreva uma mensagem",
"o que eu falo nessa ligação", "monta um roteiro" são pedidos de ENTREGA,
não de orientação. Nesses casos:
- "texto_narrativo" deve conter a entrega em si (a mensagem pronta, o
  roteiro, a abordagem concreta usando os dados reais do lead disponíveis
  no snapshot/contexto do lead) — pode passar de 1-2 frases quando o
  conteúdo pedido exigir (uma mensagem de WhatsApp, um roteiro de
  ligação), mesmo fora do caso "análise ampla do pipeline".
- Nunca devolva só orientação genérica ("mantenha a cadência", "reforce o
  valor da solução") no lugar da entrega pedida.
- Nunca termine perguntando permissão para fazer o que já foi pedido
  ("quer que eu escreva essa mensagem?" depois de já terem pedido pra
  escrever) — "pergunta_fechamento" vira null nesse caso.
- Isso não muda a regra de não executar ações no CRM: continue sem
  afirmar que moveu lead, concluiu tarefa ou enviou mensagem de verdade —
  você está redigindo o conteúdo, não a ação de enviá-lo.

# LEAD ESPECÍFICO NO CONTEXTO

Se houver um bloco de lead específico no contexto (encontrado por nome/
empresa mencionado na pergunta), ele é a fonte factual PRIORITÁRIA sobre
esse lead — use etapa, notas, interações recentes e diagnóstico dali,
mesmo que esse lead não apareça no SNAPSHOT OPERACIONAL (que só traz os
leads mais prioritários do dia, não todos). Se a pergunta cita um nome de
lead e esse bloco não veio preenchido, diga que não encontrou esse lead —
nunca invente etapa, dado ou histórico para um lead que não está em
nenhum dos dois blocos.

Regras gerais:
- Nunca ofereça follow-up genérico fora da pergunta de fechamento (não
  duplique "posso ajudar em algo mais" dentro de texto_narrativo).
- Se a pergunta pede um dos formatos simples (status, sim/não), uma
  resposta mais longa que isso está ERRADA, mesmo que o snapshot tenha
  mais dados para usar.`;

// Mesma forma de RESPONSE_SCHEMA (home-chat/index.ts), só traduzida pro
// dialeto do Gemini (tipos em maiúsculo; nullable via campo, não union).
const RESPONSE_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    texto_narrativo: { type: "STRING" },
    itens: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          nome: { type: "STRING" },
          acao: { type: "STRING" },
          metricas: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                label: { type: "STRING" },
                valor: { type: "STRING" },
              },
              required: ["label", "valor"],
            },
          },
        },
        required: ["nome", "acao", "metricas"],
      },
    },
    pergunta_fechamento: { type: "STRING", nullable: true },
  },
  required: ["texto_narrativo", "itens", "pergunta_fechamento"],
};

interface StructuredMetric {
  label: string;
  valor: string;
}

interface StructuredItem {
  nome: string;
  acao: string;
  metricas: StructuredMetric[];
}

interface StructuredChatContent {
  texto_narrativo: string;
  itens: StructuredItem[];
  pergunta_fechamento: string | null;
}

const MAX_ITEMS = 5;
const MAX_METRICS = 4;

function cap(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Mesma sanitização defensiva de home-chat/index.ts — Gemini com
 * responseSchema costuma respeitar o formato, mas nunca confia cegamente. */
function sanitizeStructured(parsed: unknown): StructuredChatContent | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;

  const texto = cap(p.texto_narrativo, 1500);
  if (!texto) return null;

  const itensRaw = Array.isArray(p.itens) ? p.itens : [];
  const itens: StructuredItem[] = itensRaw
    .slice(0, MAX_ITEMS)
    .map((it): StructuredItem => {
      const i = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
      const metricasRaw = Array.isArray(i.metricas) ? i.metricas : [];
      const metricas = metricasRaw
        .slice(0, MAX_METRICS)
        .map((m): StructuredMetric => {
          const mm = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
          return { label: cap(mm.label, 40), valor: cap(mm.valor, 60) };
        })
        .filter((m) => m.label && m.valor);
      return { nome: cap(i.nome, 120), acao: cap(i.acao, 160), metricas };
    })
    .filter((it) => it.nome && it.acao);

  const pergunta = typeof p.pergunta_fechamento === "string" ? cap(p.pergunta_fechamento, 300) : "";

  return { texto_narrativo: texto, itens, pergunta_fechamento: pergunta || null };
}

function flattenStructured(s: StructuredChatContent): string {
  const parts: string[] = [s.texto_narrativo];
  if (s.itens.length > 0) {
    parts.push(
      s.itens
        .map((it) => {
          const metrics = it.metricas.map((m) => `${m.label}: ${m.valor}`).join(" · ");
          return `- ${it.nome} — ${it.acao}${metrics ? ` (${metrics})` : ""}`;
        })
        .join("\n"),
    );
  }
  if (s.pergunta_fechamento) parts.push(s.pergunta_fechamento);
  return parts.filter(Boolean).join("\n\n").slice(0, 6000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  const telemetry = startAIExecution({
    task: "diretor_comercial_gemini",
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

    // Lead específico encontrado deterministicamente no client (leadLookup.ts)
    // quando a pergunta menciona um lead pelo nome/empresa — nunca depende de
    // score/autoDiagnosis/top-15 do priorityEngine (auditoria 03/09).
    const leadContext =
      body?.leadContext && typeof body.leadContext === "object" ? body.leadContext : undefined;

    const context = buildChatContext({
      history,
      crm: { dashboardSnapshot: commercialContext, leadContext, page: "home" },
    });

    const userPrompt =
      (userContextBlock ? userContextBlock + "\n\n" : "") +
      context.text +
      buildQuestionBlock(sanitizeExternal(message, 2000));

    // Erro transitório (rate limit / instabilidade momentânea do provedor /
    // timeout de rede) vale 1 nova tentativa — erro de conteúdo (schema
    // inválido, resposta bloqueada, chave ausente) não deve ser repetido.
    const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
    function isTransient(err: GeminiCallError): boolean {
      return TRANSIENT_STATUS.has(err.status);
    }
    function sleep(ms: number) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    let result;
    try {
      try {
        result = await callGeminiDirect({
          model: "gemini-2.5-flash",
          systemInstruction: composeSystem("intel.diretor.chat", UNTRUSTED_INPUT_SYSTEM_CLAUSE, READ_ONLY_CLAUSE),
          userPrompt,
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.4,
          // Igual ao original (900) truncou o JSON em teste real (Gemini foi
          // mais verboso que o GPT-5.4-mini pro mesmo prompt). Margem extra
          // pra reduzir a taxa de "Tentar novamente" sem inflar demais —
          // continua sendo uma resposta de conversa, não relatório.
          maxOutputTokens: 1400,
        });
      } catch (firstErr) {
        const err = firstErr as GeminiCallError;
        if (!isTransient(err)) throw err;
        // Retry único (auditoria 03/09 — sem retry, falha transitória virava
        // erro definitivo pro usuário sem nenhuma segunda chance).
        await sleep(600);
        result = await callGeminiDirect({
          model: "gemini-2.5-flash",
          systemInstruction: composeSystem("intel.diretor.chat", UNTRUSTED_INPUT_SYSTEM_CLAUSE, READ_ONLY_CLAUSE),
          userPrompt,
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.4,
          maxOutputTokens: 1400,
        });
      }
    } catch (e) {
      const err = e as GeminiCallError;
      const status = err.status ?? 502;
      await telemetry.failure(err, { inputChars: userPrompt.length });
      const friendly =
        status === 429
          ? "Limite de requisições atingido. Tente novamente em instantes."
          : "Não foi possível responder agora. Tente novamente em instantes.";
      return new Response(
        JSON.stringify({ error: friendly }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const raw = (result.content || "").trim();
    if (!raw) {
      await telemetry.failure(new Error("empty_response"), { inputChars: userPrompt.length });
      return new Response(
        JSON.stringify({ error: "Não recebi uma resposta válida. Tente novamente." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let structured: StructuredChatContent | null = null;
    try {
      structured = sanitizeStructured(JSON.parse(raw));
    } catch { /* segue null */ }

    if (!structured) {
      await telemetry.failure(new Error("structured_parse_failed"), { inputChars: userPrompt.length });
      return new Response(
        JSON.stringify({ error: "Não consegui montar a resposta agora. Tente novamente." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const content = flattenStructured(structured);

    await telemetry.success({
      model: result.modelUsed ?? null,
      inputChars: userPrompt.length,
      outputChars: content.length,
    });

    return new Response(
      JSON.stringify({ content, structured, model: result.modelUsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(JSON.stringify({ evt: "home_chat_gemini_error", msg: (e as Error).message }));
    await telemetry.failure(e);
    return new Response(
      JSON.stringify({ error: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
