// Proxy to OpenRouter for AI audit of meeting transcripts.
// Keeps OPENROUTER_API_KEY server-side.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT =
  "Você é o Diretor Comercial da agência Performance21. Sua função é auditar a transcrição de uma reunião de vendas e extrair os dados frios. Leia a transcrição e devolva um relatório rápido em tópicos curtos: 1. BANT (Foi validado?), 2. Ralo Comercial (Qual o gargalo?), 3. Objeções (Quais foram e como contornadas?), 4. Próximo Passo.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENROUTER_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { transcript, model } = await req.json();
    if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
      return new Response(
        JSON.stringify({ error: "Transcrição vazia" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://crm.performance21.com.br",
        "X-Title": "CRM Performance21 - Auditoria IA",
      },
      body: JSON.stringify({
        model: model || "meta-llama/llama-3-8b-instruct:free",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: transcript },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: data?.error?.message || "Falha no OpenRouter", details: data }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const content =
      data?.choices?.[0]?.message?.content ??
      "Sem resposta da IA.";
    return new Response(
      JSON.stringify({ content, raw: data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
