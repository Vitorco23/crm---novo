// Derivações puras usadas pelo UX de prospecção (Sprint copiloto).
// NÃO chama IA. Apenas lê dados já presentes no Lead (autoDiagnosis, notes,
// interactions, callNotes, meetings, stage). Todas as funções são O(n) sobre
// as interações do próprio lead — seguras para uso em listas grandes.

import type { Lead, Interaction, CallNote } from "@/lib/store";
import { computeLeadTemperature, nextActionLabel, lastInteractionLabel } from "@/lib/coldCallMetrics";

/** Temperatura consolidada: diagnóstico automático > heurística de cadência. */
export function displayTemperature(lead: Lead): {
  key: "quente" | "morno" | "frio" | "novo";
  label: string;
  emoji: string;
  cls: string;
} {
  const diag = lead.autoDiagnosis?.temperature;
  if (diag === "quente") return { key: "quente", label: "Quente", emoji: "🔥", cls: "text-orange-500" };
  if (diag === "morno") return { key: "morno", label: "Morno", emoji: "🌡", cls: "text-yellow-500" };
  if (diag === "frio")  return { key: "frio",  label: "Frio",  emoji: "❄",  cls: "text-sky-400" };
  const t = computeLeadTemperature(lead);
  if (t === "hot")  return { key: "quente", label: "Quente", emoji: "🔥", cls: "text-orange-500" };
  if (t === "warm") return { key: "morno",  label: "Morno",  emoji: "🌡", cls: "text-yellow-500" };
  if (t === "cold") return { key: "frio",   label: "Frio",   emoji: "❄",  cls: "text-sky-400" };
  return { key: "novo", label: "Novo", emoji: "✨", cls: "text-muted-foreground" };
}

/** Próxima ação priorizando o diagnóstico automático. */
export function displayNextAction(lead: Lead): string {
  const na = (lead.autoDiagnosis?.next_action || "").trim();
  if (na) return na;
  return nextActionLabel(lead);
}

