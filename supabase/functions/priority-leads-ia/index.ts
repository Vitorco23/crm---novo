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

const SYSTEM_PROMPT = `Você é o Diretor Comercial da Performance21.
Sua missão: Calcular o Score Comercial de cada lead e selecionar a prioridade absoluta (#1).

REGRAS DE PONTUAÇÃO (Sprint 4 - Motor Interno):
1. PONTUAÇÃO BASE:
   - Follow-up vencido: +50 pontos.
   - Retorno prometido para hoje: +40 pontos.
   - Lead Quente (Temperatura): +30 pontos.
   - Proposta enviada (Estágio): +25 pontos.
   - Alto valor potencial (> 5k): +20 pontos.
   - Sem contato há mais de 3 dias: +15 pontos.
   - Presença de decisor identificado no diagnóstico: +10 pontos.

2. MULTIPLICADORES DE RISCO:
   - Risco de perda iminente (esfriando rapidamente): x1.5 no score final.
   - Promessa de retorno não cumprida pelo vendedor: x1.3 no score final.

3. ANÁLISE SEMÂNTICA PROFUNDA:
   - Use a Memória Comercial e Diagnóstico IA para entender o contexto real.
   - Identifique dores não resolvidas nas últimas interações.

4. SELEÇÃO:
   - Ordene os leads pelo Score Comercial calculado internamente.
   - Apresente apenas o lead com maior pontuação como a "Próxima Missão".

5. OUTPUT:
   - Motivo: 1 frase direta justificando a prioridade com base nos critérios acima.
   - Próxima ação: Verbo + Ação + Prazo.

O usuário nunca vê os cálculos, apenas a lista priorizada.`;

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
