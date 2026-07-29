// Aggregations for the Cold Call Operational Center.
// Pure functions — no state, no side effects. Called on-demand from the panel.

import {
  getSessions,
  getLeads,
  getMeetings,
  getMovementEvents,
  getGoalsSettings,
  getStagesForPipeline,
  type Lead,
  type PipelineStage,
} from "@/shared/services/store";

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isToday(iso: string): boolean {
  const t = new Date(iso).getTime();
  return t >= startOfToday();
}

export interface DailyGoals {
  calls: number;
  connections: number;
  decisionMakers: number;
  meetings: number;
}

export function computeDailyGoals(): DailyGoals {
  const g = getGoalsSettings();
  const r = (n: number) => Math.max(n, 0.0001) / 100;
  const closes = g.averageTicket > 0 ? g.monthlyRevenueGoal / g.averageTicket : 0;
  const meetingsHeld = closes / r(g.meetingHeldToClose);
  const meetingsScheduled = meetingsHeld / r(g.meetingScheduledToHeld);
  const decisionMakers = meetingsScheduled / r(g.decisionMakerToMeetingScheduled);
  const connections = decisionMakers / r(g.connectionToDecisionMaker);
  const calls = connections / r(g.callToConnection);
  const workingDaysPerMonth = g.workingDaysPerWeek * 4.33;
  const d = workingDaysPerMonth > 0 ? workingDaysPerMonth : 1;
  return {
    calls: Math.round(calls / d),
    connections: Math.round(connections / d),
    decisionMakers: Math.round(decisionMakers / d),
    meetings: Math.max(1, Math.round(meetingsScheduled / d)),
  };
}

export interface DailyTotals {
  calls: number;
  connections: number;
  decisionMakers: number;
  meetings: number;
  productiveMinutes: number;
  sessions: number;
  expectedRevenue: number;
}

export function computeDailyTotals(): DailyTotals {
  const sessions = getSessions().filter((s) => isToday(s.startTime));
  const totals = sessions.reduce(
    (acc, s) => {
      acc.calls += s.calls || 0;
      acc.connections += s.connections || 0;
      acc.decisionMakers += s.decisionMakers || 0;
      acc.meetings += s.meetings || 0;
      acc.productiveMinutes += s.durationMinutes || 0;
      return acc;
    },
    { calls: 0, connections: 0, decisionMakers: 0, meetings: 0, productiveMinutes: 0 }
  );

  // Fonte única da verdade: somente números registrados no Pomodoro.
  // Não somamos meetings da tabela de reuniões para evitar duplicação.

  // Expected revenue = sum of contractValue of open opportunities
  const oppStages = new Set(getStagesForPipeline("oportunidades"));
  const CLOSED = new Set(["Ganho", "Perdido"]);
  const expectedRevenue = getLeads()
    .filter((l) => oppStages.has(l.stage) && !CLOSED.has(l.stage))
    .reduce((s, l) => s + (l.contractValue || 0), 0);

  return { ...totals, sessions: sessions.length, expectedRevenue };
}

// ===== Campaign panel =====

export interface CampaignSummary {
  label: string;
  niche: string;
  city: string;
  totalLeads: number;
  worked: number;
  remaining: number;
  percentComplete: number;
  dailyGoal: number;
  currentPace: number; // avg calls/day past 7 days on this scope
  daysToFinish: number | null;
}

function daysAgo(days: number): number {
  return Date.now() - days * 86400000;
}

