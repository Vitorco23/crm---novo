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

const SCORING_SYSTEM_PROMPT = `Você é o Analista Estratégico da Performance21.
Sua missão: Analisar o contexto profundo de um lead e calcular seu Score de Prioridade (0-100).

CRITÉRIOS DE SCORE:
+ Follow-up vencido / Retorno prometido para hoje: +40 pts
+ Decisor identificado / Reunião realizada: +30 pts
+ Proposta enviada / Negociação ativa: +20 pts
+ Lead Quente (temperatura): +10 pts
- Lead Frio / Sem interação > 15 dias: -20 pts
- Oportunidade parada há meses: -40 pts

CONSIDERE: Observações, memória comercial, anexos (análise prévia), histórico, diagnóstico comercial e temperatura.

OUTPUT (JSON):
{
  "score": number,
  "resumo_prioridade": "string curta com o motivo técnico do score"
}`;

const FINAL_DECISION_SYSTEM_PROMPT = `Você é o Diretor Comercial da Performance21.
Sua missão: Receber um ranking de leads já pontuados e definir a PRIORIDADE ABSOLUTA (#1) para a Missão do Dia.

REGRAS:
1. Você recebe apenas o ranking resumido (Top Oportunidades).
2. Se houver pelo menos um lead com score > 10, você DEVE selecionar o melhor.
3. Se não houver NENHUMA oportunidade prioritária (scores baixos ou lista vazia), sugira "Prospectar novos leads".

OUTPUT (JSON):
{
  "leads": [{
    "leadId": "string",
    "motivo": "frase executiva citando o volume analisado e a razão da escolha",
    "proximaAcao": "Verbo + Ação + Contexto",
    "impacto": "critico|alto|medio"
  }]
}`;


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

    // PASSO 1: Gemini analisa individualmente para gerar Scores (em paralelo)
    // Limitamos a 15 para performance e tokens, já que buildCandidates já traz o topo.
    const topCandidates = candidates.slice(0, 15);
    
    const scoringResults = await Promise.all(topCandidates.map(async (cand) => {
      try {
        const res = await callAI({
          task: "priority_scoring",
          system: SCORING_SYSTEM_PROMPT,
          user: `Analise este lead: ${JSON.stringify(cand)}`,
          json: true,
          temperature: 0.1,
          maxTokens: 200,
        });
        const parsed = JSON.parse(res.content);
        return { 
          leadId: cand.id, 
          empresa: cand.empresa, 
          score: parsed.score || 0, 
          motivo: parsed.resumo_prioridade || "",
          original: cand
        };
      } catch (e) {
        console.error(`Erro ao pontuar lead ${cand.id}:`, e);
        return null;
      }
    }));

    const rankedLeads = scoringResults
      .filter(Boolean)
      .sort((a, b) => (b?.score || 0) - (a?.score || 0));

    // PASSO 2: GPT recebe o ranking e define a Missão
    const finalResult = await callAI({
      task: "priority_leads",
      system: FINAL_DECISION_SYSTEM_PROMPT + "\n\n" + UNTRUSTED_INPUT_SYSTEM_CLAUSE + "\n\n" + NBA_PROMPT_BLOCK,
      user: `Data/hora atual: ${new Date().toISOString()}\nRanking de Oportunidades:\n${JSON.stringify(rankedLeads.map(r => ({ id: r?.leadId, empresa: r?.empresa, score: r?.score, motivo: r?.motivo })))}`,
      json: true,
      temperature: 0.2,
      maxTokens: 800,
    });

    let parsed: any = null;
    try { parsed = JSON.parse(finalResult.content); }
    catch {
      const m = String(finalResult.content).match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* noop */ } }
    }

    const candMap = new Map<string, any>();
    for (const c of topCandidates) candMap.set(String(c.id), c);
    
    const raw = Array.isArray(parsed?.leads) ? parsed.leads : [];
    const leads = raw
      .filter((x: any) => x && candMap.has(String(x.leadId)))
      .slice(0, 1) // Interface exibe apenas a maior prioridade
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
      JSON.stringify({ leads, model: finalResult.modelUsed, generatedAt: new Date().toISOString() }),
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