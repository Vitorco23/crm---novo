// Diretor Comercial IA — parecer estratégico diário em formato de painel executivo.
// Retorna JSON estruturado (não Markdown), para renderização em cartões.
// Modelo: Lovable AI Gateway → openai/gpt-5.4-nano (mais barato disponível; equivalente ao GPT-4/4.1 Mini).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Você é o Diretor Comercial da Performance21. Interpreta o snapshot agregado da operação e devolve um PAINEL EXECUTIVO enxuto, escaneável em 30 segundos.

Regras absolutas:
- NUNCA invente números. Use somente valores presentes no snapshot; se faltar, escreva "sem dados suficientes".
- Escreva em português do Brasil, tom consultivo, direto, sem preâmbulos.
- Frases MUITO curtas. Sem parágrafos. Sem redação. Sem "como IA".
- Cada bullet deve caber em UMA linha (≤ 90 caracteres).

RESPONDA EXCLUSIVAMENTE COM UM OBJETO JSON VÁLIDO, sem markdown, sem crases, sem comentários, com exatamente estas chaves:
{
  "resumoOntem": string[],       // 3 a 5 bullets factuais sobre ontem (ligações, conexões, reuniões, vendas, principal problema)
  "atencao": string[],           // exatamente os 3 maiores problemas atuais
  "oportunidades": string[],     // 2 a 3 pontos positivos ou alavancas (nicho vencedor, melhor horário, script vencedor)
  "prioridades": string[],       // 3 a 5 ações executáveis HOJE, verbo no infinitivo, mensurável
  "dica": string                 // 1 recomendação, no máximo 2 linhas, direta
}

Não inclua nenhuma outra chave. Não inclua explicações fora do JSON.`;

const CHEAP_MODELS = new Set([
  "openai/gpt-5.4-nano",
  "openai/gpt-5-nano",
  "openai/gpt-5.4-mini",
  "openai/gpt-5-mini",
  "openai/gpt-5.6-luna",
]);

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

    const requested = typeof body?.model === "string" ? body.model : "";
    const model = CHEAP_MODELS.has(requested) ? requested : "openai/gpt-5.4-nano";

    const userPrompt =
      `Data de referência: ${snapshot.today ?? new Date().toISOString().slice(0, 10)}\n\n` +
      `Snapshot da operação (JSON):\n` +
      JSON.stringify(snapshot) +
      `\n\nGere o painel executivo no formato JSON descrito.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
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

    const raw = data?.choices?.[0]?.message?.content ?? "";
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // fallback: tenta extrair primeiro bloco {...}
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* noop */ } }
    }

    if (!parsed || typeof parsed !== "object") {
      return new Response(
        JSON.stringify({ error: "IA retornou formato inválido", raw }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const asArr = (v: any, max: number): string[] =>
      Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, max) : [];

    const painel = {
      resumoOntem: asArr(parsed.resumoOntem, 6),
      atencao: asArr(parsed.atencao, 3),
      oportunidades: asArr(parsed.oportunidades, 4),
      prioridades: asArr(parsed.prioridades, 6),
      dica: typeof parsed.dica === "string" ? parsed.dica.slice(0, 320) : "",
    };

    return new Response(
      JSON.stringify({ painel, model }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
