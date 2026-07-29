// Audit Transcript — usa AI Router (task: audit_transcript).
// Requer usuário autenticado (JWT válido) para evitar abuso anônimo de créditos de IA.

import { createClient } from "npm:@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-router.ts";
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

const SYSTEM_PROMPT = [
  "Você é o Diretor Comercial da agência Performance21. Sua função é auditar a transcrição de uma reunião de vendas e extrair os dados frios. Leia a transcrição e devolva um relatório rápido em tópicos curtos: 1. BANT (Foi validado?), 2. Ralo Comercial (Qual o gargalo?), 3. Objeções (Quais foram e como contornadas?), 4. Próximo Passo.",
  "",
  UNTRUSTED_INPUT_SYSTEM_CLAUSE,
].join("\n");

const MAX_TRANSCRIPT_CHARS = 50_000;


function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // === Auth: exige JWT válido do usuário logado ===
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return jsonResp(401, { error: "unauthorized" });
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jsonResp(500, { error: "server_misconfigured" });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.slice(7).trim();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return jsonResp(401, { error: "unauthorized" });
  }

  try {
    const { transcript } = await req.json();
    if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
      return jsonResp(400, { error: "Transcrição vazia" });
    }
    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      return jsonResp(413, {
        error: `Transcrição muito longa (máx ${MAX_TRANSCRIPT_CHARS} caracteres).`,
      });
    }

    const safeTranscript = sanitizeExternal(transcript, MAX_TRANSCRIPT_CHARS);
    const userPrompt = wrapUntrusted(safeTranscript, {
      maxChars: MAX_TRANSCRIPT_CHARS,
      label: "TRANSCRIÇÃO DA REUNIÃO",
    });

    let result;
    try {
      result = await callAI({
        task: "audit_transcript",
        system: SYSTEM_PROMPT,
        user: userPrompt,
        inputChars: userPrompt.length,
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
      return jsonResp(status, { error: friendly });
    }


    return jsonResp(200, {
      content: result.content || "Sem resposta da IA.",
      model: result.modelUsed,
    });
  } catch (e) {
    console.error(JSON.stringify({ evt: "audit_transcript_error", msg: (e as Error).message }));
    return jsonResp(500, { error: "internal_error" });
  }

});
