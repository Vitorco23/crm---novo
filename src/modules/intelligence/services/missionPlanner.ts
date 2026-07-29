// ============================================================================
// MISSION PLANNER — transforma as prioridades do Priority Engine em EXECUÇÃO.
//
// Não cria telas, não chama IA, não altera regras comerciais e não duplica o
// módulo de tarefas: apenas orquestra o que já existe.
//
//   • Metas (aba Metas)          → quantidade de ligações/reuniões do dia
//   • Priority Engine            → urgência, motivo e ação única por lead
//   • Cadência do pipeline       → continuidade dos follow-ups
//   • Central de Tarefas         → execução real (origin = mission_center)
// ============================================================================

import {
  getLeads,
  getMeetings,
  getGoalsSettings,
  getMovementEvents,
  type Lead,
} from "@/shared/services/store";
import { getReminders } from "@/modules/agenda/services/reminders";
import {
  getTasks,
  addTask,
  type LeadTask,
  type TaskPriority,
} from "@/modules/leads/services/leadTasks";
import { displayTemperature } from "@/modules/intelligence/services/leadInsights";
import { getCache as getPriorityLeadsCache } from "@/modules/intelligence/services/priorityLeads";
import { computePriorities, type LeadPriority } from "@/modules/intelligence/services/priorityEngine";

// ---------------------------------------------------------------------------
// Constantes operacionais (nenhum número comercial fixo — apenas parâmetros)
// ---------------------------------------------------------------------------

/** Meta diária de follow-ups do Sistema Operacional Comercial. */
export const DAILY_FOLLOWUP_TARGET = 20;
/** Intervalo natural antes de recomendar novamente o mesmo lead. */
export const FOLLOWUP_COOLDOWN_DAYS = 3;

const CLOSED = new Set(["Ganho", "Perdido", "Não Quer", "Sem contato"]);

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type MissionItemKind =
  | "calls"
  | "followups"
  | "meetings"
  | "prospect"
  | "script"
  | "lead";

export interface MissionItem {
  /** chave estável do dia — usada como `originRef` da tarefa. */
  id: string;
  kind: MissionItemKind;
  title: string;
  /** contexto de execução construído dinamicamente (nicho, cidade, horário…) */
  bullets: string[];
  reason: string;
  priority: TaskPriority;
  estimatedMinutes: number;
  leadId?: string;
}

export type FollowupBucket = "urgente" | "quente" | "cadencia";

export interface FollowupPick {
  leadId: string;
  company: string;
  stage: string;
  bucket: FollowupBucket;
  motivo: string;
  action: string;
  temperature: ReturnType<typeof displayTemperature>;
  priority: LeadPriority | null;
}

export interface ProspectFocus {
  niche?: string;
  city?: string;
  bestHour?: string;
  script?: string;
  reason: string;
}

