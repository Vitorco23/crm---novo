// Diretor Comercial IA — versão Gemini 2.5 Flash via Google AI Studio DIRETO
// (branch migracao-gemini). Duplicata deliberada de diretor-comercial-ia/
// index.ts, não uma edição — a function original continua servindo o
// Lovable/produção sem nenhuma alteração, já que os dois compartilham o
// mesmo projeto Supabase. Prompt (Prompt Registry) e regras de negócio são
// IDÊNTICOS ao original; a única coisa que muda é qual IA responde
// (callGeminiDirect em vez de callAI/AI Router).

import { callGeminiDirect, GeminiCallError } from "../_shared/gemini-direct.ts";
import { requireUser } from "../_shared/require-auth.ts";
import { NBA_PROMPT_BLOCK, extractNBA, sanitizeNBA } from "../_shared/nba-types.ts";
import { buildBusinessCalendarBlock } from "../_shared/business-calendar.ts";
// Import direto dos módulos (não via barrel ../_shared/ai-core/index.ts):
// esse barrel reexporta tool-registry.ts, que por sua vez importa
// knowledge-engine.ts — arquivo que não existe no repositório (feature
// nunca commitada), quebrando o bundle de QUALQUER function que use o
// barrel. home-chat-gemini já evita isso do mesmo jeito.
import { composeSystem } from "../_shared/ai-core/prompt-registry.ts";
import { createMemoryEngine } from "../_shared/ai-core/memory-engine.ts";
import { startAIExecution } from "../_shared/ai-core/observability.ts";
import { buildUserContextBlock, parseUserContext } from "../_shared/ai-core/user-block.ts";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;
  const telemetry = startAIExecution({
    task: "diretor_comercial_gemini",
    userId: auth.userId,
    authHeader: req.headers.get("Authorization") ?? req.headers.get("authorization"),
    specialist: "diretor_comercial",
    promptId: "diretor.painel.executivo",
    sources: ["snapshot", "memory"],
    toolsUsed: ["memory.retrieve"],
  });
  try {
    const body = await req.json().catch(() => ({}));
    const snapshot = body?.snapshot;
    if (!snapshot || typeof snapshot !== "object") {
      return new Response(
        JSON.stringify({ error: "Snapshot ausente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const memory = createMemoryEngine();
    const { block: memoryBlock } = await memory.get({
      scope: "global",
      queryText: `Diretor comercial diário. Snapshot: ${JSON.stringify(snapshot).slice(0, 1500)}`,
      matchCount: 5,
      minSimilarity: 0.4,
      includePatterns: true,
    });

    const snapshotSafe = sanitizeExternal(JSON.stringify(snapshot), 40000);
    const previousRaw = typeof body?.previousAnalysis === "string" ? body.previousAnalysis : "";
    const previousBlock = previousRaw
      ? wrapUntrusted(sanitizeExternal(previousRaw, 2000), {
          maxChars: 2000,
          label: "ANÁLISE DO DIA ANTERIOR (não repita o mesmo texto; mostre evolução)",
        }) + "\n\n"
      : "";
    const userContextBlock = buildUserContextBlock(parseUserContext(body?.userContext));

    const userPrompt =
      `Data de referência: ${snapshot.today ?? new Date().toISOString().slice(0, 10)}\n\n` +
      (userContextBlock ? userContextBlock + "\n\n" : "") +
      buildBusinessCalendarBlock() + "\n\n" +
      (memoryBlock ? memoryBlock + "\n\n" : "") +
      previousBlock +
      wrapUntrusted(snapshotSafe, { maxChars: 40000, label: "SNAPSHOT DA OPERAÇÃO (JSON)" }) +
      `\n\nGere o parecer executivo no formato JSON descrito.`;

    let result;
    try {
      result = await callGeminiDirect({
        model: "gemini-2.5-flash",
        systemInstruction: composeSystem("diretor.painel.executivo", UNTRUSTED_INPUT_SYSTEM_CLAUSE, NBA_PROMPT_BLOCK),
        userPrompt,
        jsonMode: true,
        temperature: 0.3,
        maxOutputTokens: 2000,
      });
    } catch (e) {
      const err = e as GeminiCallError;
      const status = err.status ?? 502;
      await telemetry.failure(err, { inputChars: userPrompt.length });
      const friendly =
        status === 429
          ? "Limite de requisições atingido. Tente novamente em instantes."
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
    const asStr = (v: any, max: number): string =>
      typeof v === "string" ? v.trim().slice(0, max) : "";

    const analise = {
      diagnostico: asStr(parsed.diagnostico, 600),
      gargalo: {
        titulo: asStr(parsed?.gargalo?.titulo, 90),
        evidencia: asStr(parsed?.gargalo?.evidencia, 260),
      },
      impactoFinanceiro: asStr(parsed.impactoFinanceiro, 360),
      decisaoDoDia: asStr(parsed.decisaoDoDia, 400),
      planoDeAtaque: asArr(parsed.planoDeAtaque, 3),
      tendencia: asStr(parsed.tendencia, 220),
    };

    const painel = {
      resumoOntem: asArr(parsed.resumoOntem, 6),
      atencao: analise.gargalo.titulo
        ? [analise.gargalo.titulo, analise.gargalo.evidencia].filter(Boolean)
        : asArr(parsed.atencao, 3),
      oportunidades: asArr(parsed.oportunidades, 4),
      prioridades: analise.planoDeAtaque.length
        ? analise.planoDeAtaque
        : asArr(parsed.prioridades, 6),
      dica: analise.decisaoDoDia || asStr(parsed.dica, 320),
    };

    const nba = sanitizeNBA(extractNBA(parsed), {
      interactionsCount: 1,
      callNotesCount: 1,
    });

    await telemetry.success({
      model: result.modelUsed ?? null,
      inputChars: userPrompt.length,
      outputChars: String(raw ?? "").length,
    });

    return new Response(
      JSON.stringify({
        painel,
        analise,
        nextBestAction: nba,
        model: result.modelUsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(JSON.stringify({ evt: "diretor_comercial_gemini_error", msg: (e as Error).message }));
    await telemetry.failure(e);
    return new Response(
      JSON.stringify({ error: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
