// Lead Intelligence — tipos do domínio (Projeto Phoenix, Fase 3B).
// Contrato único de leitura de inteligência de UM lead. Reexporta os tipos já
// existentes para evitar divergência de definições entre módulos.

export type {
  ExecutiveSummary,
  LeadBadge,
  TrailItem,
  TrailItemKind,
} from "@/modules/intelligence/services/leadInsights";

export type {
  NextBestAction,
  NBAActionKind,
  NBAUrgency,
  NBAConfidence,
  NBAContext,
} from "@/modules/intelligence/services/nextBestAction";

export type { MemoryRef } from "@/modules/intelligence/components/MemoryReferencesBlock";

export interface LeadTemperature {
  key: "quente" | "morno" | "frio" | "novo";
  label: string;
  emoji: string;
  cls: string;
}

export interface MeetingRef {
  id: string;
  date: string;
  time: string;
  title?: string;
}

/** Visão consolidada de inteligência de um lead (derivada, sem chamada de IA). */
export interface LeadIntelligenceView {
  leadId: string;
  temperature: LeadTemperature;
  nextAction: string;
  summary: import("@/modules/intelligence/services/leadInsights").ExecutiveSummary;
  badges: import("@/modules/intelligence/services/leadInsights").LeadBadge[];
  trail: import("@/modules/intelligence/services/leadInsights").TrailItem[];
  lastInteraction: { source: string; text: string; at: string } | null;
  /** Diagnóstico automático persistido no lead, quando existir. */
  diagnosis: import("@/shared/services/store").AutoDiagnosis | undefined;
}
