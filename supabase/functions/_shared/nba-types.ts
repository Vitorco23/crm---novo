// Próxima Melhor Ação (NBA) — contrato server-side.
// Este módulo é compartilhado por TODAS as funções de IA (diretor,
// auditor de ligação, priorização) para garantir uma única forma da
// recomendação, com guard-rails determinísticos.

export type NBAActionKind =
  | "call"
  | "whatsapp"
  | "schedule_meeting"
  | "send_proposal"
  | "follow_up"
  | "wait_reply"
  | "request_docs"
  | "register_loss"
  | "close_deal"
  | "run_full_diagnosis";

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

export const NBA_ACTION_KINDS: NBAActionKind[] = [
  "call", "whatsapp", "schedule_meeting", "send_proposal", "follow_up",
  "wait_reply", "request_docs", "register_loss", "close_deal", "run_full_diagnosis",
];

/** Prompt block obrigatório — anexar ao final de todo SYSTEM ou USER prompt de IA. */
export const NBA_PROMPT_BLOCK = `
==============================
PRÓXIMA MELHOR AÇÃO (obrigatório)
==============================
Ao final da resposta, inclua também um objeto \`next_best_action\` com EXATAMENTE UMA ação — a de maior impacto esperado agora — no formato:
{
  "action": "call" | "whatsapp" | "schedule_meeting" | "send_proposal" | "follow_up" | "wait_reply" | "request_docs" | "register_loss" | "close_deal" | "run_full_diagnosis",
  "title": string,           // ex: "Realizar ligação hoje até às 16h"
  "reason": string,          // máximo 2 frases, objetivo
  "urgency": "now" | "today" | "this_week" | "when_possible",
  "confidence": "high" | "medium" | "low" | "insufficient_context"
}
Se não houver contexto suficiente, use confidence="insufficient_context" e inclua "missingContext": string[] com o que precisa ser coletado.
Nunca gere mais de uma ação. Nunca sugira ação contraditória (ex: não sugerir ligação em lead perdido).
`.trim();

export interface SanitizeContext {
  stage?: string;
  hasDiagnosis?: boolean;
  interactionsCount?: number;
  callNotesCount?: number;
  hasPendingPromise?: boolean;
}

const CLOSED_LOST = new Set(["Perdido", "perdido", "Lost"]);
const CLOSED_WON = new Set(["Ganho", "ganho", "Won"]);
const PRE_PROPOSAL_STAGES = new Set([
  "Novo Lead", "Tentativa 1", "Tentativa 2", "Tentativa 3", "Tentativa 4",
  "Tentativa 5", "Tentativa 6", "Tentativa 7", "Tentativa 8", "Tentativa 9",
  "Tentativa 10", "Sem contato",
]);

/**
 * Normaliza e corrige contradições. Retorna uma NBA sempre válida.
 * Se input for irrecuperável e faltar contexto, degrada para insufficient_context.
 */
export function sanitizeNBA(
  raw: unknown,
  ctx: SanitizeContext = {},
  leadId?: string,
): NextBestAction {
  const now = new Date().toISOString();
  const empty = (): NextBestAction => ({
    action: "run_full_diagnosis",
    title: "Coletar mais contexto antes de decidir",
    reason: "Ainda não há informação suficiente para escolher a próxima ação com segurança.",
    urgency: "when_possible",
    confidence: "insufficient_context",
    missingContext: ["Registrar ligação, interação ou observação para calibrar a recomendação."],
    generatedAt: now,
    leadId,
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
  const missingContext = Array.isArray(r.missingContext)
    ? (r.missingContext as unknown[]).map((x) => String(x)).slice(0, 5)
    : undefined;

  // ---- Guard-rails ----
  // Sem contexto mínimo => insufficient_context
  if ((ctx.interactionsCount ?? 0) + (ctx.callNotesCount ?? 0) === 0 && ctx.stage !== undefined) {
    confidence = "insufficient_context";
  }

  // Lead perdido: só ações coerentes
  if (ctx.stage && CLOSED_LOST.has(ctx.stage)) {
    if (!["register_loss", "wait_reply"].includes(action)) {
      action = "register_loss";
      title = title || "Registrar motivo da perda";
      reason = reason || "Lead já está na etapa Perdido; padronize o motivo para alimentar a memória comercial.";
      urgency = "when_possible";
    }
  }

  // Lead ganho: só close_deal / wait_reply
  if (ctx.stage && CLOSED_WON.has(ctx.stage)) {
    if (!["close_deal", "wait_reply"].includes(action)) {
      action = "close_deal";
      title = title || "Iniciar onboarding do cliente";
      reason = reason || "Lead já foi ganho; siga com o processo pós-venda.";
      urgency = "today";
    }
  }

  // Promessa pendente => nunca "aguardar"
  if (ctx.hasPendingPromise && action === "wait_reply") {
    action = "follow_up";
    title = title || "Cumprir promessa pendente com o cliente";
    reason = reason || "Existe um compromisso registrado; adiar reduz a probabilidade de fechamento.";
    urgency = "today";
  }

  // Sem diagnóstico + etapa pré-proposta => bloqueia send_proposal
  if (action === "send_proposal" && !ctx.hasDiagnosis && ctx.stage && PRE_PROPOSAL_STAGES.has(ctx.stage)) {
    action = "run_full_diagnosis";
    title = title || "Executar diagnóstico antes de enviar proposta";
    reason = "Lead ainda não passou por diagnóstico; enviar proposta agora reduz a taxa de fechamento.";
    urgency = "today";
  }

  if (!title) title = defaultTitle(action);
  if (!reason) reason = "Ação escolhida como a de maior impacto esperado agora.";

  return {
    action,
    title,
    reason,
    urgency,
    confidence,
    missingContext: confidence === "insufficient_context"
      ? (missingContext ?? ["Registrar ligação, interação ou observação para calibrar a recomendação."])
      : undefined,
    generatedAt: now,
    leadId,
  };
}

function defaultTitle(a: NBAActionKind): string {
  switch (a) {
    case "call": return "Realizar ligação com o lead";
    case "whatsapp": return "Enviar mensagem no WhatsApp";
    case "schedule_meeting": return "Agendar reunião comercial";
    case "send_proposal": return "Enviar proposta";
    case "follow_up": return "Fazer follow-up";
    case "wait_reply": return "Aguardar retorno do cliente";
    case "request_docs": return "Solicitar documentos necessários";
    case "register_loss": return "Registrar motivo da perda";
    case "close_deal": return "Iniciar onboarding do cliente";
    case "run_full_diagnosis": return "Executar diagnóstico completo do lead";
  }
}

/** Extrai `next_best_action` de um objeto de resposta da IA (tolerante a variações). */
export function extractNBA(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  return p.next_best_action ?? p.nextBestAction ?? p.proximaMelhorAcao ?? null;
}
