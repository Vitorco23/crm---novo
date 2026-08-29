// ============================================================================
// DAILY GOALS — fonte única do cálculo de metas diárias operacionais.
//
// Antes do Sprint 2A existiam duas implementações da mesma fórmula de funil
// (missionPlanner.getDailyGoals / coldCallMetrics.computeDailyGoals), com
// arredondamento diferente (Math.round vs Math.ceil) e piso mínimo de
// reuniões divergente. Isso podia fazer a Missão do Dia trabalhar com uma
// meta e o painel de Progresso do Dia mostrar outra.
//
// Esta função é a única com a fórmula do funil. Não recalcule metas diárias
// em nenhum outro lugar — importe daqui.
// ============================================================================

import type { GoalsSettings } from "@/shared/services/store";

export interface DailyGoals {
  calls: number;
  connections: number;
  decisionMakers: number;
  meetings: number;
}

/**
 * Metas operacionais nunca devem subestimar o necessário para bater a meta
 * mensal — por isso o funil inteiro arredonda para cima (Math.ceil). Reuniões
 * mantêm piso mínimo de 1/dia: uma meta mensal sempre implica alguma reunião
 * necessária, mesmo quando o funil fracionário arredondaria para 0.
 */
export function computeDailyGoals(g: GoalsSettings): DailyGoals {
  const r = (n: number) => Math.max(n, 0.0001) / 100;
  const closes = g.averageTicket > 0 ? g.monthlyRevenueGoal / g.averageTicket : 0;
  const meetingsHeld = closes / r(g.meetingHeldToClose);
  const meetingsScheduled = meetingsHeld / r(g.meetingScheduledToHeld);
  const decisionMakers = meetingsScheduled / r(g.decisionMakerToMeetingScheduled);
  const connections = decisionMakers / r(g.connectionToDecisionMaker);
  const calls = connections / r(g.callToConnection);

  const workingDaysPerMonth = (g.workingDaysPerWeek || 5) * 4.33;
  const perDay = (n: number) => (workingDaysPerMonth > 0 ? Math.ceil(n / workingDaysPerMonth) : 0);

  return {
    calls: perDay(calls),
    connections: perDay(connections),
    decisionMakers: perDay(decisionMakers),
    meetings: Math.max(1, perDay(meetingsScheduled)),
  };
}
