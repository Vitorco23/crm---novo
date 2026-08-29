// ============================================================================
// COMMERCIAL CONTEXT — Sprint 2B: camada compartilhada de contexto factual.
//
// Monta um snapshot ÚNICO e somente-leitura da operação comercial, para uma
// futura camada de IA conversacional (Sprint 4) consultar. Não gera texto,
// não interpreta ("você está atrasado"), não chama IA, não executa ações.
//
// Mapa de fontes — nenhuma fonte paralela nova foi criada:
//   profile      → passado pelo chamador, mesmo formato de useAIUserContext()
//                  (este serviço não faz nenhuma chamada de rede para perfil)
//   goals        → dailyGoals.computeDailyGoals()                 [Sprint 2A]
//   activity     → commercialActivity.computeCommercialActivity() [Sprint 2A]
//   meetings     → store.getMeetings()
//   followUps    → agenda/reminders.getReminders()
//   tasks        → leads/leadTasks.getTasks()
//   pipeline     → store.getLeads() (+ mesma regra de valor aberto que
//                  coldCallMetrics.computeDailyTotals() já usa)
//   priorities   → priorityEngine.computePriorities() — somente leitura,
//                  pesos/tiers/ordenação intocados
//   productivity → store.getSessions() (Pomodoro) — nunca usado para
//                  calls/connections/decisionMakers/reuniões
//
// `dailyMetricsReport.ts` (fechamento manual) é uma fonte paralela e
// deliberadamente NÃO é usada aqui como fonte factual automática.
//
// Conflito documentado (não resolvido neste sprint — ver relato de entrega):
// o conjunto de estágios "fechados" já existe em 3 versões ligeiramente
// diferentes no código (priorityEngine, missionPlanner, coldCallMetrics).
// Este arquivo reaproveita o conjunto de `missionPlanner.ts` (o mais
// abrangente) só para o bloco de pipeline — não unifica os três.
// ============================================================================

import {
  getGoalsSettings,
  getLeads,
  getMeetings,
  getSessions,
  type Lead,
  type Meeting,
  type PomodoroSession,
} from "@/shared/services/store";
import { computeDailyGoals, type DailyGoals } from "@/shared/services/dailyGoals";
import { computeCommercialActivity, type CommercialActivityTotals } from "@/shared/services/commercialActivity";
import { getReminders, type Reminder } from "@/modules/agenda/services/reminders";
import { getTasks, type LeadTask } from "@/modules/leads/services/leadTasks";
import { displayTemperature } from "@/modules/intelligence/services/leadInsights";
import { computePriorities, type LeadPriority } from "@/modules/intelligence/services/priorityEngine";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CommercialContextProfile {
  name?: string;
  role?: string;
  company?: string;
}

export interface CommercialContextOptions {
  /** Instante a considerar "agora". Omitido usa o relógio do sistema —
   * testes sempre devem fixar este valor para resultado determinístico. */
  now?: Date;
  /** Identidade básica já resolvida pelo chamador (mesmo formato de
   * `useAIUserContext()`). Nunca telefone/foto/dados pessoais. */
  profile?: CommercialContextProfile;
}

export interface ProgressMetric {
  goal: number;
  done: number;
  remaining: number;
  progressPct: number;
}

export interface MeetingRef {
  id: string;
  leadId: string;
  company: string;
  date: string;
  time: string;
  atISO: string;
  channel: string;
}

export interface FollowUpRef {
  id: string;
  leadId: string;
  title: string;
  scheduledFor: string;
}

export interface TaskRef {
  id: string;
  leadId: string | null;
  title: string;
  dueAt: string;
  priority: LeadTask["priority"];
}

