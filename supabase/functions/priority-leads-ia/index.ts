// Priority Leads IA — seleciona até 5 leads que merecem atenção AGORA.
// Recebe uma lista compacta de candidatos (já pré-filtrada pelo cliente)
// e devolve uma seleção com motivo da prioridade e próxima melhor ação.

import { callAI } from "../_shared/ai-router.ts";
import { requireUser } from "../_shared/require-auth.ts";
import { createMemoryEngine } from "../_shared/ai-core/index.ts";
import { NBA_PROMPT_BLOCK, sanitizeNBA } from "../_shared/nba-types.ts";
import { buildBusinessCalendarBlock } from "../_shared/business-calendar.ts";
import {
  UNTRUSTED_INPUT_SYSTEM_CLAUSE,
  wrapUntrusted,
  sanitizeExternal,
} from "../_shared/untrusted-input.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Você é o Diretor Comercial da Performance21 analisando a carteira do dia.
Sua tarefa: escolher qual é a Próxima Missão Comercial de maior impacto para o usuário agora.

Você não deve apenas olhar follow-ups pendentes. Você deve olhar para o cenário comercial completo e decidir qual ATIVIDADE trará mais resultado.

Exemplos de missões que você pode gerar:
- "Prospectar 12 novas integradoras em Aracaju" (Se houver leads novos ou nichos pouco explorados)
- "Enviar proposta para [Empresa]" (Se o lead avançou ou está em Documento de Guerra)
- "Ligar novamente para [Empresa]" (Se houve tentativa sem sucesso ou promessa de retorno)
- "Agendar reunião com [Empresa]" (Se o lead está quente e pronto para o próximo passo)
- "Follow-up urgente: [Empresa]" (Se há atraso crítico)

Regras absolutas:
- Escolha a ação de MAIOR IMPACTO COMERCIAL esperado.
- Se não houver nada crítico em leads existentes, sugira prospecção em massa de leads novos.
- Motivo deve ser focado no PORQUÊ essa missão é a melhor agora.
- Próxima ação deve ser clara e executável.
- NUNCA invente informações. Use apenas o contexto fornecido.
- RESPONDA EXCLUSIVAMENTE COM JSON VÁLIDO.`;

Para CADA lead escolhido, inclua obrigatoriamente um bloco \`next_best_action\` com a Próxima Melhor Ação (uma única ação, a de maior impacto), no formato descrito abaixo.

RESPONDA EXCLUSIVAMENTE COM JSON VÁLIDO no formato:
{
  "leads": [
    {
      "leadId": string,
      "motivo": string,
      "proximaAcao": string,
      "impacto": "critico" | "alto" | "medio",
      "next_best_action": { "action": string, "title": string, "reason": string, "urgency": string, "confidence": string }
    }
  ]
}

Ordene do mais urgente para o menos urgente. Máximo 8 itens.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const candidates = body?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return new Response(
        JSON.stringify({ leads: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Injeta memória comercial + padrões estatísticos como contexto extra.
    const niches = Array.from(new Set(
      (candidates as Array<{ niche?: string }>).map((c) => c?.niche).filter(Boolean),
    )).slice(0, 3).join(", ");
    const memory = createMemoryEngine();
    const { block: memoryBlock } = await memory.get({
      scope: "global",
      queryText: `Priorização diária. Nichos dos candidatos: ${niches || "diversos"}.`,
      matchCount: 4,
      minSimilarity: 0.45,
      includePatterns: true,
    });

    const candidatesSafe = sanitizeExternal(JSON.stringify(candidates), 60000);
    const userPrompt =
      `Data/hora atual: ${new Date().toISOString()}\n` +
      `Total de candidatos: ${candidates.length}\n\n` +
      buildBusinessCalendarBlock() + "\n\n" +
      (memoryBlock ? memoryBlock + "\n\n" : "") +
      wrapUntrusted(candidatesSafe, { maxChars: 60000, label: "CANDIDATOS (JSON)" }) + "\n\n" +
      `Selecione até 8 leads prioritários no formato JSON descrito.`;

    let result;
    try {
      result = await callAI({
        task: "priority_leads",
        system: SYSTEM_PROMPT + "\n\n" + UNTRUSTED_INPUT_SYSTEM_CLAUSE + "\n\n" + NBA_PROMPT_BLOCK,

        user: userPrompt,
        json: true,
        temperature: 0.2,
        maxTokens: 1600,
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      const status = err.status ?? 502;
      const friendly =
        status === 429 ? "Limite de requisições atingido. Tente em instantes."
        : status === 402 ? "Créditos de IA esgotados."
        : "Não foi possível calcular prioridades agora.";
      return new Response(
        JSON.stringify({ error: friendly }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed: any = null;
    try { parsed = JSON.parse(result.content); }
    catch {
      const m = String(result.content).match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* noop */ } }
    }

    const candMap = new Map<string, any>();
    for (const c of candidates) candMap.set(String((c as any).id), c);
    const raw = Array.isArray(parsed?.leads) ? parsed.leads : [];
    const leads = raw
      .filter((x: any) => x && candMap.has(String(x.leadId)))
      .slice(0, 8)
      .map((x: any) => {
        const cand = candMap.get(String(x.leadId)) || {};
        const nba = sanitizeNBA(x.next_best_action ?? x.nextBestAction ?? null, {
          stage: cand.etapa,
          interactionsCount: cand.interacoes ?? 0,
          callNotesCount: cand.reunioesMarcadas ?? 0,
          hasPendingPromise: (cand.followupsVencidos ?? 0) > 0 || (cand.tarefasVencidas ?? 0) > 0,
        }, String(x.leadId));
        return {
          leadId: String(x.leadId),
          motivo: String(x.motivo || "").slice(0, 220),
          proximaAcao: String(x.proximaAcao || nba.title || "").slice(0, 200),
          impacto: ["critico", "alto", "medio"].includes(x.impacto) ? x.impacto : "medio",
          nextBestAction: nba,
        };
      });

    return new Response(
      JSON.stringify({ leads, model: result.modelUsed, generatedAt: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(JSON.stringify({ evt: "priority_leads_error", msg: (e as Error).message }));
    return new Response(
      JSON.stringify({ error: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

});
