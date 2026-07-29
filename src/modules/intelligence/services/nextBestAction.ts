// Próxima Melhor Ação (NBA) — contrato client-side + guard-rails.
// Espelha src/../supabase/functions/_shared/nba-types.ts para defesa em profundidade.

import type { Lead } from "@/shared/services/store";
import { getTasksByLead } from "@/modules/leads/services/leadTasks";
import { getReminders } from "@/modules/agenda/services/reminders";

export type NBAActionKind =
  | "call" | "whatsapp" | "schedule_meeting" | "send_proposal" | "follow_up"
  | "wait_reply" | "request_docs" | "register_loss" | "close_deal" | "run_full_diagnosis";

export type NBAUrgency = "now" | "today" | "this_week" | "when_possible";
export type NBAConfidence = "high" | "medium" | "low" | "insufficient_context";

export interface NextBestAction {
  action: NBAActionKind;
  title: string;
  reason: string;
  urgency: NBAUrgency;
  confidence: NBAConfidence;
  missingContext?: string[];
  generatedAt: string;
  leadId?: string;
}

const NBA_ACTION_KINDS: NBAActionKind[] = [
  "call", "whatsapp", "schedule_meeting", "send_proposal", "follow_up",
  "wait_reply", "request_docs", "register_loss", "close_deal", "run_full_diagnosis",
];

const CLOSED_LOST = new Set(["Perdido", "perdido", "Lost"]);
const CLOSED_WON = new Set(["Ganho", "ganho", "Won"]);
const PRE_PROPOSAL_STAGES = new Set([
  "Novo Lead", "Tentativa 1", "Tentativa 2", "Tentativa 3", "Tentativa 4",
  "Tentativa 5", "Tentativa 6", "Tentativa 7", "Tentativa 8", "Tentativa 9",
  "Tentativa 10", "Sem contato",
]);

export interface NBAContext {
  stage?: string;
  hasDiagnosis?: boolean;
  interactionsCount?: number;
  callNotesCount?: number;
  hasPendingPromise?: boolean;
}

export function contextFromLead(lead?: Lead | null): NBAContext {
  if (!lead) return {};
  const tasks = getTasksByLead(lead.id);
  const rems = getReminders().filter((r) => r.leadId === lead.id);
  const now = Date.now();
  const hasPending =
    tasks.some((t) => t.status === "pendente" && new Date(t.dueAt).getTime() <= now + 86400000) ||
    rems.some((r) => r.status === "pending" && new Date(r.scheduledFor).getTime() <= now + 86400000);
  const hasDiag = (lead.callNotes || []).some((n) => n.analysis?.mode === "full");
  return {
    stage: lead.stage,
    hasDiagnosis: hasDiag,
    interactionsCount: (lead.interactions || []).length,
    callNotesCount: (lead.callNotes || []).length,
    hasPendingPromise: hasPending,
  };
}

export function sanitizeNBA(raw: unknown, ctx: NBAContext = {}, leadId?: string): NextBestAction {
  const now = new Date().toISOString();
  const empty = (): NextBestAction => ({
    action: "run_full_diagnosis",
    title: "Coletar mais contexto antes de decidir",
    reason: "Ainda não há informação suficiente para escolher a próxima ação com segurança.",
    urgency: "when_possible",
    confidence: "insufficient_context",
    missingContext: ["Registrar ligação, interação ou observação para calibrar a recomendação."],
    generatedAt: now, leadId,
  });
  if (!raw || typeof raw !== "object") return empty();
  const r = raw as Record<string, unknown>;

  let action = String(r.action || "").trim() as NBAActionKind;
  if (!NBA_ACTION_KINDS.includes(action)) action = "follow_up";

  let title = String(r.title || "").trim().slice(0, 160);
  let reason = String(r.reason || "").trim().slice(0, 400);
  let urgency = (["now", "today", "this_week", "when_possible"].includes(String(r.urgency))
    ? r.urgency : "today") as NBAUrgency;
  let confidence = (["high", "medium", "low", "insufficient_context"].includes(String(r.confidence))
    ? r.confidence : "medium") as NBAConfidence;
  const missing = Array.isArray(r.missingContext)
    ? (r.missingContext as unknown[]).map(String).slice(0, 5) : undefined;

  if ((ctx.interactionsCount ?? 0) + (ctx.callNotesCount ?? 0) === 0 && ctx.stage !== undefined) {
    confidence = "insufficient_context";
  }
  if (ctx.stage && CLOSED_LOST.has(ctx.stage) && !["register_loss", "wait_reply"].includes(action)) {
    action = "register_loss";
    title = title || "Registrar motivo da perda";
    reason = reason || "Lead já está na etapa Perdido; padronize o motivo para alimentar a memória comercial.";
    urgency = "when_possible";
  }
  if (ctx.stage && CLOSED_WON.has(ctx.stage) && !["close_deal", "wait_reply"].includes(action)) {
    action = "close_deal";
    title = title || "Iniciar onboarding do cliente";
    reason = reason || "Lead já foi ganho; siga para o pós-venda.";
    urgency = "today";
  }
  if (ctx.hasPendingPromise && action === "wait_reply") {
    action = "follow_up";
    title = title || "Cumprir promessa pendente";
    reason = reason || "Existe compromisso pendente com o cliente; adiar derruba a taxa de fechamento.";
    urgency = "today";
  }
  if (action === "send_proposal" && !ctx.hasDiagnosis && ctx.stage && PRE_PROPOSAL_STAGES.has(ctx.stage)) {
    action = "run_full_diagnosis";
    title = title || "Executar diagnóstico antes de enviar proposta";
    reason = "Lead ainda não passou por diagnóstico; enviar proposta agora reduz a chance de fechar.";
    urgency = "today";
  }
  if (!title) title = DEFAULT_TITLES[action];
  if (!reason) reason = "Ação escolhida como a de maior impacto esperado agora.";

  return {
    action, title, reason, urgency, confidence,
    missingContext: confidence === "insufficient_context"
      ? (missing ?? ["Registrar ligação, interação ou observação para calibrar a recomendação."])
      : undefined,
    generatedAt: now, leadId,
  };
}

