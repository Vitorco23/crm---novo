// Audit Transcript — usa AI Router (task: audit_transcript).
// Nenhuma referência a modelo específico. Fallback automático.

import { callAI } from "../_shared/ai-router.ts";

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
    const { transcript } = await req.json();
    if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
      return new Response(
        JSON.stringify({ error: "Transcrição vazia" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let result;
    try {
      result = await callAI({
        task: "audit_transcript",
        system: SYSTEM_PROMPT,
        user: transcript,
        inputChars: transcript.length,
        temperature: 0.3,
        maxTokens: 2048,
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      const status = err.status ?? 502;
      const friendly =
        status === 429
          ? "Limite de requisições atingido. Tente novamente em instantes."
          : status === 402
          ? "Créditos de IA esgotados. Adicione créditos nas configurações do workspace."
          : "Não foi possível gerar a auditoria neste momento. Tente novamente em instantes.";
      return new Response(
        JSON.stringify({ error: friendly }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ content: result.content || "Sem resposta da IA.", model: result.modelUsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
