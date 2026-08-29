import { describe, it, expect, beforeEach, vi } from "vitest";

// Storage em memória — evita tocar Supabase/localStorage reais. Mesma
// abordagem de commercialActivity.test.ts/activityLedger.test.ts: mockar só
// userStorage e deixar todo o código de produção real rodar por cima.
const mem: Record<string, unknown> = {};
vi.mock("@/shared/services/userStorage", () => ({
  uload: <T,>(k: string, fallback: T): T => (mem[k] as T) ?? fallback,
  usave: <T,>(k: string, v: T) => { mem[k] = v; },
}));

import { getCommercialContext } from "./commercialContext";

const NOW = new Date("2026-08-15T14:00:00.000Z"); // 14:00 UTC
const iso = (h: number, m = 0) => new Date(Date.UTC(2026, 7, 15, h, m)).toISOString();

function seedGoals(overrides: Partial<Record<string, number>> = {}) {
  mem["p21_goals_settings"] = {
    monthlyRevenueGoal: 10000,
    averageTicket: 1000,
    callToConnection: 20,
    connectionToDecisionMaker: 30,
    decisionMakerToMeetingScheduled: 10,
    meetingScheduledToHeld: 70,
    meetingHeldToClose: 20,
    workingDaysPerWeek: 5,
    hoursPerDay: 4,
    minutesPerCall: 5,
    ...overrides,
  };
}

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id || "L1",
    company: "Empresa Teste",
    icpStars: 3,
    runsAds: false,
    stage: "Tentativa 2",
    stageChangedAt: iso(9),
    createdAt: iso(9),
    ...overrides,
  };
}

beforeEach(() => {
  for (const k of Object.keys(mem)) delete mem[k];
  seedGoals();
});