export interface MissionPlan {
  generatedAt: string;
  callsGoal: number;
  meetingsGoal: number;
  callsDone: number;
  followups: FollowupPick[];
  followupsDone: number;
  focus: ProspectFocus;
  items: MissionItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const todayStr = () => new Date().toISOString().slice(0, 10);

function daysSince(iso?: string): number {
  if (!iso) return 999;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 999;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function lastTouchISO(lead: Lead): string | undefined {
  const dates: string[] = [];
  for (const i of lead.interactions || []) dates.push(i.date || i.createdAt || "");
  for (const c of lead.callNotes || []) dates.push(c.createdAt);
  dates.sort();
  return dates.filter(Boolean).pop();
}

/** Etapas de cadência ativa (posteriores a "Novo Lead" no Cold Call). */
function cadenceAttempt(stage: string): number {
  const m = /tentativa\s*(\d+)/i.exec(stage || "");
  return m ? Number(m[1]) : 0;
}

// ---------------------------------------------------------------------------
// Metas — SEMPRE derivadas da aba Metas, nunca de números fixos
// ---------------------------------------------------------------------------

export interface DailyGoals {
  calls: number;
  meetings: number;
  decisionMakers: number;
}

export function getDailyGoals(): DailyGoals {
  const g = getGoalsSettings();
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
    meetings: perDay(meetingsScheduled),
    decisionMakers: perDay(decisionMakers),
  };
}

// ---------------------------------------------------------------------------
// Execução já realizada hoje (a Missão nunca repete o que já foi feito)
// ---------------------------------------------------------------------------

function callsDoneToday(leads: Lead[]): number {
  const d = todayStr();
  let n = 0;
  for (const l of leads) {
    for (const c of l.callNotes || []) if ((c.createdAt || "").slice(0, 10) === d) n++;
    for (const i of l.interactions || []) {
      if (i.type === "Ligação" && (i.date || i.createdAt || "").slice(0, 10) === d) n++;
    }
  }
  return n;
}

/** Leads já trabalhados hoje — nunca voltam para a fila do mesmo dia. */
function workedTodaySet(leads: Lead[]): Set<string> {
  const d = todayStr();
  const set = new Set<string>();
  for (const l of leads) {
    const touched =
      (l.callNotes || []).some((c) => (c.createdAt || "").slice(0, 10) === d) ||
      (l.interactions || []).some((i) => (i.date || i.createdAt || "").slice(0, 10) === d);
    if (touched) set.add(l.id);
  }
  return set;
}

// ---------------------------------------------------------------------------
// Follow-ups Inteligentes
// ---------------------------------------------------------------------------

interface UrgencyCtx {
  overdueOrTodayReminder: Set<string>;
  meetingToday: Set<string>;
  taskDueToday: Set<string>;
  iaCritical: Set<string>;
}

function buildUrgencyCtx(): UrgencyCtx {
  const now = Date.now();
  const d = todayStr();
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);

  const overdueOrTodayReminder = new Set<string>();
  for (const r of getReminders()) {
    if (r.status !== "pending") continue;
    const at = new Date(r.scheduledFor).getTime();
    if (at <= endOfDay.getTime()) overdueOrTodayReminder.add(r.leadId);
  }

  const meetingToday = new Set<string>();
  for (const m of getMeetings()) {
    const id = (m as unknown as { leadId?: string }).leadId;
    if (!id) continue;
    if (m.date === d) meetingToday.add(id);
  }

  const taskDueToday = new Set<string>();
  for (const t of getTasks() as LeadTask[]) {
    if (t.status !== "pendente" || !t.leadId) continue;
    if (new Date(t.dueAt).getTime() <= endOfDay.getTime() || new Date(t.dueAt).getTime() < now) {
      taskDueToday.add(t.leadId);
    }
  }

  const iaCritical = new Set<string>();
  for (const p of getPriorityLeadsCache()?.leads || []) {
    if (p.impacto === "critico" || p.impacto === "alto") iaCritical.add(p.leadId);
  }

  return { overdueOrTodayReminder, meetingToday, taskDueToday, iaCritical };
}

/** Exceções que ignoram o intervalo natural de cadência. */
function isException(lead: Lead, ctx: UrgencyCtx, prio: LeadPriority | null): boolean {
  if (ctx.overdueOrTodayReminder.has(lead.id)) return true;
  if (ctx.meetingToday.has(lead.id)) return true;
  if (ctx.taskDueToday.has(lead.id)) return true;
  if (ctx.iaCritical.has(lead.id)) return true;
  if (/proposta/i.test(lead.stage)) return true;
  if (prio?.tier === "critica") return true;
  return false;
}