export interface CommercialContext {
  generatedAt: string;
  profile: CommercialContextProfile | null;
  period: {
    date: string;
    time: string;
    startOfDay: string;
    endOfDay: string;
    timezone: string;
  };
  goals: DailyGoals;
  activity: CommercialActivityTotals;
  progress: {
    calls: ProgressMetric;
    connections: ProgressMetric;
    decisionMakers: ProgressMetric;
    meetings: ProgressMetric;
  };
  meetings: {
    today: MeetingRef[];
    next: MeetingRef | null;
    minutesToNext: number | null;
    past: MeetingRef[];
    upcoming: MeetingRef[];
  };
  followUps: {
    overdueCount: number;
    todayCount: number;
    items: FollowUpRef[];
  };
  tasks: {
    overdueCount: number;
    todayCount: number;
    items: TaskRef[];
  };
  pipeline: {
    openTotal: number;
    byStage: Record<string, number>;
    hotCount: number;
    proposalCount: number;
    staleCount: number;
    openValue: number;
  };
  priorities: LeadPriority[];
  productivity: {
    minutesToday: number;
    sessionsToday: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers — mesmas regras já usadas em priorityEngine.ts/missionPlanner.ts,
// só parametrizadas por `nowMs` explícito para o snapshot ser determinístico
// em teste (os originais usam Date.now() direto). Nenhuma fórmula nova.
// ---------------------------------------------------------------------------

const CLOSED_STAGES = new Set(["Ganho", "Perdido", "Não Quer", "Sem contato"]);
/** Mesmo limiar de "silêncio" já usado em priorityEngine.ts (W.silenceBase). */
const STALE_DAYS_THRESHOLD = 4;
/** Payload de contexto tem tamanho prático — não é uma regra de negócio. */
const MAX_REFS = 10;
const MAX_PRIORITIES = 15;

function daysSince(iso: string | undefined, nowMs: number): number {
  if (!iso) return 999;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 999;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

function lastTouchISO(lead: Lead): string | undefined {
  const dates: string[] = [];
  for (const i of lead.interactions || []) dates.push(i.date || i.createdAt || "");
  for (const c of lead.callNotes || []) dates.push(c.createdAt);
  dates.sort();
  return dates.filter(Boolean).pop() || lead.stageChangedAt;
}

function meetingAtMs(m: Meeting): number {
  const t = new Date(`${m.date}T${m.time || "00:00"}:00`).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function toMeetingRef(m: Meeting): MeetingRef {
  return { id: m.id, leadId: m.leadId, company: m.company, date: m.date, time: m.time, atISO: new Date(meetingAtMs(m)).toISOString(), channel: m.channel };
}

function progressMetric(goal: number, done: number): ProgressMetric {
  const safeGoal = Number.isFinite(goal) && goal > 0 ? goal : 0;
  const safeDone = Number.isFinite(done) && done > 0 ? done : 0;
  const remaining = Math.max(0, safeGoal - safeDone);
  const progressPct = safeGoal > 0 ? Math.round((safeDone / safeGoal) * 100) : safeDone > 0 ? 100 : 0;
  return { goal: safeGoal, done: safeDone, remaining, progressPct };
}

function startOfDay(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

function endOfDay(d: Date): Date {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function getCommercialContext(options: CommercialContextOptions = {}): CommercialContext {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const from = startOfDay(now);
  const to = endOfDay(now);

  // ---- Metas do dia — Sprint 2A, fonte única ----
  const goals = computeDailyGoals(getGoalsSettings());

  // ---- Atividade comercial factual — Sprint 2A, fonte única ----
  const activity = computeCommercialActivity(from, to);

  const progress = {
    calls: progressMetric(goals.calls, activity.calls),
    connections: progressMetric(goals.connections, activity.connections),
    decisionMakers: progressMetric(goals.decisionMakers, activity.decisionMakers),
    meetings: progressMetric(goals.meetings, activity.meetingsScheduled),
  };

  // ---- Reuniões ----
  const allMeetings = getMeetings();
  const todayMeetings = allMeetings
    .filter((m) => m.date === toDateKey(now))
    .map(toMeetingRef)
    .sort((a, b) => new Date(a.atISO).getTime() - new Date(b.atISO).getTime());

  const past = todayMeetings.filter((m) => new Date(m.atISO).getTime() < nowMs);
  const upcoming = todayMeetings.filter((m) => new Date(m.atISO).getTime() >= nowMs);

  const futureMeetings = allMeetings
    .map(toMeetingRef)
    .filter((m) => new Date(m.atISO).getTime() >= nowMs)
    .sort((a, b) => new Date(a.atISO).getTime() - new Date(b.atISO).getTime());
  const next = futureMeetings[0] ?? null;
  const minutesToNext = next ? Math.round((new Date(next.atISO).getTime() - nowMs) / 60_000) : null;

  // ---- Follow-ups (lembretes) ----
  const reminders = getReminders().filter((r) => r.status === "pending");
  const overdueReminders = reminders.filter((r) => new Date(r.scheduledFor).getTime() < nowMs);
  const todayReminders = reminders.filter((r) => {
    const t = new Date(r.scheduledFor).getTime();
    return t >= from.getTime() && t <= to.getTime();
  });
  const followUps = {
    overdueCount: overdueReminders.length,
    todayCount: todayReminders.length,
    items: dedupeById([...overdueReminders, ...todayReminders])
      .slice(0, MAX_REFS)
      .map((r: Reminder): FollowUpRef => ({ id: r.id, leadId: r.leadId, title: r.title, scheduledFor: r.scheduledFor })),
  };

  // ---- Tarefas ----
  const pendingTasks = getTasks().filter((t) => t.status === "pendente");
  const overdueTasks = pendingTasks.filter((t) => new Date(t.dueAt).getTime() < nowMs);
  const todayTasks = pendingTasks.filter((t) => {
    const t2 = new Date(t.dueAt).getTime();
    return t2 >= from.getTime() && t2 <= to.getTime();
  });
  const tasks = {
    overdueCount: overdueTasks.length,
    todayCount: todayTasks.length,
    items: dedupeById([...overdueTasks, ...todayTasks])
      .slice(0, MAX_REFS)
      .map((t: LeadTask): TaskRef => ({ id: t.id, leadId: t.leadId, title: t.title, dueAt: t.dueAt, priority: t.priority })),
  };

  // ---- Pipeline ----
  const leads = getLeads();
  const openLeads = leads.filter((l) => !CLOSED_STAGES.has(l.stage));
  const byStage: Record<string, number> = {};
  for (const l of leads) byStage[l.stage] = (byStage[l.stage] || 0) + 1;
  const hotCount = openLeads.filter((l) => displayTemperature(l).key === "quente").length;
  const proposalCount = openLeads.filter((l) => /proposta/i.test(l.stage)).length;
  const staleCount = openLeads.filter((l) => daysSince(lastTouchISO(l), nowMs) >= STALE_DAYS_THRESHOLD).length;
  // Mesma regra de "valor de oportunidades abertas" já usada em
  // coldCallMetrics.computeDailyTotals() — reaproveitada, não recriada.
  const revenueClosedStages = new Set(["Ganho", "Perdido"]);
  const openValue = leads
    .filter((l) => !revenueClosedStages.has(l.stage) && l.contractValue)
    .reduce((s, l) => s + (l.contractValue || 0), 0);

  const pipeline = {
    openTotal: openLeads.length,
    byStage,
    hotCount,
    proposalCount,
    staleCount,
    openValue,
  };

  // ---- Prioridades — priorityEngine somente leitura, sem alterar nada ----
  const priorities = computePriorities().slice(0, MAX_PRIORITIES);

  // ---- Produtividade (Pomodoro) — nunca fonte de calls/connections/reuniões ----
  const sessions = getSessions().filter((s) => {
    const t = new Date(s.startTime).getTime();
    return Number.isFinite(t) && t >= from.getTime() && t <= to.getTime();
  });
  const minutesToday = sessions.reduce((s, session) => s + (session.durationMinutes || 0), 0);
  const productivity = { minutesToday, sessionsToday: sessions.length };

  return {
    generatedAt: now.toISOString(),
    profile: options.profile ?? null,
    period: {
      date: toDateKey(now),
      time: now.toTimeString().slice(0, 5),
      startOfDay: from.toISOString(),
      endOfDay: to.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
    },
    goals,
    activity,
    progress,
    meetings: { today: todayMeetings, next, minutesToNext, past, upcoming },
    followUps,
    tasks,
    pipeline,
    priorities,
    productivity,
  };
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
