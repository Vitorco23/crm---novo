// Lead Intelligence — ponto oficial de acesso à inteligência de um lead.
// Projeto Phoenix, Fase 3B.
//
// Unifica tecnicamente: diagnóstico automático, Next Best Action, resumo
// executivo, badges, trilha comercial e referências de memória.
// Regras:
//   • Toda leitura é derivada do PRÓPRIO lead — nada é compartilhado entre leads.
//   • As funções de leitura são puras e não disparam IA.
//   • A única operação com IA é `runDiagnosis`, explícita e sob demanda.

import type { Lead } from "@/shared/services/store";
import {
  displayTemperature,
  displayNextAction,
  executiveSummary,
  leadBadges,
  commercialTrail,
  lastInteractionSnippet,
} from "@/modules/intelligence/services/leadInsights";
import {
  contextFromLead,
  sanitizeNBA,
} from "@/modules/intelligence/services/nextBestAction";
import {
  runAutoDiagnosis,
  runAutoDiagnosisForLeads,
} from "@/modules/intelligence/services/autoDiagnosis";
import type { LeadIntelligenceView, MeetingRef } from "./LeadIntelligenceTypes";

/** Cache de visão por lead, invalidado por assinatura do próprio lead. */
const viewCache = new Map<string, { sig: string; view: LeadIntelligenceView }>();

function signature(lead: Lead, meetings: MeetingRef[]): string {
  const d = lead.autoDiagnosis;
  return [
    lead.id,
    lead.stage,
    lead.stageChangedAt,
    (lead.interactions || []).length,
    (lead.callNotes || []).length,
    (lead.notes || "").length,
    d?.generatedAt ?? "",
    meetings.length,
  ].join("|");
}

/** Visão consolidada de um lead (memoizada por assinatura). */
function buildView(lead: Lead, meetings: MeetingRef[] = []): LeadIntelligenceView {
  const sig = signature(lead, meetings);
  const cached = viewCache.get(lead.id);
  if (cached && cached.sig === sig) return cached.view;

  const view: LeadIntelligenceView = {
    leadId: lead.id,
    temperature: displayTemperature(lead),
    nextAction: displayNextAction(lead),
    summary: executiveSummary(lead),
    badges: leadBadges(lead, meetings),
    trail: commercialTrail(lead, meetings),
    lastInteraction: lastInteractionSnippet(lead),
    diagnosis: lead.autoDiagnosis,
  };
  viewCache.set(lead.id, { sig, view });
  return view;
}

/** Limpa o cache de visão (todos os leads ou apenas um). */
function invalidate(leadId?: string) {
  if (leadId) viewCache.delete(leadId);
  else viewCache.clear();
}

export const LeadIntelligenceRepository = {
  // leitura consolidada
  view: buildView,
  invalidate,

  // leituras pontuais (mesmas fontes da visão)
  temperature: displayTemperature,
  nextAction: displayNextAction,
  executiveSummary,
  badges: leadBadges,
  trail: commercialTrail,
  lastInteraction: lastInteractionSnippet,

  // Next Best Action
  nbaContext: contextFromLead,
  sanitizeNBA,

  // diagnóstico automático (única operação que aciona IA)
  runDiagnosis: async (leadId: string) => {
    const result = await runAutoDiagnosis(leadId);
    invalidate(leadId);
    return result;
  },
  runDiagnosisForLeads: async (leadIds: string[]) => {
    await runAutoDiagnosisForLeads(leadIds);
    for (const id of leadIds) invalidate(id);
  },
};

export type LeadIntelligenceRepositoryType = typeof LeadIntelligenceRepository;
