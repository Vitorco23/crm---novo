// Laboratório Comercial — tipos compartilhados
// Isolado de UI (Constituição Técnica §1, §19).

export type LabPeriodPreset =
  | "today" | "last7" | "last30" | "last90"
  | "thisMonth" | "lastMonth" | "custom";

export interface LabDateRange { start: Date; end: Date }

export interface LabFilters {
  period: LabPeriodPreset;
  customStart?: string; // ISO date
  customEnd?: string;
  niche: string;        // "all" | canonical key
  campaign: string;     // "all" | "NICHO||CIDADE"
  city: string;         // "all" | canonical key
  script: string;       // "all" | script name
  responsible: string;  // "all" | user name (reservado para futuro multiusuário)
}

export type Confidence = "very-high" | "high" | "medium" | "low";

export interface LabMetrics {
  calls: number;
  connections: number;
  decisionMakers: number;
  meetings: number;
  sales: number;
  revenue: number;
  avgTicket: number;
  connectionRate: number;   // conn/calls
  decisionRate: number;     // dm/conn
  meetingRate: number;      // meet/dm (ou meet/calls fallback)
  conversion: number;       // sales/calls
  avgTimeToMeetingDays: number;
  avgTimeToSaleDays: number;
  avgProductiveMinutes: number; // pomodoro
}

export interface RankingRow<K extends string = string> {
  key: string;                // canonical
  label: string;              // display
  metrics: LabMetrics;
  confidence: Confidence;
  score: number;              // ranking score
  dimension: K;
}

export type LabDimension =
  | "script" | "campaign" | "city" | "niche" | "hour" | "responsible";

export interface LabRecommendation {
  id: string;
  dimension: LabDimension;
  severity: "positive" | "attention" | "critical";
  title: string;
  rationale: string;          // baseado em dados reais
  metricSummary?: string;
}

// ===== Experimentos persistidos =====

export type ExperimentStatus = "in-progress" | "completed" | "paused" | "archived";

export interface Experiment {
  id: string;
  name: string;
  objective: string;
  dimension: LabDimension;
  hypothesis?: string;
  status: ExperimentStatus;
  startDate: string;          // ISO
  endDate?: string;
  owner?: string;
  variants: string[];         // ex.: ["Script A", "Script B"]
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // Snapshot congelado ao concluir (para histórico não voltar a mudar)
  snapshot?: {
    ranking: RankingRow[];
    confidence: Confidence;
    winner?: { key: string; label: string };
    recommendation?: string;
    generatedAt: string;
  };
}