/** Lista diária de follow-ups prioritários (urgência → potencial → cadência). */
export function buildSmartFollowups(
  target = DAILY_FOLLOWUP_TARGET,
  priorities?: LeadPriority[],
): FollowupPick[] {
  const leads = getLeads().filter((l) => !CLOSED.has(l.stage));
  const prios = priorities ?? computePriorities();
  const prioById = new Map(prios.map((p) => [p.leadId, p]));
  const ctx = buildUrgencyCtx();
  const workedToday = workedTodaySet(leads);

  const picked = new Set<string>();
  const out: FollowupPick[] = [];

  const push = (lead: Lead, bucket: FollowupBucket, motivo: string) => {
    if (picked.has(lead.id) || out.length >= target) return;
    picked.add(lead.id);
    const p = prioById.get(lead.id) || null;
    out.push({
      leadId: lead.id,
      company: lead.company,
      stage: lead.stage,
      bucket,
      motivo,
      action: p?.actionLabel || "Fazer follow-up",
      temperature: displayTemperature(lead),
      priority: p,
    });
  };

  // 1) Prioridade máxima — urgências reais (ignoram cooldown, mas não o "já feito hoje")
  const urgent = leads
    .filter((l) => !workedToday.has(l.id) && isException(l, ctx, prioById.get(l.id) || null))
    .sort((a, b) => (prioById.get(b.id)?.score || 0) - (prioById.get(a.id)?.score || 0));
  for (const l of urgent) {
    const p = prioById.get(l.id);
    let motivo = p?.reasons[0]?.label || "Compromisso assumido para hoje";
    if (ctx.meetingToday.has(l.id)) motivo = "Reunião agendada para hoje";
    else if (/proposta/i.test(l.stage)) motivo = "Proposta aguardando resposta";
    else if (ctx.overdueOrTodayReminder.has(l.id)) motivo = "Retorno combinado para hoje";
    else if (ctx.iaCritical.has(l.id)) motivo = "Alerta do Diretor Comercial";
    push(l, "urgente", motivo);
  }

  // 2) Leads quentes — temperatura elevada / diagnóstico favorável
  const hot = leads
    .filter((l) => !picked.has(l.id) && !workedToday.has(l.id))
    .filter((l) => {
      if (daysSince(lastTouchISO(l)) < FOLLOWUP_COOLDOWN_DAYS) return false;
      const t = displayTemperature(l).key;
      const prob = l.autoDiagnosis?.probability ?? 0;
      const p = prob > 1 ? prob / 100 : prob;
      return t === "quente" || p >= 0.5;
    })
    .sort((a, b) => (prioById.get(b.id)?.score || 0) - (prioById.get(a.id)?.score || 0));
  for (const l of hot) {
    const prob = l.autoDiagnosis?.probability ?? 0;
    const p = prob > 1 ? prob / 100 : prob;
    push(l, "quente", p >= 0.5 ? `Probabilidade de avanço ${Math.round(p * 100)}%` : "Lead quente sem retorno recente");
  }

  // 3) Continuidade da cadência — Tentativa 2 em diante
  const cadence = leads
    .filter((l) => !picked.has(l.id) && !workedToday.has(l.id))
    .filter((l) => cadenceAttempt(l.stage) >= 2)
    .filter((l) => daysSince(lastTouchISO(l)) >= FOLLOWUP_COOLDOWN_DAYS)
    .sort((a, b) => {
      const da = daysSince(lastTouchISO(a));
      const db = daysSince(lastTouchISO(b));
      if (db !== da) return db - da;
      return cadenceAttempt(b.stage) - cadenceAttempt(a.stage);
    });
  for (const l of cadence) {
    push(l, "cadencia", `Cadência ativa — ${l.stage} há ${daysSince(lastTouchISO(l))} dia(s) sem contato`);
  }

  return out.slice(0, target);
}

// ---------------------------------------------------------------------------
// Foco de prospecção — nicho, cidade, melhor horário e script (dados reais)
// ---------------------------------------------------------------------------

function topKey(counts: Map<string, { hits: number; total: number }>, minTotal = 3): { key: string; rate: number } | null {
  let best: { key: string; rate: number } | null = null;
  for (const [key, v] of counts) {
    if (!key || v.total < minTotal) continue;
    const rate = v.hits / v.total;
    if (!best || rate > best.rate) best = { key, rate };
  }
  return best;
}

