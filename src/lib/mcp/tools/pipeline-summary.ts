import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { loadKey, requireAuth, text } from "../_helpers";

type Lead = { stage: string; contractValue?: number };

const STAGE_KEYS: Record<string, string> = {
  cold_call: "p21_stages_cold_call",
  oportunidades: "p21_stages_oportunidades",
  onboarding: "p21_stages_onboarding",
};

export default defineTool({
  name: "pipeline_summary",
  title: "Resumo do pipeline",
  description:
    "Retorna, por etapa do pipeline escolhido, a contagem de leads e a soma de valores de contrato. Útil para 'quanto tenho em negociação' ou 'quantos leads em cada etapa'.",
  inputSchema: {
    pipeline: z.enum(["cold_call", "oportunidades", "onboarding"]).describe("Qual pipeline resumir."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ pipeline }, ctx) => {
    requireAuth(ctx);
    const [leads, stages] = await Promise.all([
      loadKey<Lead[]>(ctx, "p21_leads", []),
      loadKey<string[]>(ctx, STAGE_KEYS[pipeline], []),
    ]);
    const stageSet = new Set(stages);
    const inPipeline = leads.filter((l) => stageSet.has(l.stage));
    const byStage = stages.map((stage) => {
      const rows = inPipeline.filter((l) => l.stage === stage);
      const total = rows.reduce((sum, l) => sum + (l.contractValue ?? 0), 0);
      return { stage, leads: rows.length, contractTotal: total };
    });
    const totals = {
      leads: inPipeline.length,
      contractTotal: inPipeline.reduce((s, l) => s + (l.contractValue ?? 0), 0),
    };
    return text({ pipeline, totals, stages: byStage }, totals);
  },
});
