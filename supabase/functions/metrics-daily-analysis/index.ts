// Análise opcional do fechamento diário de métricas.
// Só executa mediante clique explícito do usuário na página /inteligencia/metricas.
// Recebe APENAS números agregados e texto digitado pelo vendedor.
// Nenhuma lista de leads, telefone, interação, transcrição ou áudio trafega aqui.
// Sprint 2: a resposta é JSON estruturado e validado no backend.

import { callAI } from "../_shared/ai-router.ts";
import { requireUser } from "../_shared/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `Você é um gestor comercial sênior analisando o fechamento diário de um SDR/closer B2B.
Receberá apenas números agregados do dia, taxas calculadas e o contexto escrito pelo vendedor.

Responda EXCLUSIVAMENTE com um objeto JSON válido, sem markdown, sem tabelas, sem texto fora do JSON:
{
  "executiveSummary": "no máximo 2 frases",
  "strengths": [{ "title": "texto curto", "evidence": "dado que sustenta a conclusão" }],
  "bottlenecks": [{ "stage": "etapa", "evidence": "dado observado", "interpretation": "interpretação curta" }],
  "nextActions": [{ "title": "ação", "reason": "motivo", "suggestedTime": "opcional" }],
  "attentionPoint": "texto curto"
}

Regras:
- No máximo 3 strengths, no máximo 3 bottlenecks, EXATAMENTE 3 nextActions.
- Nenhuma propriedade pode conter parágrafos longos (máximo ~200 caracteres cada).
- Nenhuma recomendação sem evidência numérica presente no payload.
- Não invente causalidade nem dados ausentes. Quando faltar denominador, diga que a base é insuficiente.
- Português do Brasil.`;

interface Strength { title: string; evidence: string }
interface Bottleneck { stage: string; evidence: string; interpretation: string }
interface NextAction { title: string; reason: string; suggestedTime?: string }
interface Analysis {
  executiveSummary: string;
  strengths: Strength[];
  bottlenecks: Bottleneck[];
  nextActions: NextAction[];
  attentionPoint: string;
}

const str = (v: unknown, max = 240): string =>
  typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";

function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s < 0 || e <= s) return null;
    try { return JSON.parse(cleaned.slice(s, e + 1)); } catch { return null; }
  }
}

/** Validação estrita: retorna null quando o contrato não é cumprido. */
export function validateAnalysis(parsed: unknown): Analysis | null {
  const o = parsed as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;

  const executiveSummary = str(o.executiveSummary, 320);
  const attentionPoint = str(o.attentionPoint, 240);
  if (!executiveSummary) return null;

  const arr = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];

  const strengths: Strength[] = arr(o.strengths)
    .map((s) => ({ title: str(s.title, 120), evidence: str(s.evidence) }))
    .filter((s) => s.title && s.evidence)
    .slice(0, 3);

  const bottlenecks: Bottleneck[] = arr(o.bottlenecks)
    .map((b) => ({ stage: str(b.stage, 120), evidence: str(b.evidence), interpretation: str(b.interpretation) }))
    .filter((b) => b.stage && b.evidence)
    .slice(0, 3);

  const nextActions: NextAction[] = arr(o.nextActions)
    .map((a) => {
      const time = str(a.suggestedTime, 40);
      return { title: str(a.title, 140), reason: str(a.reason), ...(time ? { suggestedTime: time } : {}) };
    })
    .filter((a) => a.title && a.reason)
    .slice(0, 3);

  if (nextActions.length !== 3) return null;

  return { executiveSummary, strengths, bottlenecks, nextActions, attentionPoint };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const payload = body?.payload;
    if (!payload || typeof payload !== "object") return json({ error: "Payload ausente" }, 400);

    const user = `Fechamento do dia (dados agregados, sem identificação de leads):\n${JSON.stringify(payload).slice(0, 6000)}\n\nResponda apenas com o JSON no formato definido.`;

    const result = await callAI({
      task: "auto_diagnosis",
      system: SYSTEM,
      user,
      json: true,
      temperature: 0.2,
      maxTokens: 900,
    });

    const analysis = validateAnalysis(extractJson(result.content));
    if (!analysis) {
      return json({ error: "A IA devolveu uma resposta fora do formato esperado. Tente novamente." }, 422);
    }

    return json({
      analysis,
      model: result.modelUsed,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return json({ error: (e as Error).message || "Falha na análise" }, 500);
  }
});
