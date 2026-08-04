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

REGRAS OBRIGATÓRIAS DE ANÁLISE (SPRINT - Otimização da Análise):
1. FOCO EM QUALIDADE: Você deve priorizar leads que já possuem histórico comercial (Tentativas 1-10, Follow-up, Diagnóstico, Reunião, Proposta, Negociação).
2. ETAPA "NOVOS LEADS" E "IMPORTADOS": Estas etapas devem ser ignorADAS na análise de impacto. Elas contêm registros sem histórico. O Diretor IA trabalha apenas com oportunidades ativas.
3. FILTRAGEM PRÉVIA: O sistema cliente já filtra os leads, então se você recebeu um lead, ele é tecnicamente um candidato ativo, mas você deve validar se ele realmente exige ação (ex: follow-up vencido, proposta parada).


4. CRITÉRIOS DE PRIORIDADE:
   - Proposta/Negociação: Leads em etapas finais de venda são prioridade máxima.
   - Follow-up Vencido: Se houver compromisso de retorno atrasado, é crítico.
   - Retorno Prometido: Compromissos para hoje.
   - Lead Quente Parado: Leads com temperatura "Quente" sem contato há mais de 48h.
   - Alto Valor: Critério de desempate.

5. PROIBIÇÃO DO "TUDO EM DIA": 
   - Jamais retorne uma lista vazia se houver pelo menos uma ação possível sugerida pelos dados.
   - Somente responda vazio se ABSOLUTAMENTE todos os leads estiverem com o próximo passo no futuro distante.

6. TRANSPARÊNCIA DA DECISÃO:
   - No campo "motivo", você deve ser específico.
   - Comece citando o volume analisado.
   - Exemplo: "Entre [X] oportunidades analisadas, esta foi considerada a ação de maior impacto porque possui follow-up vencido e está em etapa de Proposta."

7. OUTPUT (JSON):
   - motivo: 1-2 frases detalhando a razão da escolha técnica (seja executivo e preciso).
   - proximaAcao: Verbo + Ação + Contexto (ex: "Ligar para o sócio para validar a proposta de R$ 15k").
   - impacto: "critico", "alto" ou "medio".

REGRAS DE PONTUAÇÃO INTERNA:
- Proposta/Negociação: +70 pts
- Reunião Agendada/Realizada: +60 pts
- Follow-up vencido: +60 pts
- Retorno hoje: +50 pts
- Diagnóstico: +40 pts
- Temperatura Quente: +40 pts
- Valor > 5k: +25 pts
- Sem contato > 3 dias: +20 pts`;


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
