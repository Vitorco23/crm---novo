// ============================================================================
// PRIORITY ENGINE — mecanismo ÚNICO de priorização operacional da Plataforma P21.
//
// Princípio: o vendedor nunca deve decidir por onde começar. O sistema já
// priorizou antes dele abrir o primeiro lead.
//
// Este serviço NÃO cria arquitetura nova, NÃO chama IA e NÃO altera regras
// comerciais. Ele apenas ORQUESTRA dados que já existem:
//   • pipeline (etapa, tempo na etapa)      • temperatura consolidada
//   • diagnóstico automático (autoDiagnosis) • interações e ligações
//   • lembretes / follow-ups                 • tarefas do lead
//   • agenda (reuniões)                      • valor de contrato
//   • Next Best Action e picks do Diretor Comercial IA (cache local)
//
// Todos os pesos ficam AQUI. Nenhum outro módulo deve recalcular prioridade.
// ============================================================================

import {
  getLeads,
  getMeetings,
  type Lead,
  type Meeting,
} from "@/shared/services/store";
import { getReminders } from "@/modules/agenda/services/reminders";
import { getTasks, type LeadTask } from "@/modules/leads/services/leadTasks";
import { displayTemperature } from "@/modules/intelligence/services/leadInsights";
import {
  getCache as getPriorityLeadsCache,
  type PriorityLeadPick,
} from "@/modules/intelligence/services/priorityLeads";
import type {
  NBAActionKind,
  NBAUrgency,
  NextBestAction,
} from "@/modules/intelligence/services/nextBestAction";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type PriorityTier = "critica" | "alta" | "media" | "baixa";

export interface PriorityReason {
  /** chave estável para agregação (mission buckets) */
  key: string;
  /** texto curto exibido ao usuário */
  label: string;
  weight: number;
}

export interface LeadPriority {
  leadId: string;
  company: string;
  stage: string;
  score: number;
  tier: PriorityTier;
  reasons: PriorityReason[];
  /** ação ÚNICA recomendada */
  action: NBAActionKind;
  actionLabel: string;
  actionReason: string;
  urgency: NBAUrgency;
  /** minutos estimados para resolver a prioridade */
  estimatedMinutes: number;
  temperature: ReturnType<typeof displayTemperature>;
  contractValue?: number;
  daysSinceInteraction: number;
  daysInStage: number;
  /** origem da recomendação — usada para a "IA invisível" */
  source: "ia" | "diagnostico" | "regras";
}

export interface MissionBucket {
  key: string;
  label: string;
  count: number;
  tone: "critical" | "warn" | "info" | "good";
}

export interface DailyMission {
  generatedAt: string;
  buckets: MissionBucket[];
  top: LeadPriority | null;
  queue: LeadPriority[];
  totalLeadsWithPriority: number;
  estimatedMinutes: number;
  /** sugestão proativa e discreta do Diretor Comercial (pode ser null) */
  nudge: DirectorSuggestion | null;
}

export interface DirectorSuggestion {
  key: string;
  message: string;
  cta?: { label: string; leadId?: string; href?: string };
  tone: "critical" | "warn" | "info";
}

// ---------------------------------------------------------------------------
// Pesos centralizados (única fonte de verdade)
// ---------------------------------------------------------------------------

const W = {
  followupOverdue: 34,
  followupOverduePer: 8,
  taskOverdue: 22,
  taskOverduePer: 5,
  taskToday: 12,
  meetingSoon: 60,
  meetingToday: 30,
  hotLead: 18,
  warmLead: 6,
  coldDrop: 16,
  diagProbability: 26, // × probabilidade (0..1)
  diagAttention: 10,
  proposalAging: 6, // por dia
  proposalBase: 18,
  postMeetingSilence: 16,
  silenceBase: 10,
  silencePerDay: 1.2,
  stageDiagnostic: 14,
  contractValue: 14, // × log10 normalizado
  iaCritical: 45,
  iaHigh: 30,
  iaMedium: 18,
} as const;

