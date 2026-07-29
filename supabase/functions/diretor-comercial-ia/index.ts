// Diretor Comercial IA — usa AI Router (task: diretor_comercial).
// Nunca cita modelo diretamente. Fallback automático se GPT-mini indisponível.

import { callAI } from "../_shared/ai-router.ts";
import { requireUser } from "../_shared/require-auth.ts";
import { buildMemoryContextBlock } from "../_shared/memory-retrieval.ts";
import { NBA_PROMPT_BLOCK, extractNBA, sanitizeNBA } from "../_shared/nba-types.ts";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const snapshot = body?.snapshot;
    if (!snapshot || typeof snapshot !== "object") {
      return new Response(
        JSON.stringify({ error: "Snapshot ausente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { block: memoryBlock } = await buildMemoryContextBlock({
      queryText: `Diretor comercial diário. Snapshot: ${JSON.stringify(snapshot).slice(0, 1500)}`,
      matchCount: 5,
      minSimilarity: 0.4,
      includePatterns: true,
    });

    const snapshotSafe = sanitizeExternal(JSON.stringify(snapshot), 40000);
    const userPrompt =
      `Data de referência: ${snapshot.today ?? new Date().toISOString().slice(0, 10)}\n\n` +
      buildBusinessCalendarBlock() + "\n\n" +
      (memoryBlock ? memoryBlock + "\n\n" : "") +
      wrapUntrusted(snapshotSafe, { maxChars: 40000, label: "SNAPSHOT DA OPERAÇÃO (JSON)" }) +
      `\n\nGere o painel executivo no formato JSON descrito.`;

    let result;
    try {
      result = await callAI({
        task: "diretor_comercial",
        system: SYSTEM_PROMPT + "\n\n" + UNTRUSTED_INPUT_SYSTEM_CLAUSE + "\n\n" + NBA_PROMPT_BLOCK,
        user: userPrompt,
        json: true,
        temperature: 0.3,
        maxTokens: 2000,
      });

    } catch (e) {
      const err = e as Error & { status?: number };
      const status = err.status ?? 502;
      const friendly =
        status === 429
          ? "Limite de requisições atingido. Tente novamente em instantes."
          : status === 402
          ? "Créditos de IA esgotados. Adicione créditos nas configurações do workspace."
          : "Não foi possível gerar o parecer neste momento. Tente novamente em instantes.";
      return new Response(
        JSON.stringify({ error: friendly }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const raw = result.content;
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
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

    // Próxima Melhor Ação global (Diretor) — sem leadId
    const nba = sanitizeNBA(extractNBA(parsed), {
      interactionsCount: 1,
      callNotesCount: 1,
    });

    return new Response(
      JSON.stringify({
        painel,
        nextBestAction: nba,
        model: result.modelUsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(JSON.stringify({ evt: "diretor_comercial_error", msg: (e as Error).message }));
    return new Response(
      JSON.stringify({ error: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

});