/** Resumo da última interação em 1 linha (empresa vê "o que houve por último"). */
export function lastInteractionSnippet(lead: Lead, maxChars = 90): { source: string; text: string; at: string } | null {
  const inter = [...(lead.interactions || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const note  = [...(lead.callNotes || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const interAt = inter ? new Date(inter.date).getTime() : 0;
  const noteAt  = note  ? new Date(note.createdAt).getTime() : 0;

  if (!inter && !note) {
    const l = lastInteractionLabel(lead);
    return { source: l.label, text: `Última atualização ${l.when}`, at: lead.stageChangedAt };
  }

  if (interAt >= noteAt && inter) {
    const raw = (inter.summary || inter.title || "").replace(/\s+/g, " ").trim();
    return { source: inter.type, text: truncate(raw, maxChars), at: inter.date };
  }
  const raw = (note!.text || "").replace(/\s+/g, " ").trim();
  return { source: "Ligação", text: truncate(raw, maxChars), at: note!.createdAt };
}

function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

/** Trilha comercial: ícones ordenados cronologicamente resumindo a jornada. */
export type TrailItemKind = "call" | "whatsapp" | "email" | "meeting" | "proposal" | "visit" | "followup" | "sale" | "other";
export interface TrailItem { kind: TrailItemKind; at: string; label: string; }

export function commercialTrail(lead: Lead, meetings: Array<{ id: string; date: string; time: string; title?: string }>): TrailItem[] {
  const out: TrailItem[] = [];
  for (const i of lead.interactions || []) out.push({ kind: kindFromType(i.type), at: i.date, label: i.type });
  for (const n of lead.callNotes || []) out.push({ kind: "call", at: n.createdAt, label: "Ligação" });
  for (const m of meetings) out.push({ kind: "meeting", at: `${m.date}T${m.time}:00`, label: m.title || "Reunião" });
  // Venda: heurística barata sem alterar regras — apenas detecta pela etapa.
  if (/ganho|venda/i.test(lead.stage)) out.push({ kind: "sale", at: lead.stageChangedAt, label: "Venda" });
  return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function kindFromType(type: string): TrailItemKind {
  const t = (type || "").toLowerCase();
  if (t.includes("whatsapp")) return "whatsapp";
  if (t.includes("e-mail") || t.includes("email")) return "email";
  if (t.includes("proposta")) return "proposal";
  if (t.includes("visita")) return "visit";
  if (t.includes("follow")) return "followup";
  if (t.includes("reunião") || t.includes("reuniao")) return "meeting";
  if (t.includes("ligação") || t.includes("ligacao") || t.includes("call")) return "call";
  return "other";
}

/** Resumo Executivo derivado APENAS de dados já existentes.
 *  Nunca dispara IA. Faz best-effort parsing das Observações Permanentes
 *  (linhas "Rótulo: valor"), completando com o autoDiagnosis quando disponível. */
export interface ExecutiveSummary {
  decisor?: string;
  ultimaLigacao?: string;
  maiorObjecao?: string;
  melhorHorario?: string;
  proximaAcao?: string;
}

const DECISOR_KEYS   = ["decisor", "quem decide", "responsável", "responsavel"];
const OBJECAO_KEYS   = ["objeção", "objecao", "principal objeção", "maior objeção"];
const HORARIO_KEYS   = ["melhor horário", "melhor horario", "horário", "horario", "melhor contato"];

function findByKeys(notes: string, keys: string[]): string | undefined {
  if (!notes) return undefined;
  const lines = notes.split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (!val) continue;
    if (keys.some((k) => key.includes(k))) return val;
  }
  return undefined;
}

export function executiveSummary(lead: Lead): ExecutiveSummary {
  const notes = lead.notes || "";
  const diag = lead.autoDiagnosis;

  const interLast = [...(lead.interactions || [])]
    .filter((i) => /ligação|ligacao|call/i.test(i.type))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const noteLast  = [...(lead.callNotes || [])]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const ultimaLigacao =
    (interLast && (interLast.summary || interLast.title)) ||
    (noteLast && noteLast.text) ||
    diag?.summary ||
    undefined;

  return {
    decisor: findByKeys(notes, DECISOR_KEYS),
    ultimaLigacao: ultimaLigacao ? truncate(String(ultimaLigacao).replace(/\s+/g, " ").trim(), 220) : undefined,
    maiorObjecao: findByKeys(notes, OBJECAO_KEYS) || (diag?.attention ? truncate(diag.attention, 220) : undefined),
    melhorHorario: findByKeys(notes, HORARIO_KEYS),
    proximaAcao: diag?.next_action || undefined,
  };
}

/** Badges visuais leves — apenas leitura de dados existentes. */
export interface LeadBadge { key: string; label: string; cls: string; }

export function leadBadges(lead: Lead, meetings: Array<{ id: string; date: string; time: string; title?: string }>): LeadBadge[] {
  const b: LeadBadge[] = [];
  const temp = displayTemperature(lead);
  if (temp.key === "quente") b.push({ key: "hot", label: "🔥 Quente", cls: "bg-orange-500/15 text-orange-500 border-orange-500/30" });

  const summary = executiveSummary(lead);
  if (summary.decisor) b.push({ key: "dm", label: "👤 Decisor identificado", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" });
  else if (/sem contato|sem decisor|gatekeeper/i.test((lead.notes || "") + " " + (lead.autoDiagnosis?.attention || ""))) {
    b.push({ key: "no-dm", label: "⚠ Sem contato com decisor", cls: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" });
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);
  const hasReturnToday = meetings.some((m) => {
    const d = new Date(`${m.date}T${m.time || "00:00"}:00`);
    return d >= today && d < tomorrow;
  });
  if (hasReturnToday) b.push({ key: "today", label: "📅 Retorno hoje", cls: "bg-sky-500/15 text-sky-500 border-sky-500/30" });

  const hasProposal = (lead.interactions || []).some((i) => /proposta/i.test(i.type)) || /proposta/i.test(lead.stage);
  if (hasProposal) b.push({ key: "prop", label: "📄 Proposta enviada", cls: "bg-violet-500/15 text-violet-500 border-violet-500/30" });

  return b;
}
