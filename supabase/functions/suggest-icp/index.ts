import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/ai-router.ts";
import { requireUser } from "../_shared/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SuggestICPInput {
  leadContext: string;
  currentICP: number;
  additionalInfo?: string;
  websiteContent?: string;
  instagramContent?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  try {
    const input: SuggestICPInput = await req.json();
    
    const systemPrompt = `Você é o Diretor Comercial da Performance21 especializado em qualificação de leads (ICP).
Sua tarefa é analisar os dados fornecidos de um lead e sugerir uma classificação de ICP de 1 a 5 estrelas.

Regras de Classificação (ICP):
- 5 estrelas: Lead perfeito. Empresa estruturada, nicho de alta conversão, decisor identificado, dor latente e presença digital forte.
- 4 estrelas: Ótimo lead. Bom nicho, dados consistentes, mas falta algum detalhe para ser perfeito.
- 3 estrelas: Lead médio. Empresa padrão, nicho comum, informações básicas presentes.
- 2 estrelas: Lead baixo. Poucas informações, nicho saturado ou empresa muito pequena/sem estrutura clara.
- 1 estrela: Lead desqualificado. Informações inconsistentes, nicho fora do escopo ou empresa inativa.

Analise:
1. Nicho e Cidade (se são estratégicos).
2. Site e Instagram (se existem e a qualidade da presença).
3. Notas e interações (dores e contexto).

Responda EXCLUSIVAMENTE em JSON no formato:
{
  "suggestedICP": number,
  "reasoning": "string (máximo 200 caracteres explicando o porquê da nota)"
}`;

    const userPrompt = `
Dados do Lead:
${input.leadContext}

Informações Adicionais:
${input.additionalInfo || "Nenhuma"}

Conteúdo do Site:
${input.websiteContent || "Não informado"}

Conteúdo do Instagram:
${input.instagramContent || "Não informado"}

ICP Atual: ${input.currentICP} estrelas.
`;

    const result = await callAI({
      task: "intel_router", // Usando intel_router por ser estruturado e leve
      system: systemPrompt,
      user: userPrompt,
      json: true,
      temperature: 0.2,
    });

    const parsed = JSON.parse(result.content);

    return new Response(JSON.stringify({
      suggestedICP: parsed.suggestedICP,
      reasoning: parsed.reasoning
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro na função suggest-icp:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