export function buildProspectFocus(): ProspectFocus {
  const leads = getLeads();
  const byId = new Map(leads.map((l) => [l.id, l]));
  const meetingEvents = getMovementEvents().filter((e) => /reuni(ã|a)o marcada/i.test(e.toStage));
  const converted = new Set(meetingEvents.map((e) => e.leadId));

  const niches = new Map<string, { hits: number; total: number }>();
  const cities = new Map<string, { hits: number; total: number }>();
  const scripts = new Map<string, { hits: number; total: number }>();

  for (const l of leads) {
    const won = converted.has(l.id) || /reuni(ã|a)o|proposta|ganho/i.test(l.stage);
    const bump = (m: Map<string, { hits: number; total: number }>, k?: string) => {
      if (!k) return;
      const cur = m.get(k) || { hits: 0, total: 0 };
      cur.total++;
      if (won) cur.hits++;
      m.set(k, cur);
    };
    bump(niches, l.niche);
    bump(cities, l.city);
    for (const s of new Set((l.callNotes || []).map((c) => c.scriptUsed).filter(Boolean) as string[])) {
      bump(scripts, s);
    }
  }

  // Melhor horário: hora do dia com maior taxa de conversão em reunião marcada.
  const hourStats = new Map<number, { hits: number; total: number }>();
  for (const l of leads) {
    for (const c of l.callNotes || []) {
      const h = new Date(c.createdAt).getHours();
      if (Number.isNaN(h)) continue;
      const cur = hourStats.get(h) || { hits: 0, total: 0 };
      cur.total++;
      if (converted.has(l.id)) cur.hits++;
      hourStats.set(h, cur);
    }
  }
  let bestHour: string | undefined;
  let bestHourRate = -1;
  for (const [h, v] of hourStats) {
    if (v.total < 3) continue;
    const rate = v.hits / v.total;
    if (rate > bestHourRate) { bestHourRate = rate; bestHour = `${String(h).padStart(2, "0")}:00`; }
  }

  const niche = topKey(niches);
  const city = topKey(cities);
  const script = topKey(scripts, 2);

  const parts: string[] = [];
  if (niche) parts.push(`${niche.key} converte ${Math.round(niche.rate * 100)}% em reunião`);
  if (city) parts.push(`${city.key} é a praça com melhor retorno recente`);
  if (bestHour && bestHourRate > 0) parts.push(`${bestHour} concentra a maior taxa de reuniões`);

  void byId;
  return {
    niche: niche?.key,
    city: city?.key,
    bestHour,
    script: script?.key,
    reason: parts.length ? parts.join(" · ") : "Dados históricos ainda insuficientes para recomendar um foco.",
  };
}

// ---------------------------------------------------------------------------
// Plano da Missão do Dia
// ---------------------------------------------------------------------------

