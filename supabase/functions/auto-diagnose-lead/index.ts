// Diagnóstico Comercial Automático — IA Comercial V1.1
// Executa após cada nova ligação sincronizada do Matteline. Leve, JSON estrito,
// <700 tokens. NÃO substitui o Diagnóstico Completo (analyze-call-note full).
//
// Segurança:
//   • JWT obrigatório.
//   • Todo conteúdo Matteline (summary/transcription) passa por wrapUntrusted.
//   • Resposta validada por schema antes de retornar ao client.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-router.ts";
import {
  UNTRUSTED_INPUT_SYSTEM_CLAUSE,
  wrapUntrusted,
  validateShape,
  safeParseJson,
  assertSafeAIOutput,
  UnsafeAIOutputError,
} from "../_shared/untrusted-input.ts";
import {
  buildLeadContextPrompt,
  type LeadIntelligenceInput,
} from "../_shared/ai-core/index.ts";


// Contrato de entrada = contrato de contexto de lead do AI Core (Fase 3B).
type Payload = LeadIntelligenceInput;

interface DiagnosisPayload {
  temperature: "quente" | "morno" | "frio";
  probability: number;
  summary: string;
  next_action: string;
  attention: string;
  updated_memory: string;
}

const SYSTEM = [
  "Você é o DIAGNÓSTICO AUTOMÁTICO da Performance21.",
  "Objetivo: leitura RÁPIDA e ENXUTA da última ligação para apoiar a próxima abordagem.",
  "Português (Brasil). Frases curtas. Nunca invente dados.",
  "",
  "Responda EXCLUSIVAMENTE em JSON válido, exatamente neste schema (sem markdown, sem texto fora do JSON):",
  "{",
  '  "temperature": "quente|morno|frio",',
  '  "probability": 0,',
  '  "summary": "",',
  '  "next_action": "",',
  '  "attention": "",',
  '  "updated_memory": ""',
  "}",
  "",
  "Regras dos campos:",
  '- temperature: exatamente "quente" | "morno" | "frio" (minúsculas).',
  "- probability: inteiro 0-100. Sem casas decimais.",
  "- summary: máximo 3 linhas. Resume o que importa para o vendedor, não repete a transcrição.",
  "- next_action: uma frase objetiva. Ex.: \"Retornar amanhã após 14h.\"",
  "- attention: alerta relevante ou string vazia. Ex.: \"Decisor viaja amanhã.\"",
  "- updated_memory: APENAS se houver aprendizado novo e útil para futuras ligações (decisor, horário preferido, etc). Caso contrário, string vazia.",
  "",
  UNTRUSTED_INPUT_SYSTEM_CLAUSE,
].join("\n");

const SCHEMA = {
  temperature: { type: "enum", values: ["quente", "morno", "frio"] as const },
  probability: { type: "number", min: 0, max: 100 },
  summary: { type: "string", maxLength: 600 },
  next_action: { type: "string", maxLength: 240 },
  attention: { type: "string", maxLength: 240, optional: true },
  updated_memory: { type: "string", maxLength: 240, optional: true },
} as const;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) return json(401, { error: "Unauthorized" });

    const body = (await req.json()) as Payload;
    const summary = (body.summary || "").trim();
    const transcription = (body.transcription || "").trim();
    if (!summary && !transcription) {
      return json(400, { error: "summary_or_transcription_required" });
    }

    // Contexto de lead montado pelo contrato único do AI Core (Fase 3B).
    const userPrompt = buildLeadContextPrompt(
      { ...body, summary, transcription },
      { instruction: "Gere o diagnóstico automático conforme o schema." },
    );

    let result;
    try {
      result = await callAI({
        task: "auto_diagnosis",
        system: SYSTEM,
        user: userPrompt,
        inputChars: userPrompt.length,
        json: true,
        temperature: 0.2,
        maxTokens: 700,
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      const status = err.status ?? 502;
      return json(status, {
        error:
          status === 429 ? "Limite de requisições atingido."
          : status === 402 ? "Créditos de IA esgotados."
          : "Falha ao gerar diagnóstico automático.",
      });
    }

    const parsed = safeParseJson<Record<string, unknown>>(result.content || "");
    if (!parsed) return json(502, { error: "Formato inválido da IA" });

    // Normaliza temperature para minúsculas antes de validar.
    if (typeof parsed.temperature === "string") {
      parsed.temperature = parsed.temperature.toLowerCase();
    }
    if (typeof parsed.probability === "string") {
      parsed.probability = Number(parsed.probability);
    }

    const validation = validateShape<DiagnosisPayload>(parsed, SCHEMA as any);
    if (!validation.ok || !validation.value) {
      return json(502, { error: "Schema inválido", details: validation.errors });
    }

    const data = validation.value;

    // Anti-injection guard on fields that may be surfaced/persisted (updated_memory
    // is appended to permanent observations, summary/next_action shown to the user).
    try {
      assertSafeAIOutput(data.summary, "auto_diagnose.summary");
      assertSafeAIOutput(data.next_action, "auto_diagnose.next_action");
      if (data.attention) assertSafeAIOutput(data.attention, "auto_diagnose.attention");
      if (data.updated_memory) assertSafeAIOutput(data.updated_memory, "auto_diagnose.updated_memory");
    } catch (e) {
      if (e instanceof UnsafeAIOutputError) {
        return json(502, { error: "unsafe_output", matches: e.matches });
      }
      throw e;
    }

    return json(200, {
      ok: true,
      data,
      model: result.modelUsed,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error(JSON.stringify({ evt: "auto_diagnose_error", msg: (e as Error)?.message }));
    return json(500, { error: "internal_error" });
  }
});

