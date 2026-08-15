import { describe, it, expect, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("@/shared/services/userStorage", () => ({
  uload: <T,>(k: string, fb: T) => (store.has(k) ? (store.get(k) as T) : fb),
  usave: <T,>(k: string, v: T) => { store.set(k, v); },
}));

const aiSpy = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => aiSpy(...a) } },
}));

import { emptyReport, type DailyMetricsReport } from "./dailyMetricsReport";
import {
  buildDiagnosis, buildChannelSteps, buildEfficiency, buildOpportunities,
  buildPriorities, ratingFromGoal, classify, REFERENCES,
} from "./dailyDiagnosis";

const make = (over: Partial<DailyMetricsReport> = {}): DailyMetricsReport => ({
  ...emptyReport("2026-08-15"),
  ...over,
});

const full = () => make({
  general: { niche: "clínicas", region: "SP", meetingsGoal: 4, hours: 2, minutes: 0 },
  calls: { calls: 100, connections: 20, decisionMakers: 10, r1: 2 },
  blasts: { sent: 200, opened: 50, decisionMakers: 10, meetings: 1 },
  followups: { sent: 40, decisionMakers: 10, meetings: 1 },
});

describe("Sprint 2 — diagnóstico modular por regras", () => {
  it("avaliação geral segue faixas transparentes de meta atingida", () => {
    expect(ratingFromGoal(null)).toBeNull();
    expect(ratingFromGoal(10)).toBe("critico");
    expect(ratingFromGoal(50)).toBe("atencao");
    expect(ratingFromGoal(80)).toBe("moderado");
    expect(ratingFromGoal(100)).toBe("bom");
    expect(ratingFromGoal(130)).toBe("excelente");
  });

  it("análise por canal usa as fórmulas da Sprint 1", () => {
    const steps = buildChannelSteps(full());
    const by = Object.fromEntries(steps.map((s) => [s.key, s.value]));
    expect(by["calls.connection"]).toBe(20);
    expect(by["calls.decisionMaker"]).toBe(50);
    expect(by["calls.r1"]).toBe(20);
    expect(by["blasts.open"]).toBe(25);
    expect(by["followups.decisionMaker"]).toBe(25);
    expect(steps).toHaveLength(8);
  });

  it("denominador vazio classifica como Sem dados", () => {
    const steps = buildChannelSteps(make());
    expect(steps.every((s) => s.classification === "sem-dados")).toBe(true);
    expect(classify(null, REFERENCES["calls.connection"])).toBe("sem-dados");
  });

  it("nenhum módulo tem parágrafo excessivamente longo", () => {
    const d = buildDiagnosis(full());
    const texts = [
      d.summary,
      ...d.steps.flatMap((s) => [s.explanation, s.recommendation]),
      ...d.opportunities.map((o) => o.note),
      ...d.whatWorked,
      ...d.priorities.flatMap((p) => [p.explanation, p.action]),
      ...d.plan.flatMap((a) => [a.title, a.reason, a.expected]),
    ];
    for (const t of texts) expect(t.length).toBeLessThanOrEqual(200);
  });

  it("oportunidades não prometem resultado comercial", () => {
    const rows = buildOpportunities(full());
    expect(rows).toHaveLength(3);
    expect(rows[0].gap).toBe(8);
    for (const r of rows) {
      expect(r.note).not.toMatch(/potencial de vendas|garant|vai fechar|recuperad/i);
    }
    expect(rows[0].note).toMatch(/podem ser priorizados/);
  });

  it("eficiência por hora exige tempo maior que zero", () => {
    const semTempo = buildEfficiency(make({ calls: { calls: 50, connections: null, decisionMakers: null, r1: null } }));
    expect(semTempo.every((e) => e.value === null)).toBe(true);
    const comTempo = buildEfficiency(full());
    expect(comTempo[0].value).toBe(50);
    expect(comTempo[3].value).toBe(2);
  });

  it("prioridades têm no máximo três itens", () => {
    const ruim = make({
      calls: { calls: 100, connections: 2, decisionMakers: 0, r1: 0 },
      blasts: { sent: 100, opened: 5, decisionMakers: 0, meetings: 0 },
      followups: { sent: 100, decisionMakers: 1, meetings: 0 },
    });
    const p = buildPriorities(buildChannelSteps(ruim));
    expect(p.length).toBeLessThanOrEqual(3);
    expect(p[0].impact).toBe("alto");
  });

  it("plano do próximo dia tem exatamente três ações", () => {
    expect(buildDiagnosis(full()).plan).toHaveLength(3);
    expect(buildDiagnosis(make()).plan).toHaveLength(3);
  });

  it("comparação com fechamento anterior quando existir", () => {
    const prev = make({ date: "2026-08-14", calls: { calls: 10, connections: 5, decisionMakers: 3, r1: 1 } });
    const d = buildDiagnosis(full(), [full(), prev]);
    expect(d.comparison).toMatch(/2026-08-14/);
    expect(buildDiagnosis(full(), []).comparison).toBeNull();
  });

  it("diagnóstico por regras não chama IA", () => {
    buildDiagnosis(full(), [full()]);
    expect(aiSpy).not.toHaveBeenCalled();
  });

  it("o motor de diagnóstico não importa IA nem fontes proibidas", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/modules/intelligence/services/dailyDiagnosis.ts", "utf8");
    expect(src).not.toMatch(/dailyMetricsAI|supabase|activityLedger|matteline/i);
  });
});
