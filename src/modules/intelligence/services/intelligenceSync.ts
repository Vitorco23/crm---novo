// ===== IA como Fonte Única da Verdade do Lead =====
// Orquestra o "Atualizar Inteligência" (antigo Diagnóstico Completo).
// Reutiliza integralmente a infraestrutura existente (AI Core, autoDiagnosis,
// memória comercial, priority engine, event bus). NÃO altera Edge Functions,
// Prompt Registry ou contratos públicos.
//
// Fluxo: nova interação → atualizar inteligência → diagnóstico → propaga para
// briefing, temperatura, probabilidade, NBA, memória, timeline e prioridade.

import {
  getLeads,
  pushLeadDiagnosisVersion,
  type AutoDiagnosis,
  type DiagnosisVersion,
  type Lead,
} from "@/shared/services/store";
import { runAutoDiagnosis } from "./autoDiagnosis";
import { executiveSummary } from "./leadInsights";
import { computeLeadPriority } from "./priorityEngine";
import { extractMemoryFromLead } from "./commercialMemory";
import { appendHistory } from "@/shared/services/history";
import { emit } from "@/shared/services/eventBus";
import { LeadIntelligenceRepository } from "@/modules/leads/services/LeadIntelligenceRepository";

export interface IntelligenceSnapshot {
  temperature?: string;
  probability?: number;
  nextAction?: string;
  attention?: string;
  decisor?: string;
  summary?: string;
  priorityTier?: string;
  priorityScore?: number;
}

export interface IntelligenceRefreshResult {
  ok: boolean;
  changed: boolean;
  changes: string[];
  version?: DiagnosisVersion;
  diagnosis?: AutoDiagnosis;
  error?: string;
}

const TEMP_LABEL: Record<string, string> = { quente: "Quente", morno: "Morno", frio: "Frio" };

/** Estado comercial inteligente atual do lead (antes/depois da IA). */
export function snapshotIntelligence(lead: Lead): IntelligenceSnapshot {
  const d = lead.autoDiagnosis;
  const s = executiveSummary(lead);
  const p = computeLeadPriority(lead);
  return {
    temperature: d?.temperature,
    probability: typeof d?.probability === "number" ? Math.round(d.probability) : undefined,
    nextAction: (d?.next_action || "").trim() || undefined,
    attention: (d?.attention || "").trim() || undefined,
    decisor: s.decisor,
    summary: (d?.summary || "").trim() || undefined,
    priorityTier: p?.tier,
    priorityScore: p?.score,
  };
}

function norm(v?: string) {
  return (v || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Compara dois estados e descreve, em linguagem comercial, o que mudou. */
export function diffIntelligence(before: IntelligenceSnapshot, after: IntelligenceSnapshot): string[] {
  const out: string[] = [];

  if (after.temperature && before.temperature !== after.temperature) {
    out.push(
      before.temperature
        ? `Temperatura alterada de ${TEMP_LABEL[before.temperature] ?? before.temperature} para ${TEMP_LABEL[after.temperature] ?? after.temperature}.`
        : `Temperatura definida como ${TEMP_LABEL[after.temperature] ?? after.temperature}.`,
    );
  }

  if (typeof after.probability === "number") {
    const b = before.probability;
    if (typeof b !== "number") out.push(`Probabilidade estimada em ${after.probability}%.`);
    else if (Math.abs(after.probability - b) >= 5) {
      out.push(`Probabilidade ${after.probability > b ? "aumentou" : "caiu"} de ${b}% para ${after.probability}%.`);
    }
  }

  if (after.decisor && norm(before.decisor) !== norm(after.decisor)) {
    out.push(before.decisor ? `Decisor atualizado: ${after.decisor}.` : `Novo decisor identificado: ${after.decisor}.`);
  }

  if (after.attention && norm(before.attention) !== norm(after.attention)) {
    out.push(`Nova objeção/risco detectado: ${trim(after.attention, 120)}`);
  }

  if (after.nextAction && norm(before.nextAction) !== norm(after.nextAction)) {
    out.push(`Próxima Melhor Ação alterada: ${trim(after.nextAction, 120)}`);
  }

  if (after.summary && norm(before.summary) !== norm(after.summary)) {
    out.push("Situação atual do lead reescrita pela IA.");
  }

  if (after.priorityTier && before.priorityTier !== after.priorityTier) {
    out.push(`Prioridade recalculada: ${before.priorityTier ?? "—"} → ${after.priorityTier}.`);
  } else if (
    typeof after.priorityScore === "number" &&
    typeof before.priorityScore === "number" &&
    Math.abs(after.priorityScore - before.priorityScore) >= 10
  ) {
    out.push("Prioridade recalculada pelo Priority Engine.");
  }

  return out;
}

function trim(s: string, n: number) {
  const v = (s || "").replace(/\s+/g, " ").trim();
  return v.length <= n ? v : `${v.slice(0, n - 1)}…`;
}

/**
 * Recalcula TODO o estado comercial inteligente do lead.
 * É a operação por trás do botão "Atualizar Inteligência" (Diagnóstico Completo).
 */
export async function refreshLeadIntelligence(
  leadId: string,
  origin = "Atualizar Inteligência",
): Promise<IntelligenceRefreshResult> {
  const before = getLeads().find((l) => l.id === leadId);
  if (!before) return { ok: false, changed: false, changes: [], error: "Lead não encontrado" };

  const snapBefore = snapshotIntelligence(before);
  const hadDiagnosis = Boolean(before.autoDiagnosis);

  const diagnosis = await runAutoDiagnosis(leadId);
  if (!diagnosis) {
    return { ok: false, changed: false, changes: [], error: "Não foi possível gerar a inteligência do lead." };
  }

  const after = getLeads().find((l) => l.id === leadId)!;
  const snapAfter = snapshotIntelligence(after);
  const changes = diffIntelligence(snapBefore, snapAfter);
  const relevant = !hadDiagnosis || changes.length > 0;

  // Sem mudança relevante: não versiona nem polui a timeline.
  if (!relevant) {
    LeadIntelligenceRepository.invalidate(leadId);
    return { ok: true, changed: false, changes: [], diagnosis };
  }

  const version = pushLeadDiagnosisVersion(leadId, diagnosis, changes, origin) ?? undefined;

  // Timeline comercial — registra o que realmente mudou.
  appendHistory({
    leadId,
    type: "InteligenciaAtualizada",
    label: version ? `IA atualizou o lead (v${version.version})` : "IA atualizou o lead",
    detail: changes.join(" "),
  });

  // Memória comercial — aprendizado permanente, sem ação extra do usuário.
  try {
    const learned = (diagnosis.updated_memory || "").trim();
    if (learned) {
      extractMemoryFromLead("objection_handled", after, `Inteligência atualizada (${origin}). ${learned}`);
    }
  } catch { /* memória é best-effort */ }

  // Prioridade / Missão do Dia — notifica o restante do SOC.
  LeadIntelligenceRepository.invalidate(leadId);
  try {
    emit("LeadAtualizado", {
      leadId,
      company: after.company,
      stage: after.stage,
      source: "intelligence-sync",
      changes,
    }, `intel:${leadId}:${diagnosis.generatedAt}`);
  } catch { /* ignore */ }

  return { ok: true, changed: true, changes, version, diagnosis };
}