export function computeCampaignSummary(opts: {
  niches: string[];
  cities: string[];
  dailyGoal: number;
}): CampaignSummary | null {
  const { niches, cities, dailyGoal } = opts;
  if (niches.length === 0 && cities.length === 0) return null;

  const nicheSet = new Set(niches);
  const citySet = new Set(cities);
  const coldStages = new Set(getStagesForPipeline("cold_call"));

  const inScope = (l: Lead) =>
    (nicheSet.size === 0 || (l.niche && nicheSet.has(l.niche))) &&
    (citySet.size === 0 || (l.city && citySet.has(l.city)));

  const scopedLeads = getLeads().filter(inScope);
  const total = scopedLeads.length;
  if (total === 0) return null;

  // "Worked" = lead is out of cold_call OR moved beyond the FIRST cold stage.
  const firstColdStage: PipelineStage | undefined = getStagesForPipeline("cold_call")[0];
  const worked = scopedLeads.filter(
    (l) => !coldStages.has(l.stage) || l.stage !== firstColdStage
  ).length;
  const remaining = Math.max(0, total - worked);
  const pct = total > 0 ? Math.round((worked / total) * 100) : 0;

  // Current pace: distinct leads in scope with a movement event in the last 7 days
  const scopedIds = new Set(scopedLeads.map((l) => l.id));
  const cutoff = daysAgo(7);
  const recentMoves = getMovementEvents().filter(
    (e) => scopedIds.has(e.leadId) && new Date(e.timestamp).getTime() >= cutoff
  );
  const perDay = recentMoves.length / 7;

  const pace = Math.round(perDay);
  const daysToFinish = pace > 0 ? Math.ceil(remaining / pace) : null;

  const label =
    [niches.join(" · "), cities.join(" · ")].filter(Boolean).join(" — ").toUpperCase() ||
    "CAMPANHA ATIVA";

  return {
    label,
    niche: niches.join(", "),
    city: cities.join(", "),
    totalLeads: total,
    worked,
    remaining,
    percentComplete: pct,
    dailyGoal,
    currentPace: pace,
    daysToFinish,
  };
}

// ===== Per-card intelligence =====

export type LeadTemperature = "hot" | "warm" | "cold" | "new";

export function computeLeadTemperature(lead: Lead): LeadTemperature {
  const days = (Date.now() - new Date(lead.stageChangedAt).getTime()) / 86400000;
  const calls = lead.callNotes?.length ?? 0;
  const isFirstStage = /novo lead/i.test(lead.stage);
  if (isFirstStage && calls === 0 && days < 1) return "new";
  if (days >= 5) return "cold";
  if (days >= 2) return "warm";
  return "hot";
}

export function lastInteractionLabel(lead: Lead): { label: string; when: string } {
  const lastCall = lead.callNotes?.[lead.callNotes.length - 1];
  const lastCallAt = lastCall ? new Date(lastCall.createdAt).getTime() : 0;
  const stageAt = new Date(lead.stageChangedAt).getTime();

  let type = "Movimentação";
  let when = stageAt;

  if (lastCallAt >= stageAt) {
    type = "Ligação";
    when = lastCallAt;
  } else {
    const s = lead.stage.toLowerCase();
    if (/whatsapp|mensagem|wpp/.test(s)) type = "WhatsApp";
    else if (/tentativa|ligação|ligacao/.test(s)) type = "Ligação";
    else if (/reunião|reuniao/.test(s)) type = "Reunião";
    else if (/proposta/.test(s)) type = "Proposta";
    else if (/instagram/.test(s)) type = "Instagram";
  }

  const days = Math.floor((Date.now() - when) / 86400000);
  const label = days === 0 ? "hoje" : days === 1 ? "ontem" : `${days} dias`;
  return { label: type, when: label };
}

export function nextActionLabel(lead: Lead): string {
  const s = lead.stage.toLowerCase();
  if (/novo lead/.test(s)) return "Ligar";
  if (/whatsapp|mensagem/.test(s)) return "Enviar WhatsApp";
  if (/tentativa/.test(s)) return "Ligar novamente";
  if (/reunião marcada|reuniao marcada/.test(s)) return "Confirmar reunião";
  if (/no show/.test(s)) return "Reagendar";
  if (/reunião realizada|reuniao realizada/.test(s)) return "Enviar diagnóstico";
  if (/documento|diagnóstico|diagnostico/.test(s)) return "Finalizar documento";
  if (/proposta/.test(s)) return "Follow-up proposta";
  return "Realizar Follow-up";
}