const DEFAULT_TITLES: Record<NBAActionKind, string> = {
  call: "Realizar ligação com o lead",
  whatsapp: "Enviar mensagem no WhatsApp",
  schedule_meeting: "Agendar reunião comercial",
  send_proposal: "Enviar proposta",
  follow_up: "Fazer follow-up",
  wait_reply: "Aguardar retorno do cliente",
  request_docs: "Solicitar documentos necessários",
  register_loss: "Registrar motivo da perda",
  close_deal: "Iniciar onboarding do cliente",
  run_full_diagnosis: "Executar diagnóstico completo do lead",
};

// ============= UI meta =============
export const ACTION_META: Record<NBAActionKind, { icon: string; label: string; color: string }> = {
  call:               { icon: "📞", label: "Ligar",               color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  whatsapp:           { icon: "💬", label: "WhatsApp",            color: "bg-green-500/15 text-green-500 border-green-500/30" },
  schedule_meeting:   { icon: "📅", label: "Agendar reunião",     color: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  send_proposal:      { icon: "📄", label: "Enviar proposta",     color: "bg-indigo-500/15 text-indigo-500 border-indigo-500/30" },
  follow_up:          { icon: "🔁", label: "Follow-up",           color: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  wait_reply:         { icon: "⏳", label: "Aguardar retorno",    color: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  request_docs:       { icon: "📎", label: "Solicitar documentos",color: "bg-cyan-500/15 text-cyan-500 border-cyan-500/30" },
  register_loss:      { icon: "❌", label: "Registrar perda",     color: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  close_deal:         { icon: "🏆", label: "Fechar / iniciar onb.",color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  run_full_diagnosis: { icon: "🤖", label: "Diagnóstico completo",color: "bg-primary/15 text-primary border-primary/30" },
};

export const URGENCY_META: Record<NBAUrgency, { label: string; color: string }> = {
  now:            { label: "Agora",        color: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  today:          { label: "Hoje",         color: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  this_week:      { label: "Esta semana",  color: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
  when_possible:  { label: "Quando puder", color: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
};

export const CONFIDENCE_META: Record<NBAConfidence, { label: string; color: string }> = {
  high:                 { label: "Confiança alta",   color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  medium:               { label: "Confiança média",  color: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  low:                  { label: "Confiança baixa",  color: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  insufficient_context: { label: "Contexto insuficiente", color: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
};

/** Botões do "Pacote de Execução" adaptados a cada tipo de ação. */
export type NBAPackageButton =
  | "call_dialer" | "log_call" | "whatsapp" | "generate_message"
  | "generate_script" | "schedule_meeting" | "generate_invite"
  | "send_proposal_link" | "upload_docs" | "register_loss"
  | "start_onboarding" | "run_full_diagnosis" | "open_lead";

export const ACTION_PACKAGES: Record<NBAActionKind, NBAPackageButton[]> = {
  call:               ["call_dialer", "log_call", "whatsapp", "generate_script", "run_full_diagnosis", "open_lead"],
  whatsapp:           ["whatsapp", "generate_message", "run_full_diagnosis", "open_lead"],
  schedule_meeting:   ["schedule_meeting", "generate_invite", "whatsapp", "run_full_diagnosis", "open_lead"],
  send_proposal:      ["send_proposal_link", "whatsapp", "generate_message", "open_lead"],
  follow_up:          ["whatsapp", "call_dialer", "log_call", "run_full_diagnosis", "open_lead"],
  wait_reply:         ["open_lead", "run_full_diagnosis"],
  request_docs:       ["whatsapp", "generate_message", "upload_docs", "open_lead"],
  register_loss:      ["register_loss", "open_lead"],
  close_deal:         ["start_onboarding", "open_lead"],
  run_full_diagnosis: ["run_full_diagnosis", "open_lead"],
};
