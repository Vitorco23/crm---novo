import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map<string, unknown>();

vi.mock("@/shared/services/userStorage", () => ({
  uload: <T,>(k: string, fb: T) => (store.has(k) ? (store.get(k) as T) : fb),
  usave: <T,>(k: string, v: T) => { store.set(k, v); },
}));

const aiSpy = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => aiSpy(...a) } },
}));

import {
  DAILY_METRICS_KEY, emptyReport, saveReport, getReport, listReports,
  callsRates, blastsRates, followupsRates, fmtRate, buildInstantSummary,
  buildAiPayload, filterHistory, migrateReport, totalMinutes,
  type DailyMetricsReport,
} from "./dailyMetricsReport";

beforeEach(() => { store.clear(); aiSpy.mockReset(); });

const make = (date: string, over: Partial<DailyMetricsReport> = {}): DailyMetricsReport => ({
  ...emptyReport(date),
  ...over,
});

describe("fechamento diário manual", () => {
  it("todos os campos operacionais iniciam vazios", () => {
    const r = emptyReport("2026-08-15");
    expect(Object.values(r.calls)).toEqual([null, null, null, null]);
    expect(Object.values(r.blasts)).toEqual([null, null, null, null]);
    expect(Object.values(r.followups)).toEqual([null, null, null]);
    expect(r.outcome).toEqual({ sales: null, revenue: null });
    expect(r.general.meetingsGoal).toBeNull();
  });

  it("não importa dados do activityLedger nem da Matteline", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/modules/intelligence/services/dailyMetricsReport.ts", "utf8"));
    expect(src).not.toMatch(/activityLedger|matteline|callface|summarizeActivity|getSessions/i);
  });

  it("taxas: denominador vazio ou zero retorna null e exibe —", () => {
    const r = emptyReport("2026-08-15");
    expect(callsRates(r.calls).connection).toBeNull();
    expect(fmtRate(null)).toBe("—");
    r.calls = { calls: 0, connections: 3, decisionMakers: null, r1: null };
    expect(callsRates(r.calls).connection).toBeNull();
  });

  it("cálculos funcionam com valores preenchidos", () => {
    expect(callsRates({ calls: 100, connections: 20, decisionMakers: 10, r1: 2 })).toEqual({
      connection: 20, decisionMaker: 50, r1: 20,
    });
    expect(blastsRates({ sent: 200, opened: 50, decisionMakers: 10, meetings: 5 })).toEqual({
      open: 25, decisionMaker: 20, meeting: 50,
    });
    expect(followupsRates({ sent: 40, decisionMakers: 10, meetings: 4 })).toEqual({
      decisionMaker: 25, meeting: 40,
    });
  });

  it("salvar o mesmo dia não duplica e edita corretamente", () => {
    saveReport(make("2026-08-10"));
    saveReport(make("2026-08-10", { outcome: { sales: 2, revenue: 1000 } }));
    const all = store.get(DAILY_METRICS_KEY) as DailyMetricsReport[];
    expect(all.filter((r) => r.date === "2026-08-10")).toHaveLength(1);
    expect(getReport("2026-08-10")?.outcome.sales).toBe(2);
  });

  it("trocar a data carrega o relatório correto", () => {
    saveReport(make("2026-08-10", { calls: { calls: 10, connections: null, decisionMakers: null, r1: null } }));
    saveReport(make("2026-08-11", { calls: { calls: 50, connections: null, decisionMakers: null, r1: null } }));
    expect(getReport("2026-08-10")?.calls.calls).toBe(10);
    expect(getReport("2026-08-11")?.calls.calls).toBe(50);
    expect(listReports()[0].date).toBe("2026-08-11");
  });

  it("vazio não é salvo como zero", () => {
    saveReport(make("2026-08-12"));
    expect(getReport("2026-08-12")?.calls.calls).toBeNull();
  });

  it("R1 existe uma única vez na persistência (canal Ligações)", () => {
    const r = make("2026-08-12", { calls: { calls: 10, connections: 5, decisionMakers: 4, r1: 3 } });
    saveReport(r);
    const persisted = getReport("2026-08-12")!;
    expect(persisted.calls.r1).toBe(3);
    expect((persisted.outcome as unknown as Record<string, unknown>).r1).toBeUndefined();
    expect(buildAiPayload(persisted).outcome.r1).toBe(3);
  });

  it("resumo instantâneo usa apenas dados manuais", () => {
    const r = make("2026-08-12", {
      general: { niche: "", region: "", meetingsGoal: 4, hours: 2, minutes: 0 },
      calls: { calls: 30, connections: 10, decisionMakers: 5, r1: 1 },
      blasts: { sent: null, opened: null, decisionMakers: null, meetings: 2 },
      followups: { sent: null, decisionMakers: null, meetings: null },
    });
    const s = buildInstantSummary(r);
    expect(s.meetingsScheduled).toBe(3);
    expect(s.meetingsPerHour).toBe(1.5);
    expect(s.channels).toEqual(["Ligações", "Disparos"]);
    expect(totalMinutes(r.general)).toBe(120);
  });

  it("histórico semanal e mensal filtram corretamente", () => {
    const ref = new Date(2026, 7, 15); // sábado
    const reports = [make("2026-08-15"), make("2026-08-10"), make("2026-07-30")];
    expect(filterHistory(reports, "week", ref).map((r) => r.date)).toEqual(["2026-08-15", "2026-08-10"]);
    expect(filterHistory(reports, "month", ref)).toHaveLength(2);
  });

  it("migração v1 preserva histórico compatível", () => {
    const legacy = {
      date: "2026-08-01",
      results: { decisionMakerConnections: 7, meetingsScheduled: 2, sales: 1, revenue: 500 },
      qualitative: { mainObjection: "preço", bottleneck: "lista", learning: "x" },
    };
    const m = migrateReport(legacy)!;
    expect(m.version).toBe(2);
    expect(m.calls.decisionMakers).toBe(7);
    expect(m.outcome.revenue).toBe(500);
    expect(m.context.objection).toBe("preço");
  });

  it("nenhuma chamada de IA ao abrir, preencher ou salvar", () => {
    saveReport(make("2026-08-12"));
    buildInstantSummary(getReport("2026-08-12")!);
    buildAiPayload(getReport("2026-08-12")!);
    expect(aiSpy).not.toHaveBeenCalled();
  });

  it("IA acontece exatamente uma vez por clique", async () => {
    aiSpy.mockResolvedValue({ data: { text: "ok", model: "m", generatedAt: "2026-08-12T00:00:00Z" }, error: null });
    const { requestDailyAiAnalysis } = await import("./dailyMetricsAI");
    const out = await requestDailyAiAnalysis(buildAiPayload(make("2026-08-12")));
    expect(aiSpy).toHaveBeenCalledTimes(1);
    expect(out.text).toBe("ok");
  });
});
