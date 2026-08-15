import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map<string, unknown>();

vi.mock("@/shared/services/userStorage", () => ({
  uload: <T,>(k: string, fb: T) => (store.has(k) ? (store.get(k) as T) : fb),
  usave: <T,>(k: string, v: T) => { store.set(k, v); },
}));

const summary = {
  total: 0,
  byChannel: { call: 0, message: 0, email: 0, followup: 0, meeting: 0, other: 0 },
  confirmedByChannel: { call: 10, message: 2, email: 0, followup: 0, meeting: 0, other: 0 },
  estimatedByChannel: { call: 3, message: 5, email: 0, followup: 1, meeting: 0, other: 0 },
  bySource: { call: {}, message: {}, email: {}, followup: {}, meeting: {}, other: {} },
  totalConfirmed: 12,
  totalEstimated: 9,
};

vi.mock("@/shared/services/activityLedger", () => ({
  summarizeActivity: () => summary,
  getActivityLedger: () => [],
}));

vi.mock("@/shared/services/store", () => ({
  getSessions: () => [],
  getMeetings: () => [],
}));

const aiSpy = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => aiSpy(...a) } },
}));

import {
  DAILY_METRICS_KEY, buildAutoMetrics, saveReport, getReport, listReports,
  buildRuleDiagnosis, buildAiPayload, emptyManual, emptyResults, emptyQualitative,
  type DailyMetricsReport,
} from "./dailyMetricsReport";

function makeReport(date: string, over: Partial<DailyMetricsReport> = {}): DailyMetricsReport {
  return {
    date,
    updatedAt: new Date().toISOString(),
    auto: buildAutoMetrics(date),
    manual: emptyManual(),
    results: emptyResults(),
    qualitative: emptyQualitative(),
    ai: null,
    ...over,
  };
}

beforeEach(() => { store.clear(); aiSpy.mockReset(); });

describe("fechamento diário de métricas", () => {
  it("1) salva e edita o mesmo dia sem duplicar", () => {
    saveReport(makeReport("2026-08-10"));
    saveReport(makeReport("2026-08-10", { results: { ...emptyResults(), sales: 2 } }));
    const all = store.get(DAILY_METRICS_KEY) as DailyMetricsReport[];
    expect(all.filter((r) => r.date === "2026-08-10")).toHaveLength(1);
    expect(getReport("2026-08-10")?.results.sales).toBe(2);
  });

  it("2) trocar data carrega o relatório correto", () => {
    saveReport(makeReport("2026-08-10", { results: { ...emptyResults(), sales: 1 } }));
    saveReport(makeReport("2026-08-11", { results: { ...emptyResults(), sales: 5 } }));
    expect(getReport("2026-08-10")?.results.sales).toBe(1);
    expect(getReport("2026-08-11")?.results.sales).toBe(5);
    expect(listReports()[0].date).toBe("2026-08-11");
  });

  it("3) diagnóstico por regras não chama IA", () => {
    const d = buildRuleDiagnosis(makeReport("2026-08-12"));
    expect(aiSpy).not.toHaveBeenCalled();
    expect(d.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(d.suggestedGoals.length).toBeGreaterThan(0);
  });

  it("8) métricas separam confirmado x estimado", () => {
    const a = buildAutoMetrics("2026-08-12");
    expect(a.callsConfirmed).toBe(10);
    expect(a.callsEstimated).toBe(3);
    expect(a.messagesConfirmed).toBe(2);
    expect(a.totalEstimated).toBe(9);
  });

  it("alerta de dado insuficiente quando não há denominador", () => {
    const d = buildRuleDiagnosis(makeReport("2026-08-12"));
    expect(d.warnings.join(" ")).toMatch(/sem denominador|base confiável|não passou pelo discador/i);
    expect(d.rates.meetingRate).toBeNull();
  });

  it("taxas calculadas quando há denominador", () => {
    const r = makeReport("2026-08-12", {
      results: { decisionMakerConnections: 5, meetingsScheduled: 1, proposals: 1, sales: 1, revenue: 1000 },
    });
    const d = buildRuleDiagnosis(r);
    expect(d.rates.connectionRate).toBe(50);
    expect(d.rates.meetingRate).toBe(20);
    expect(d.rates.saleRate).toBe(100);
  });

  it("6) payload da IA não contém leads, telefone, interação, transcrição nem áudio", () => {
    const r = makeReport("2026-08-12", { qualitative: { mainObjection: "preço", bottleneck: "", learning: "" } });
    const payload = buildAiPayload(r, [makeReport("2026-08-11")]);
    const json = JSON.stringify(payload);
    expect(json).not.toMatch(/lead|telefone|phone|transcri|audio|áudio|interaction|dashboard/i);
    expect(payload.history7.days).toBe(1);
    expect(payload.metrics.callsConfirmed).toBe(10);
    expect(Object.keys(payload).sort()).toEqual(
      ["date", "history7", "manual", "metrics", "qualitative", "rates", "results"]
    );
  });

  it("7) falha da IA preserva relatório e diagnóstico local", async () => {
    saveReport(makeReport("2026-08-12"));
    aiSpy.mockResolvedValue({ data: null, error: { message: "429" } });
    const { requestDailyAiAnalysis } = await import("./dailyMetricsAI");
    await expect(requestDailyAiAnalysis(buildAiPayload(getReport("2026-08-12")!))).rejects.toThrow();
    expect(getReport("2026-08-12")).not.toBeNull();
    expect(buildRuleDiagnosis(getReport("2026-08-12")!).summary).toContain("confirmada");
  });

  it("5) chamada de IA acontece exatamente uma vez por clique", async () => {
    aiSpy.mockResolvedValue({ data: { text: "ok", model: "m", generatedAt: "2026-08-12T00:00:00Z" }, error: null });
    const { requestDailyAiAnalysis } = await import("./dailyMetricsAI");
    const out = await requestDailyAiAnalysis(buildAiPayload(makeReport("2026-08-12")));
    expect(aiSpy).toHaveBeenCalledTimes(1);
    expect(out.text).toBe("ok");
  });

  it("metas sugeridas usam histórico recente", () => {
    const hist = [
      makeReport("2026-08-11", { results: { ...emptyResults(), meetingsScheduled: 2 } }),
      makeReport("2026-08-10", { results: { ...emptyResults(), meetingsScheduled: 4 } }),
    ];
    const d = buildRuleDiagnosis(makeReport("2026-08-12"), hist);
    expect(d.suggestedGoals.join(" ")).toMatch(/média recente/);
  });
});