export function buildMissionPlan(priorities?: LeadPriority[]): MissionPlan {
  const leads = getLeads();
  const prios = priorities ?? computePriorities();
  const goals = getDailyGoals();
  const followups = buildSmartFollowups(DAILY_FOLLOWUP_TARGET, prios);
  const focus = buildProspectFocus();
  const done = callsDoneToday(leads);
  const d = todayStr();

  const items: MissionItem[] = [];

  if (goals.calls > 0) {
    const bullets: string[] = [];
    if (focus.niche) bullets.push(focus.niche);
    if (focus.city) bullets.push(focus.city);
    if (focus.bestHour) bullets.push(`Melhor horário: ${focus.bestHour}`);
    items.push({
      id: `${d}:calls`,
      kind: "calls",
      title: `Fazer ${goals.calls} ligações hoje`,
      bullets,
      reason: focus.reason,
      priority: "alta",
      estimatedMinutes: Math.max(30, goals.calls * (getGoalsSettings().minutesPerCall || 4)),
    });
  }

  if (followups.length > 0) {
    const urgentes = followups.filter((f) => f.bucket === "urgente").length;
    const quentes = followups.filter((f) => f.bucket === "quente").length;
    const cadencia = followups.filter((f) => f.bucket === "cadencia").length;
    items.push({
      id: `${d}:followups`,
      kind: "followups",
      title: `Resolver ${followups.length} follow-ups`,
      bullets: [
        urgentes ? `${urgentes} urgente(s)` : "",
        quentes ? `${quentes} lead(s) quente(s)` : "",
        cadencia ? `${cadencia} em cadência ativa` : "",
      ].filter(Boolean),
      reason: "Seleção diária por urgência, potencial e continuidade de cadência.",
      priority: urgentes > 0 ? "urgente" : "alta",
      estimatedMinutes: followups.length * 8,
    });
  }

  if (goals.meetings > 0) {
    items.push({
      id: `${d}:meetings`,
      kind: "meetings",
      title: `Marcar ${goals.meetings} reunião(ões)`,
      bullets: [`Meta derivada da aba Metas`],
      reason: "Volume necessário para sustentar a meta financeira do mês.",
      priority: "alta",
      estimatedMinutes: goals.meetings * 8,
    });
  }

  if (focus.niche || focus.city) {
    items.push({
      id: `${d}:prospect`,
      kind: "prospect",
      title: `Prospectar ${focus.niche || focus.city}`,
      bullets: [focus.city ? focus.city : "", focus.bestHour ? `Melhor horário: ${focus.bestHour}` : ""].filter(Boolean),
      reason: focus.reason,
      priority: "media",
      estimatedMinutes: 60,
    });
  }

  if (focus.script) {
    items.push({
      id: `${d}:script`,
      kind: "script",
      title: `Utilizar ${focus.script}`,
      bullets: [],
      reason: "Script com maior taxa recente de reuniões marcadas.",
      priority: "media",
      estimatedMinutes: 10,
    });
  }

  // Prioridades estratégicas por lead (críticas/altas) — execução individual.
  for (const p of prios.filter((x) => x.tier === "critica").slice(0, 3)) {
    items.push({
      id: `${d}:lead:${p.leadId}`,
      kind: "lead",
      title: `${p.actionLabel} — ${p.company}`,
      bullets: p.reasons.slice(0, 2).map((r) => r.label),
      reason: p.actionReason,
      priority: "urgente",
      estimatedMinutes: p.estimatedMinutes,
      leadId: p.leadId,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    callsGoal: goals.calls,
    meetingsGoal: goals.meetings,
    callsDone: done,
    followups,
    followupsDone: workedTodaySet(leads).size,
    focus,
    items,
  };
}

// ---------------------------------------------------------------------------
// Integração com a Central de Tarefas (módulo atual, sem duplicação)
// ---------------------------------------------------------------------------

/** Tarefas da Missão criadas hoje, indexadas pelo `originRef`. */
export function getMissionTasksToday(): Map<string, LeadTask> {
  const d = todayStr();
  const map = new Map<string, LeadTask>();
  for (const t of getTasks()) {
    if (t.origin !== "mission_center" || !t.originRef) continue;
    if ((t.createdAt || "").slice(0, 10) !== d) continue;
    map.set(t.originRef, t);
  }
  return map;
}

/** Cria a tarefa da prioridade usando exatamente o módulo atual de tarefas. */
export function addMissionTask(item: MissionItem): LeadTask {
  const existing = getMissionTasksToday().get(item.id);
  if (existing) return existing;

  const due = new Date();
  due.setHours(18, 0, 0, 0);
  if (due.getTime() < Date.now()) due.setTime(Date.now() + 60 * 60 * 1000);

  const description = [item.bullets.length ? `Priorizar: ${item.bullets.join(" · ")}` : "", item.reason ? `Motivo: ${item.reason}` : ""]
    .filter(Boolean)
    .join("\n");

  return addTask({
    leadId: item.leadId ?? null,
    title: item.title,
    description,
    dueAt: due.toISOString(),
    durationMin: Math.min(240, Math.max(15, item.estimatedMinutes)),
    priority: item.priority,
    origin: "mission_center",
    originRef: item.id,
  });
}

/** Cria a tarefa de um follow-up individual da Missão. */
export function addFollowupTask(f: FollowupPick): LeadTask {
  return addMissionTask({
    id: `${todayStr()}:followup:${f.leadId}`,
    kind: "lead",
    title: `${f.action} — ${f.company}`,
    bullets: [f.stage],
    reason: f.motivo,
    priority: f.bucket === "urgente" ? "urgente" : f.bucket === "quente" ? "alta" : "media",
    estimatedMinutes: f.priority?.estimatedMinutes ?? 8,
    leadId: f.leadId,
  });
}