describe("getCommercialContext — casos mínimos exigidos", () => {
  it("1) contexto sem nenhuma atividade — tudo em zero, sem crash", () => {
    const ctx = getCommercialContext({ now: NOW });
    expect(ctx.activity.calls).toBe(0);
    expect(ctx.progress.calls.done).toBe(0);
    expect(ctx.followUps.overdueCount).toBe(0);
    expect(ctx.tasks.overdueCount).toBe(0);
    expect(ctx.pipeline.openTotal).toBe(0);
    expect(ctx.priorities).toEqual([]);
    expect(ctx.productivity.minutesToday).toBe(0);
  });

  it("2) atividade parcial do dia reflete no progresso", () => {
    mem["p21_activity_ledger"] = [
      { id: "e1", at: iso(9), leadId: "L1", channel: "call", source: "callface", externalKey: "inbound:r1" },
      { id: "e2", at: iso(10), leadId: "L2", channel: "call", source: "cadence_attempt", outcome: "sem_resposta" },
    ];
    const ctx = getCommercialContext({ now: NOW });
    expect(ctx.activity.calls).toBe(2);
    expect(ctx.progress.calls.done).toBe(2);
    expect(ctx.progress.calls.goal).toBeGreaterThan(0);
  });

  it("3) meta atingida — remaining vira 0 e progressPct >= 100", () => {
    seedGoals({ monthlyRevenueGoal: 1, averageTicket: 1000 }); // meta diária de calls bem baixa
    const events = [];
    for (let i = 0; i < 20; i++) {
      events.push({ id: `e${i}`, at: iso(9), leadId: `L${i}`, channel: "call", source: "cadence_attempt", outcome: "sem_resposta" });
    }
    mem["p21_activity_ledger"] = events;
    const ctx = getCommercialContext({ now: NOW });
    expect(ctx.progress.calls.done).toBeGreaterThanOrEqual(ctx.progress.calls.goal);
    expect(ctx.progress.calls.remaining).toBe(0);
    expect(ctx.progress.calls.progressPct).toBeGreaterThanOrEqual(100);
  });

  it("4) remaining nunca fica negativo mesmo super-batendo a meta", () => {
    const ctx = getCommercialContext({ now: NOW });
    // meta 0 (nenhuma atividade de meta configurada de forma a zerar) + done 0 já testa o piso;
    // aqui forçamos done > goal artificialmente via um goal minúsculo.
    seedGoals({ monthlyRevenueGoal: 1, averageTicket: 100000 });
    mem["p21_activity_ledger"] = [
      { id: "e1", at: iso(9), leadId: "L1", channel: "call", source: "callface", externalKey: "inbound:r1" },
    ];
    const ctx2 = getCommercialContext({ now: NOW });
    expect(ctx2.progress.calls.remaining).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(ctx2.progress.calls.progressPct)).toBe(true);
    expect(ctx.progress.calls.remaining).toBeGreaterThanOrEqual(0);
  });

  it("5) reunião futura hoje aparece em upcoming/next com minutesToNext coerente", () => {
    // Meeting.date/time é interpretado como hora local (mesma regra de
    // priorityEngine.meetingAt) — usamos `now` local aqui para o diff de
    // minutos ser determinístico independente do fuso da máquina de teste.
    const localNow = new Date(2026, 7, 15, 14, 0, 0);
    mem["p21_meetings"] = [
      { id: "m1", leadId: "L1", company: "ACME", date: "2026-08-15", time: "15:00", title: "R1", contactName: "", channel: "Google Meet", source: "Ligação", createdAt: iso(9) },
    ];
    const ctx = getCommercialContext({ now: localNow });
    expect(ctx.meetings.today.length).toBe(1);
    expect(ctx.meetings.upcoming.length).toBe(1);
    expect(ctx.meetings.past.length).toBe(0);
    expect(ctx.meetings.next?.id).toBe("m1");
    expect(ctx.meetings.minutesToNext).toBe(60);
  });

  it("6) ausência de reunião — next/minutesToNext nulos, listas vazias", () => {
    const ctx = getCommercialContext({ now: NOW });
    expect(ctx.meetings.today).toEqual([]);
    expect(ctx.meetings.next).toBeNull();
    expect(ctx.meetings.minutesToNext).toBeNull();
  });

  it("7) follow-up vencido conta em overdueCount e aparece em items", () => {
    mem["p21_reminders"] = [
      { id: "r1", leadId: "L1", kind: "cadence:manual", title: "Retornar", message: "", scheduledFor: iso(8), status: "pending", createdAt: iso(7) },
    ];
    const ctx = getCommercialContext({ now: NOW });
    expect(ctx.followUps.overdueCount).toBe(1);
    expect(ctx.followUps.items.some((i) => i.id === "r1")).toBe(true);
  });

  it("8) prioridade existente aparece na lista, sem alterar score/tier/ordenação do engine", () => {
    mem["p21_leads"] = [
      makeLead({ id: "L1", stage: "Tentativa 3" }),
    ];
    mem["p21_reminders"] = [
      { id: "r1", leadId: "L1", kind: "cadence:manual", title: "x", message: "", scheduledFor: iso(8), status: "pending", createdAt: iso(7) },
      { id: "r2", leadId: "L1", kind: "cadence:manual", title: "y", message: "", scheduledFor: iso(8, 5), status: "pending", createdAt: iso(7) },
      { id: "r3", leadId: "L1", kind: "cadence:manual", title: "z", message: "", scheduledFor: iso(8, 10), status: "pending", createdAt: iso(7) },
    ];
    const ctx = getCommercialContext({ now: NOW });
    const found = ctx.priorities.find((p) => p.leadId === "L1");
    expect(found).toBeDefined();
    expect(found?.score).toBeGreaterThan(0);
  });

  it("9) ausência de perfil — profile vem null sem quebrar nada", () => {
    const ctx = getCommercialContext({ now: NOW });
    expect(ctx.profile).toBeNull();
  });

  it("perfil informado é repassado como veio, sem dado pessoal extra", () => {
    const ctx = getCommercialContext({ now: NOW, profile: { name: "Vitor", role: "Gestor", company: "Performance21" } });
    expect(ctx.profile).toEqual({ name: "Vitor", role: "Gestor", company: "Performance21" });
  });

  it("10) pipeline vazio não quebra e devolve zeros", () => {
    const ctx = getCommercialContext({ now: NOW });
    expect(ctx.pipeline.openTotal).toBe(0);
    expect(ctx.pipeline.byStage).toEqual({});
    expect(ctx.pipeline.hotCount).toBe(0);
    expect(ctx.pipeline.openValue).toBe(0);
  });

  it("11) métricas de ligação vêm de commercialActivity, não de contagem própria", () => {
    mem["p21_activity_ledger"] = [
      { id: "e1", at: iso(9), leadId: "L1", channel: "call", source: "callface", externalKey: "inbound:r1" },
      { id: "e2", at: iso(10), leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "sem_interesse", relatedExternalKey: "inbound:r1" }, // deduplicado
    ];
    const ctx = getCommercialContext({ now: NOW });
    expect(ctx.activity.calls).toBe(1); // dedupe explícito do Sprint 2A preservado
    expect(ctx.progress.calls.done).toBe(1);
  });

  it("12) Pomodoro nunca substitui calls/connections/decisionMakers/reuniões — só alimenta productivity", () => {
    mem["p21_sessions"] = [
      { id: "s1", startTime: iso(9), endTime: iso(9, 30), durationMinutes: 30, calls: 40, connections: 20, decisionMakers: 10, meetings: 5 },
    ];
    // Nenhum evento real no activityLedger, nenhuma reunião real.
    const ctx = getCommercialContext({ now: NOW });
    expect(ctx.activity.calls).toBe(0);
    expect(ctx.activity.connections).toBe(0);
    expect(ctx.activity.decisionMakers).toBe(0);
    expect(ctx.progress.meetings.done).toBe(0);
    expect(ctx.meetings.today).toEqual([]);
    // Pomodoro só aparece em productivity.
    expect(ctx.productivity.minutesToday).toBe(30);
    expect(ctx.productivity.sessionsToday).toBe(1);
  });
});
