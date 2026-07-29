// AI Core — Contrato de Contexto de Lead (Projeto Phoenix, Fase 3B).
// Fonte única do formato de contexto de lead usado pelas análises de IA
// (diagnóstico automático, diagnóstico completo, resumo executivo, NBA).
//
// Regras:
//   • Todo conteúdo de origem externa (Matteline, observações, transcrições)
//     passa por wrapUntrusted antes de entrar no prompt.
//   • O contexto pertence a UM lead. Nada aqui mistura dados de outros leads.
//   • Somente montagem de texto: nenhuma regra de negócio, nenhuma chamada de IA.

import { wrapUntrusted } from "../untrusted-input.ts";

export interface LeadInteractionRef {
  date: string;
  title: string;
  summary: string;
}

/** Contrato de entrada das análises de lead. */
export interface LeadIntelligenceInput {
  leadId?: string;
  company?: string;
  niche?: string;
  city?: string;
  stage?: string;
  /** Observações permanentes escritas pelo vendedor. */
  notes?: string;
  /** Bloco de memória comercial já resolvido pelo Memory Engine (opcional). */
  memory?: string;
  recentInteractions?: LeadInteractionRef[];
  /** Resumo da última ligação (fonte externa, não confiável). */
  summary?: string;
  /** Transcrição da última ligação (fonte externa, não confiável). */
  transcription?: string;
}

export const LEAD_CONTEXT_LIMITS = {
  recentInteractions: 5,
  interactionSummaryChars: 200,
  notesChars: 1200,
  memoryChars: 1200,
  historyChars: 1500,
  callChars: 2000,
} as const;

/** Cabeçalho factual do lead (dados internos do CRM, confiáveis). */
export function buildLeadHeader(input: LeadIntelligenceInput): string {
  return [
    `Empresa: ${input.company || "N/D"}`,
    `Nicho: ${input.niche || "N/D"}`,
    `Cidade: ${input.city || "N/D"}`,
    `Etapa: ${input.stage || "N/D"}`,
  ].join("\n");
}

/** Histórico recente compactado (uma linha por interação). */
export function buildRecentHistoryText(input: LeadIntelligenceInput): string {
  const list = (input.recentInteractions ?? []).slice(-LEAD_CONTEXT_LIMITS.recentInteractions);
  if (!list.length) return "(sem interações anteriores)";
  return list
    .map((i, idx) =>
      `#${idx + 1} [${i.date}] ${i.title} — ${String(i.summary || "").slice(0, LEAD_CONTEXT_LIMITS.interactionSummaryChars)}`,
    )
    .join("\n");
}

export interface LeadContextOptions {
  /** Instrução final anexada ao prompt do usuário. */
  instruction?: string;
  /** Inclui o bloco da última ligação (resumo/transcrição). Padrão: true. */
  includeCall?: boolean;
}

/**
 * Monta o prompt de contexto de um lead na ordem canônica:
 * dados → observações → memória → histórico recente → última ligação → instrução.
 */
export function buildLeadContextPrompt(
  input: LeadIntelligenceInput,
  opts: LeadContextOptions = {},
): string {
  const summary = (input.summary || "").trim();
  const transcription = (input.transcription || "").trim();
  const includeCall = opts.includeCall !== false;

  return [
    "========== DADOS DO LEAD ==========",
    buildLeadHeader(input),
    "",
    "========== OBSERVAÇÕES PERMANENTES ==========",
    wrapUntrusted(input.notes || "(vazio)", { maxChars: LEAD_CONTEXT_LIMITS.notesChars, label: "OBSERVAÇÕES" }),
    "",
    input.memory
      ? `========== MEMÓRIA COMERCIAL ==========\n${wrapUntrusted(input.memory, { maxChars: LEAD_CONTEXT_LIMITS.memoryChars, label: "MEMÓRIA" })}\n`
      : "",
    "========== HISTÓRICO RECENTE ==========",
    wrapUntrusted(buildRecentHistoryText(input), { maxChars: LEAD_CONTEXT_LIMITS.historyChars, label: "HISTÓRICO" }),
    "",
    ...(includeCall
      ? [
          "========== ÚLTIMA LIGAÇÃO (Matteline) ==========",
          summary ? wrapUntrusted(summary, { maxChars: LEAD_CONTEXT_LIMITS.callChars, label: "RESUMO DA LIGAÇÃO" }) : "",
          transcription ? wrapUntrusted(transcription, { maxChars: LEAD_CONTEXT_LIMITS.callChars, label: "TRANSCRIÇÃO" }) : "",
          "",
        ]
      : []),
    opts.instruction ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Texto curto para consultar a Memória Comercial no escopo do lead. */
export function buildLeadMemoryQuery(input: LeadIntelligenceInput, prefix = "Análise de lead"): string {
  return [
    prefix,
    `Empresa: ${input.company || "N/D"}`,
    `Nicho: ${input.niche || "N/D"}`,
    `Etapa: ${input.stage || "N/D"}`,
    (input.summary || "").slice(0, 800),
  ]
    .filter(Boolean)
    .join(". ")
    .slice(0, 2000);
}