const MINUTES_BY_ACTION: Record<NBAActionKind, number> = {
  call: 12,
  whatsapp: 5,
  schedule_meeting: 8,
  send_proposal: 20,
  follow_up: 8,
  wait_reply: 2,
  request_docs: 6,
  register_loss: 4,
  close_deal: 15,
  run_full_diagnosis: 6,
};

const ACTION_LABEL: Record<NBAActionKind, string> = {
  call: "Ligar agora",
  whatsapp: "Responder no WhatsApp",
  schedule_meeting: "Agendar reunião",
  send_proposal: "Enviar proposta",
  follow_up: "Fazer follow-up",
  wait_reply: "Aguardar retorno",
  request_docs: "Solicitar documentos",
  register_loss: "Registrar perda",
  close_deal: "Iniciar onboarding",
  run_full_diagnosis: "Rodar diagnóstico",
};

const CLOSED = new Set(["Ganho", "Perdido", "Não Quer"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  return dates.filter(Boolean).pop() || lead.stageChangedAt;
}

function meetingAt(m: Meeting): number {
  return new Date(`${m.date}T${m.time || "00:00"}:00`).getTime();
}

function tierFor(score: number): PriorityTier {
  if (score >= 85) return "critica";
  if (score >= 55) return "alta";
  if (score >= 30) return "media";
  return "baixa";
}

function urgencyFor(tier: PriorityTier): NBAUrgency {
  if (tier === "critica") return "now";
  if (tier === "alta") return "today";
  if (tier === "media") return "this_week";
  return "when_possible";
}

// ---------------------------------------------------------------------------
// Núcleo: prioridade de um lead
// ---------------------------------------------------------------------------

interface EngineIndex {
  overdueReminders: Map<string, number>;
  pendingReminders: Map<string, number>;
  overdueTasks: Map<string, number>;
  todayTasks: Map<string, number>;
  meetingsSoon: Map<string, Meeting>;
  meetingsToday: Map<string, Meeting>;
  iaPicks: Map<string, PriorityLeadPick>;
}

function buildIndex(): EngineIndex {
  const now = Date.now();
  const todayStr = new Date().toISOString().slice(0, 10);

  const overdueReminders = new Map<string, number>();
  const pendingReminders = new Map<string, number>();
  for (const r of getReminders()) {
    if (r.status !== "pending") continue;
    const at = new Date(r.scheduledFor).getTime();
    const target = at < now ? overdueReminders : pendingReminders;
    target.set(r.leadId, (target.get(r.leadId) || 0) + 1);
  }

  const overdueTasks = new Map<string, number>();
  const todayTasks = new Map<string, number>();
  for (const t of getTasks() as LeadTask[]) {
    if (t.status !== "pendente" || !t.leadId) continue;
    const due = new Date(t.dueAt).getTime();
    if (due < now) overdueTasks.set(t.leadId, (overdueTasks.get(t.leadId) || 0) + 1);
    else if (t.dueAt.slice(0, 10) === todayStr) todayTasks.set(t.leadId, (todayTasks.get(t.leadId) || 0) + 1);
  }

  const meetingsSoon = new Map<string, Meeting>();
  const meetingsToday = new Map<string, Meeting>();
  for (const m of getMeetings()) {
    const at = meetingAt(m);
    const diff = at - now;
    const id = (m as unknown as { leadId?: string }).leadId;
    if (!id) continue;
    if (diff >= 0 && diff <= 45 * 60_000) meetingsSoon.set(id, m);
    else if (m.date === todayStr && diff >= 0) meetingsToday.set(id, m);
  }

  const iaPicks = new Map<string, PriorityLeadPick>();
  for (const p of getPriorityLeadsCache()?.leads || []) iaPicks.set(p.leadId, p);

  return { overdueReminders, pendingReminders, overdueTasks, todayTasks, meetingsSoon, meetingsToday, iaPicks };
}

/** Ação única derivada de sinais determinísticos (fallback sem IA). */
function deriveAction(
  lead: Lead,
  ctx: { overdueFollowups: number; meetingSoon: boolean; meetingToday: boolean; daysSinceInteraction: number },
): { action: NBAActionKind; reason: string } {
  const stage = lead.stage;
  const diagAction = (lead.autoDiagnosis?.next_action || "").toLowerCase();

  if (ctx.meetingSoon) return { action: "schedule_meeting", reason: "Reunião começa em instantes — prepare-se e entre na sala." };
  if (ctx.meetingToday) return { action: "whatsapp", reason: "Reunião hoje ainda não confirmada com o lead." };
  if (ctx.overdueFollowups > 0) return { action: "follow_up", reason: `${ctx.overdueFollowups} follow-up(s) vencido(s) sem resposta registrada.` };

  if (/proposta/i.test(stage)) {
    return { action: "call", reason: `Proposta parada há ${daysSince(lead.stageChangedAt)} dia(s) sem retorno.` };
  }
  if (/negocia/i.test(stage)) {
    return { action: "call", reason: "Negociação em aberto — avanço depende de contato direto." };
  }
  if (/documento de guerra|diagn/i.test(stage)) {
    return { action: "run_full_diagnosis", reason: "Lead aguardando diagnóstico para seguir no funil." };
  }
  if (/reunião realizada|reuniao realizada/i.test(stage)) {
    return { action: "send_proposal", reason: "Reunião já realizada e sem próximo passo formalizado." };
  }
  if (/reunião marcada|reuniao marcada/i.test(stage)) {
    return { action: "schedule_meeting", reason: "Reunião marcada — confirme presença e prepare o roteiro." };
  }
  if (/whats/i.test(diagAction)) return { action: "whatsapp", reason: lead.autoDiagnosis!.next_action };
  if (/ligar|liga(ç|c)ão/i.test(diagAction)) return { action: "call", reason: lead.autoDiagnosis!.next_action };
  if (ctx.daysSinceInteraction >= 5) {
    return { action: "call", reason: `${ctx.daysSinceInteraction} dias sem nenhuma interação registrada.` };
  }
  if ((lead.interactions || []).length + (lead.callNotes || []).length === 0) {
    return { action: "call", reason: "Lead ainda não foi trabalhado — primeira abordagem pendente." };
  }
  return { action: "follow_up", reason: "Manter cadência para não perder tração comercial." };
}

function computeOne(lead: Lead, idx: EngineIndex): LeadPriority | null {
  if (CLOSED.has(lead.stage)) return null;

  const reasons: PriorityReason[] = [];
  let score = 0;
  const add = (key: string, label: string, weight: number) => {
    if (weight <= 0) return;
    score += weight;
    reasons.push({ key, label, weight });
  };

  const overdueF = idx.overdueReminders.get(lead.id) || 0;
  const overdueT = idx.overdueTasks.get(lead.id) || 0;
  const todayT = idx.todayTasks.get(lead.id) || 0;
  const meetingSoon = idx.meetingsSoon.get(lead.id);
  const meetingToday = idx.meetingsToday.get(lead.id);

  const daysInStage = daysSince(lead.stageChangedAt);
  const daysSinceInteraction = daysSince(lastTouchISO(lead));
  const temp = displayTemperature(lead);
  const diag = lead.autoDiagnosis;

  if (meetingSoon) add("meeting_soon", `Reunião às ${meetingSoon.time}`, W.meetingSoon);
  else if (meetingToday) add("meeting_today", `Reunião hoje às ${meetingToday.time}`, W.meetingToday);

  if (overdueF > 0) add("followup_overdue", `${overdueF} follow-up(s) vencido(s)`, W.followupOverdue + (overdueF - 1) * W.followupOverduePer);
  if (overdueT > 0) add("task_overdue", `${overdueT} tarefa(s) vencida(s)`, W.taskOverdue + (overdueT - 1) * W.taskOverduePer);
  if (todayT > 0) add("task_today", `${todayT} tarefa(s) para hoje`, W.taskToday);

  if (temp.key === "quente") add("hot", "Lead quente", W.hotLead);
  else if (temp.key === "morno") add("warm", "Lead morno", W.warmLead);

  if (diag) {
    const prob = Math.max(0, Math.min(1, (diag.probability ?? 0) > 1 ? diag.probability / 100 : diag.probability));
    if (prob > 0) add("probability", `Probabilidade de fechamento ${Math.round(prob * 100)}%`, Math.round(W.diagProbability * prob));
    if (diag.attention && diag.attention.trim()) add("risk", "Diagnóstico apontou ponto de atenção", W.diagAttention);
    if (diag.temperature === "frio" && /quente|morno/i.test(lead.temperature || "")) {
      add("temp_drop", "Temperatura caiu após o último contato", W.coldDrop);
    }
  }

  if (/proposta/i.test(lead.stage) && daysInStage >= 2) {
    add("proposal_aging", `Proposta parada há ${daysInStage} dia(s)`, W.proposalBase + daysInStage * W.proposalAging);
  }
  if (/reunião realizada|reuniao realizada/i.test(lead.stage) && daysInStage >= 3) {
    add("post_meeting", `Sem follow-up pós-reunião há ${daysInStage} dia(s)`, W.postMeetingSilence + daysInStage);
  }
  if (/documento de guerra|diagn/i.test(lead.stage)) {
    add("awaiting_diagnosis", "Aguardando diagnóstico comercial", W.stageDiagnostic);
  }
  if (daysSinceInteraction >= 4 && daysSinceInteraction < 900) {
    add("silence", `${daysSinceInteraction} dias sem interação`, W.silenceBase + Math.min(20, daysSinceInteraction * W.silencePerDay));
  }
  if ((lead.contractValue || 0) > 0) {
    add("value", `Contrato potencial em jogo`, Math.min(W.contractValue, Math.log10(lead.contractValue!) * 3));
  }

  // Camada de IA já existente (Leads Prioritários do Dia) — reforça, nunca inventa.
  const pick = idx.iaPicks.get(lead.id);
  if (pick) {
    const boost = pick.impacto === "critico" ? W.iaCritical : pick.impacto === "alto" ? W.iaHigh : W.iaMedium;
    add("ia", pick.motivo || "Diretor Comercial IA sinalizou este lead", boost);
  }

  if (score < 12) return null;

  // Ação única
  let action: NBAActionKind;
  let actionReason: string;
  let source: LeadPriority["source"] = "regras";
  const nba: NextBestAction | undefined = pick?.nextBestAction;
  if (nba && nba.confidence !== "insufficient_context") {
    action = nba.action;
    actionReason = nba.reason || pick?.motivo || "";
    source = "ia";
  } else {
    const derived = deriveAction(lead, {
      overdueFollowups: overdueF,
      meetingSoon: !!meetingSoon,
      meetingToday: !!meetingToday,
      daysSinceInteraction,
    });
    action = derived.action;
    actionReason = derived.reason;
    source = diag ? "diagnostico" : "regras";
  }

  const tier = tierFor(score);
  reasons.sort((a, b) => b.weight - a.weight);

  return {
    leadId: lead.id,
    company: lead.company,
    stage: lead.stage,
    score: Math.round(score),
    tier,
    reasons: reasons.slice(0, 4),
    action,
    actionLabel: (nba?.title && source === "ia" ? nba.title : ACTION_LABEL[action]) || ACTION_LABEL[action],
    actionReason,
    urgency: source === "ia" && nba ? nba.urgency : urgencyFor(tier),
    estimatedMinutes: MINUTES_BY_ACTION[action] ?? 8,
    temperature: temp,
    contractValue: lead.contractValue,
    daysSinceInteraction,
    daysInStage,
    source,
  };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/** Prioridade de um único lead (mesma lógica usada em qualquer tela). */
export function computeLeadPriority(lead: Lead): LeadPriority | null {
  return computeOne(lead, buildIndex());
}

/** Todos os leads priorizados, do mais urgente ao menos urgente. */
export function computePriorities(leads?: Lead[]): LeadPriority[] {
  const idx = buildIndex();
  const source = leads ?? getLeads();
  const out: LeadPriority[] = [];
  for (const l of source) {
    const p = computeOne(l, idx);
    if (p) out.push(p);
  }
  return out.sort((a, b) => b.score - a.score);
}

function bucketCounts(list: LeadPriority[]): MissionBucket[] {
  const has = (p: LeadPriority, key: string) => p.reasons.some((r) => r.key === key);
  const buckets: MissionBucket[] = [
    { key: "followup", label: "follow-ups atrasados", tone: "critical", count: list.filter((p) => has(p, "followup_overdue")).length },
    { key: "critical", label: "negociações críticas", tone: "critical", count: list.filter((p) => p.tier === "critica").length },
    { key: "proposal", label: "propostas prestes a vencer", tone: "warn", count: list.filter((p) => has(p, "proposal_aging")).length },
    { key: "meetings", label: "reuniões hoje", tone: "info", count: list.filter((p) => has(p, "meeting_today") || has(p, "meeting_soon")).length },
    { key: "tasks", label: "tarefas vencidas", tone: "warn", count: list.filter((p) => has(p, "task_overdue")).length },
    { key: "hot", label: "leads com alta probabilidade", tone: "good", count: list.filter((p) => has(p, "probability") || has(p, "hot")).length },
    { key: "cooling", label: "leads esfriando", tone: "warn", count: list.filter((p) => has(p, "temp_drop") || has(p, "silence")).length },
  ];
  return buckets.filter((b) => b.count > 0);
}

function buildNudge(list: LeadPriority[]): DirectorSuggestion | null {
  const critical = list.filter((p) => p.tier === "critica");
  if (critical.length >= 3) {
    return {
      key: "critical_batch",
      tone: "critical",
      message: `Percebi ${critical.length} negociações críticas concentradas hoje. Recomendo resolvê-las antes de qualquer prospecção nova.`,
      cta: { label: `Começar por ${critical[0].company}`, leadId: critical[0].leadId },
    };
  }
  const forgottenProposal = list.find((p) => p.reasons.some((r) => r.key === "proposal_aging") && p.daysInStage >= 5);
  if (forgottenProposal) {
    return {
      key: "forgotten_proposal",
      tone: "warn",
      message: `Existe uma proposta na ${forgottenProposal.company} parada há ${forgottenProposal.daysInStage} dias. Recomendo contato hoje.`,
      cta: { label: "Retomar negociação", leadId: forgottenProposal.leadId },
    };
  }
  const cooling = list.filter((p) => p.reasons.some((r) => r.key === "temp_drop"));
  if (cooling.length > 0) {
    return {
      key: "cooling",
      tone: "warn",
      message: `${cooling.length} lead(s) esfriaram desde o último contato — ${cooling[0].company} é o de maior impacto. Vale uma retomada agora.`,
      cta: { label: "Recuperar negociação", leadId: cooling[0].leadId },
    };
  }
  const hot = list.find((p) => p.reasons.some((r) => r.key === "probability") && p.tier !== "baixa");
  if (hot) {
    return {
      key: "high_probability",
      tone: "info",
      message: `${hot.company} está com a maior probabilidade de fechamento da carteira. Tenho uma sugestão: ${hot.actionLabel.toLowerCase()}.`,
      cta: { label: "Ver lead", leadId: hot.leadId },
    };
  }
  return null;
}

/** Missão do Dia — visão executiva priorizada, 100% dinâmica. */
export function buildDailyMission(): DailyMission {
  const list = computePriorities();
  const queue = list.slice(0, 6);
  const actionable = list.filter((p) => p.tier === "critica" || p.tier === "alta");
  const estimatedMinutes = (actionable.length ? actionable : queue).reduce((s, p) => s + p.estimatedMinutes, 0);

  return {
    generatedAt: new Date().toISOString(),
    buckets: bucketCounts(list),
    top: list[0] ?? null,
    queue,
    totalLeadsWithPriority: list.length,
    estimatedMinutes,
    nudge: buildNudge(list),
  };
}

export const TIER_META: Record<PriorityTier, { label: string; cls: string; dot: string }> = {
  critica: { label: "Crítica", cls: "bg-rose-500/15 text-rose-500 border-rose-500/30", dot: "bg-rose-500" },
  alta: { label: "Alta", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30", dot: "bg-amber-500" },
  media: { label: "Média", cls: "bg-sky-500/15 text-sky-500 border-sky-500/30", dot: "bg-sky-500" },
  baixa: { label: "Baixa", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30", dot: "bg-slate-400" },
};

export function formatMinutes(min: number): string {
  if (min <= 0) return "0 min";
  if (min < 60) return `${Math.round(min)} minutos`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
