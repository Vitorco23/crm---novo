// Priority Leads IA — seleciona até 5 leads que merecem atenção AGORA.
// Recebe uma lista compacta de candidatos (já pré-filtrada pelo cliente)
// e devolve uma seleção com motivo da prioridade e próxima melhor ação.

import { callAI } from "../_shared/ai-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Você é o Diretor Comercial da Performance21 analisando a carteira do dia.
Sua tarefa: escolher entre 0 e 5 leads que REALMENTE merecem atenção imediata AGORA.

Regras absolutas:
- Priorize IMPACTO COMERCIAL esperado, não apenas o Score.
- Um lead com score menor pode ter prioridade máxima se: prometeu retorno, está prestes a fechar, está esfriando após avanço, ou tem follow-up vencido crítico.
- NUNCA invente informações. Use apenas o contexto fornecido de cada lead.
- Se nenhum lead for realmente prioritário, devolva lista vazia. Não force 5.
- Motivo deve ser 1 frase concreta (≤ 140 caracteres), citando o fato que torna esse lead urgente.
- Próxima ação deve ser 1 verbo no infinitivo + o quê + prazo (≤ 120 caracteres). Ex: "Ligar até 16h para confirmar interesse na proposta".

RESPONDA EXCLUSIVAMENTE COM JSON VÁLIDO no formato:
{
  "leads": [
    {
      "leadId": string,
      "motivo": string,
      "proximaAcao": string,
      "impacto": "critico" | "alto" | "medio"
    }
  ]
}

Ordene do mais urgente para o menos urgente. Máximo 5 itens.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const candidates = body?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return new Response(
        JSON.stringify({ leads: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userPrompt =
      `Data/hora atual: ${new Date().toISOString()}\n` +
      `Total de candidatos: ${candidates.length}\n\n` +
      `Candidatos (JSON):\n${JSON.stringify(candidates)}\n\n` +
      `Selecione até 5 leads prioritários no formato JSON descrito.`;

    let result;
    try {
      result = await callAI({
        task: "priority_leads",
        system: SYSTEM_PROMPT,
        user: userPrompt,
        json: true,
        temperature: 0.2,
        maxTokens: 1200,
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

    const validIds = new Set(candidates.map((c: any) => String(c.id)));
    const raw = Array.isArray(parsed?.leads) ? parsed.leads : [];
    const leads = raw
      .filter((x: any) => x && validIds.has(String(x.leadId)))
      .slice(0, 5)
      .map((x: any) => ({
        leadId: String(x.leadId),
        motivo: String(x.motivo || "").slice(0, 220),
        proximaAcao: String(x.proximaAcao || "").slice(0, 200),
        impacto: ["critico", "alto", "medio"].includes(x.impacto) ? x.impacto : "medio",
      }));

    return new Response(
      JSON.stringify({ leads, model: result.modelUsed, generatedAt: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
