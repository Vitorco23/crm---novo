// Diretor Comercial IA — parecer estratégico diário.
// Recebe um snapshot agregado da operação (sem dados de leads individuais)
// e devolve um parecer em markdown com estrutura fixa.
// Modelo: Lovable AI Gateway → openai/gpt-5.4-mini.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Você é o Diretor Comercial da agência Performance21, um executivo sênior que acompanha a operação diariamente.

Sua função é ler o snapshot agregado da operação comercial (Central de Decisão, Dashboard, Inteligência Comercial, Laboratório Comercial, Metas, Motor de Gargalos e Financeiro) e devolver um parecer estratégico consultivo, direto e acionável.

Regras absolutas:
- Nunca invente números. Use somente os valores do snapshot.
- Toda recomendação deve ser justificada com um indicador do snapshot (cite o número).
- Tom consultivo, objetivo e estratégico. Sem linguagem genérica de assistente de IA. Sem frases como "como IA" ou "posso ajudar".
- Escreva em português do Brasil.
- Interprete os dados: aponte causa provável, não só descreva o número.
- Se um indicador estiver zerado ou faltando, diga "sem dados suficientes" — não chute.

Estrutura de resposta OBRIGATÓRIA em markdown, exatamente nesta ordem, sem variações e sem seções extras:

## Resumo de Ontem
## Principais Indicadores
## Gargalos
## Oportunidades
## Plano de Ação para Hoje
## Alertas
## Conclusão

Cada seção deve ter 2-6 bullets curtos, exceto Resumo de Ontem e Conclusão, que são parágrafos de 2-4 linhas.
No Plano de Ação, priorize itens executáveis hoje (ex.: "Recuperar 12 leads sem contato há mais de 5 dias no nicho X").
Nos Alertas, destaque riscos concretos (meta em risco, queda de conversão, baixo volume, leads parados).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const body = await req.json().catch(() => ({}));
    const snapshot = body?.snapshot;
    if (!snapshot || typeof snapshot !== "object") {
      return new Response(
        JSON.stringify({ error: "Snapshot ausente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userPrompt =
      `Data de referência: ${snapshot.today ?? new Date().toISOString().slice(0, 10)}\n\n` +
      `Snapshot completo da operação (JSON):\n\n` +
      "```json\n" + JSON.stringify(snapshot, null, 2) + "\n```\n\n" +
      `Elabore o parecer diário seguindo estritamente a estrutura definida.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: body?.model || "openai/gpt-5.4-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || data?.message || "Falha no Lovable AI Gateway";
      if (res.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (res.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos nas configurações do workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: msg, details: data }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const content = data?.choices?.[0]?.message?.content ?? "Sem resposta da IA.";
    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
