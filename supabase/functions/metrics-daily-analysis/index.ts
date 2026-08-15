// Análise opcional do fechamento diário de métricas.
// Só executa mediante clique explícito do usuário na página /inteligencia/metricas.
// Recebe APENAS números agregados e texto digitado pelo vendedor.
// Nenhuma lista de leads, telefone, interação, transcrição ou áudio trafega aqui.

import { callAI } from "../_shared/ai-router.ts";
import { requireUser } from "../_shared/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `Você é um gestor comercial sênior analisando o fechamento diário de um SDR/closer B2B.
Receberá apenas números agregados do dia e o contexto escrito pelo vendedor.
Regras:
- Diferencie sempre "confirmado" (registrado pelo discador) de "estimado" (inferido pelo CRM). Nunca trate estimado como confirmado.
- Não invente causalidade nem dados que não estão no payload.
- Quando faltar denominador, diga explicitamente que a base é insuficiente.
- Responda em português do Brasil, direto, em no máximo 250 palavras, com: leitura do dia, hipótese de gargalo, 3 ações para amanhã.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const payload = body?.payload;
    if (!payload || typeof payload !== "object") {
      return new Response(JSON.stringify({ error: "Payload ausente" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = `Fechamento do dia (dados agregados, sem identificação de leads):\n${JSON.stringify(payload).slice(0, 6000)}`;

    const result = await callAI({
      task: "auto_diagnosis",
      system: SYSTEM,
      user,
      temperature: 0.3,
      maxTokens: 700,
    });

    return new Response(
      JSON.stringify({
        text: result.content,
        model: result.modelUsed,
        generatedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Falha na análise" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
