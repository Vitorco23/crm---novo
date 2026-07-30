// Real conversion rates engine.
// Pure functions — computes the ACTUAL funnel conversion rates from
// Pomodoro sessions (volume of calls/connections/decision makers) and
// pipeline movement events (meetings scheduled/held and closed deals).

import { getSessions, getMovementEvents } from "@/shared/services/store";

export type RealPeriod = 7 | 30 | 90 | 0; // 0 = todo o histórico

export interface RealFunnelVolumes {
  calls: number;
  connections: number;
  decisionMakers: number;
  meetingsScheduled: number;
  meetingsHeld: number;
  closes: number;
}

export interface RealRate {
  key:
    | "callToConnection"
    | "connectionToDecisionMaker"
    | "decisionMakerToMeetingScheduled"
    | "meetingScheduledToHeld"
    | "meetingHeldToClose";
  label: string;
  numerator: number;
  denominator: number;
  /** null quando não há base suficiente para calcular */
  rate: number | null;
}

export interface RealConversionReport {
  period: RealPeriod;
  volumes: RealFunnelVolumes;
  rates: RealRate[];
  hasData: boolean;
}

function cutoffFor(period: RealPeriod): number {
  if (!period) return 0;
  return Date.now() - period * 86400000;
}

function inPeriod(iso: string, cutoff: number): boolean {
  if (!cutoff) return true;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= cutoff;
}

function normalizeStage(stage: string): string {
  return stage
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function computeRealVolumes(period: RealPeriod = 30): RealFunnelVolumes {
  const cutoff = cutoffFor(period);

  const sessions = getSessions().filter((s) => inPeriod(s.startTime, cutoff));
  const calls = sessions.reduce((a, s) => a + (s.calls || 0), 0);
  const connections = sessions.reduce((a, s) => a + (s.connections || 0), 0);
  const decisionMakers = sessions.reduce((a, s) => a + (s.decisionMakers || 0), 0);
  const sessionMeetings = sessions.reduce((a, s) => a + (s.meetings || 0), 0);

  // Reuniões e fechamentos vêm da movimentação real do pipeline.
  const events = getMovementEvents().filter((e) => inPeriod(e.timestamp, cutoff));
  let movedScheduled = 0;
  let meetingsHeld = 0;
  let closes = 0;
  for (const e of events) {
    const s = normalizeStage(String(e.toStage));
    if (s.includes("reuniao marcada")) movedScheduled++;
    else if (s.includes("reuniao realizada")) meetingsHeld++;
    else if (s === "ganho") closes++;
  }

  // Fonte única: preferimos a movimentação do pipeline; se não houver
  // nenhuma, usamos o que foi registrado no Pomodoro.
  const meetingsScheduled = movedScheduled > 0 ? movedScheduled : sessionMeetings;

  return { calls, connections, decisionMakers, meetingsScheduled, meetingsHeld, closes };
}

function rate(
  key: RealRate["key"],
  label: string,
  numerator: number,
  denominator: number
): RealRate {
  return {
    key,
    label,
    numerator,
    denominator,
    rate: denominator > 0 ? (numerator / denominator) * 100 : null,
  };
}

export function computeRealConversion(period: RealPeriod = 30): RealConversionReport {
  const v = computeRealVolumes(period);
  const rates: RealRate[] = [
    rate("callToConnection", "Ligação → Conexão", v.connections, v.calls),
    rate("connectionToDecisionMaker", "Conexão → Decisor", v.decisionMakers, v.connections),
    rate(
      "decisionMakerToMeetingScheduled",
      "Decisor → Reunião Marcada",
      v.meetingsScheduled,
      v.decisionMakers
    ),
    rate("meetingScheduledToHeld", "Marcada → Realizada", v.meetingsHeld, v.meetingsScheduled),
    rate("meetingHeldToClose", "Realizada → Fechamento", v.closes, v.meetingsHeld),
  ];

  const hasData =
    v.calls + v.connections + v.decisionMakers + v.meetingsScheduled + v.meetingsHeld + v.closes >
    0;

  return { period, volumes: v, rates, hasData };
}
