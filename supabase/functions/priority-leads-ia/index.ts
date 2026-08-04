// Priority Leads IA — seleciona até 5 leads que merecem atenção AGORA.
// Recebe uma lista compacta de candidatos (já pré-filtrada pelo cliente)
// e devolve uma seleção com motivo da prioridade e próxima melhor ação.

import { callAI } from "../_shared/ai-router.ts";
import { requireUser } from "../_shared/require-auth.ts";
import { startAIExecution } from "../_shared/ai-core/index.ts";
import { NBA_PROMPT_BLOCK, sanitizeNBA } from "../_shared/nba-types.ts";
import { buildBusinessCalendarBlock } from "../_shared/business-calendar.ts";
import {
  UNTRUSTED_INPUT_SYSTEM_CLAUSE,
} from "../_shared/untrusted-input.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCORING_SYSTEM_PROMPT = `Você é o Analista Estratégico da Performance21.
Sua missão: Analisar o contexto profundo de um lead e calcular seu Score de Prioridade (0-100).

REGRA DE PRIORIDADE ABSOLUTA:
"Dinheiro parado no funil vale mais do que um novo lead."

ORDEM OBRIGATÓRIA DE PRIORIDADE:
1. Negociação (Prioridade Máxima)
2. Proposta
3. Reunião Realizada
4. Reunião Agendada
5. Diagnóstico
6. Follow-up
7. Tentativas 1-10 (Cadência ativa)
8. Novos Leads (Apenas se não houver NADA acima)

CRITÉRIOS DE SCORE:
+ Negociação/Proposta ativa: +50 a +60 pts
+ Reunião Realizada/Agendada: +40 a +50 pts
+ Diagnóstico/Follow-up ativo: +30 pts
+ Follow-up vencido / Retorno prometido para hoje: +20 pts extras (Bônus Crítico)
+ Lead Quente (temperatura): +10 pts
- Oportunidade parada há meses: -40 pts


CONSIDERE: Observações, memória comercial, anexos (análise prévia), histórico, diagnóstico comercial e temperatura.

OUTPUT (JSON):
{
  "score": number,
  "resumo_prioridade": "string curta com o motivo técnico do score"
}`;

const FINAL_DECISION_SYSTEM_PROMPT = `Você é o Diretor Comercial da Performance21.
Sua missão: Receber um ranking de leads já pontuados e definir a PRIORIDADE ABSOLUTA (#1) para a Missão do Dia.

REGRA DE OURO: Enquanto existir uma oportunidade ativa recuperável ou com potencial de fechamento (Negociação, Proposta, Reunião), você NUNCA deve priorizar novas prospecções ou Novos Leads.

REGRAS:
1. Você recebe apenas o ranking resumido (Top Oportunidades).
2. Selecione as 10 melhores ações comerciais do momento, ordenadas pela maior prioridade.
3. Se houver menos de 10 leads com score relevante, retorne apenas os que fizerem sentido.
4. Se não houver ABSOLUTAMENTE NENHUMA oportunidade prioritária ativa em etapas avançadas, sugira "Prospectar novos leads".

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

  const authHeaderRaw = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const telemetry = startAIExecution({
    task: "priority_leads",
    userId: auth.userId,
    authHeader: authHeaderRaw,
  });

  console.log(`[PriorityLeads] Início da execução para usuário: ${auth.userId}`);

  try {
    const body = await req.json().catch(() => ({}));
    const candidates = body?.candidates;
    
    if (!Array.isArray(candidates) || candidates.length === 0) {
      console.log(`[PriorityLeads] Nenhum candidato recebido.`);
      await telemetry.success({ inputChars: 0, outputChars: 2 });
      return new Response(
        JSON.stringify({ leads: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[PriorityLeads] Recebidos ${candidates.length} candidatos.`);
    telemetry.addSource("crm");

    // PASSO 1: Gemini analisa individualmente para gerar Scores (em paralelo)
    const topCandidates = candidates.slice(0, 15);
    console.log(`[PriorityLeads] Pontuando top ${topCandidates.length} candidatos...`);
    
    let totalInputCharsScoring = 0;
    const scoringResults = await Promise.all(topCandidates.map(async (cand) => {
      const userPayload = `Analise este lead: ${JSON.stringify(cand)}`;
      totalInputCharsScoring += userPayload.length;
      
      try {
        const res = await callAI({
          task: "priority_scoring",
          system: SCORING_SYSTEM_PROMPT,
          user: userPayload,
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
        console.error(`[PriorityLeads] Erro ao pontuar lead ${cand.id}:`, e);
        return null;
      }
    }));

    const rankedLeads = scoringResults
      .filter(Boolean)
      .sort((a, b) => (b?.score || 0) - (a?.score || 0));

    console.log(`[PriorityLeads] Ranking concluído. Melhor score: ${rankedLeads[0]?.score || 0}`);

    // PASSO 2: GPT recebe o ranking e define a Missão
    const finalUserPrompt = `Data/hora atual: ${new Date().toISOString()}\nRanking de Oportunidades:\n${JSON.stringify(rankedLeads.map(r => ({ id: r?.leadId, empresa: r?.empresa, score: r?.score, motivo: r?.motivo })))}`;
    
    console.log(`[PriorityLeads] Enviando ranking para decisão final. Tamanho prompt: ${finalUserPrompt.length} chars.`);

    const finalResult = await callAI({
      task: "priority_leads",
      system: FINAL_DECISION_SYSTEM_PROMPT + "\n\n" + UNTRUSTED_INPUT_SYSTEM_CLAUSE + "\n\n" + NBA_PROMPT_BLOCK,
      user: finalUserPrompt,
      json: true,
      temperature: 0.2,
      maxTokens: 800,
    });

    console.log(`[PriorityLeads] Decisão final recebida. Modelo: ${finalResult.modelUsed}. Latência: ${finalResult.latencyMs}ms`);

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

    await telemetry.success({
      model: finalResult.modelUsed,
      inputChars: totalInputCharsScoring + finalUserPrompt.length,
      outputChars: finalResult.content.length,
      inputTokens: finalResult.promptTokens,
      outputTokens: finalResult.completionTokens,
    });

    return new Response(
      JSON.stringify({ leads, model: finalResult.modelUsed, generatedAt: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(`[PriorityLeads] ERRO CRÍTICO:`, e);
    await telemetry.failure(e);
    const errInfo = telemetry.formatError(e);
    
    return new Response(
      JSON.stringify({ 
        error: errInfo.error, 
        message: errInfo.message,
        code: errInfo.code,
        stack: (e as Error).stack 
      }),
      { status: errInfo.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

});