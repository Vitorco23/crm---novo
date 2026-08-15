// Chamada opcional de IA para o fechamento diário.
// NUNCA é executada automaticamente: só é chamada por clique explícito na UI.

import { supabase } from "@/integrations/supabase/client";
import type { AiPayload, AiAnalysis } from "./dailyMetricsReport";

export async function requestDailyAiAnalysis(payload: AiPayload): Promise<AiAnalysis> {
  const { data, error } = await supabase.functions.invoke("metrics-daily-analysis", {
    body: { payload },
  });
  if (error) throw new Error(error.message || "Falha ao gerar análise com IA");
  if (!data?.text) throw new Error(data?.error || "Resposta vazia da IA");
  return {
    text: String(data.text),
    model: data.model ? String(data.model) : undefined,
    generatedAt: data.generatedAt ? String(data.generatedAt) : new Date().toISOString(),
  };
}
