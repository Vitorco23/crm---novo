// Chamada opcional de IA para o fechamento diário.
// NUNCA é executada automaticamente: só é chamada por clique explícito na UI.
// Sprint 2: a resposta é um JSON validado no backend, renderizado em módulos.

import { supabase } from "@/integrations/supabase/client";
import type { AiPayload, AiAnalysis, AiStructured } from "./dailyMetricsReport";

function isValid(d: unknown): d is AiStructured {
  const o = d as AiStructured | null;
  return !!o
    && typeof o.executiveSummary === "string"
    && Array.isArray(o.strengths)
    && Array.isArray(o.bottlenecks)
    && Array.isArray(o.nextActions)
    && typeof o.attentionPoint === "string";
}

export async function requestDailyAiAnalysis(payload: AiPayload): Promise<AiAnalysis> {
  const { data, error } = await supabase.functions.invoke("metrics-daily-analysis", {
    body: { payload },
  });
  if (error) throw new Error(error.message || "Falha ao gerar análise com IA");
  if (data?.error) throw new Error(String(data.error));
  if (!isValid(data?.analysis)) {
    throw new Error("A IA devolveu uma resposta fora do formato esperado. Tente novamente.");
  }
  return {
    data: data.analysis as AiStructured,
    model: data.model ? String(data.model) : undefined,
    generatedAt: data.generatedAt ? String(data.generatedAt) : new Date().toISOString(),
  };
}
