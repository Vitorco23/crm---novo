// ===== Fechamento diário de métricas (Sprint 1 — reestruturação) =====
// 100% manual: nenhuma métrica automática, nenhum acesso ao activityLedger,
// à Matteline/CallFace, ao Pipeline ou ao Pomodoro.
// Persistência: userStorage namespaced (chave p21_daily_metrics_reports).

import { uload, usave } from "@/shared/services/userStorage";

export const DAILY_METRICS_KEY = "p21_daily_metrics_reports";
export const DAILY_METRICS_VERSION = 2;

/** Campo numérico opcional: vazio permanece vazio (null), nunca vira 0. */
export type NumField = number | null;

export interface GeneralInputs {
  niche: string;
  region: string;
  meetingsGoal: NumField;
  hours: NumField;
  minutes: NumField;
}

export interface CallsChannel {
  calls: NumField;
  connections: NumField;
  decisionMakers: NumField;
  r1: NumField;
}

export interface BlastsChannel {
  sent: NumField;
  opened: NumField;
  decisionMakers: NumField;
  meetings: NumField;
}

export interface FollowupsChannel {
  sent: NumField;
  decisionMakers: NumField;
  meetings: NumField;
}

/** R1 NÃO é persistido aqui: vem sempre de calls.r1 (fonte única). */
export interface OutcomeInputs {
  sales: NumField;
  revenue: NumField;
}

export interface ContextInputs {
  bestHour: string;
  difficulty: string;
  difficultyNote: string;
  objection: string;
  learning: string;
  goalHit: boolean | null;
}

/** Sprint 2 — resposta estruturada e validada da IA (nunca markdown livre). */
export interface AiStrength { title: string; evidence: string }
export interface AiBottleneck { stage: string; evidence: string; interpretation: string }
export interface AiNextAction { title: string; reason: string; suggestedTime?: string }

export interface AiStructured {
  executiveSummary: string;
  strengths: AiStrength[];
  bottlenecks: AiBottleneck[];
  nextActions: AiNextAction[];
  attentionPoint: string;
}

export interface AiAnalysis {
  /** Formato legado (texto livre) — mantido apenas para relatórios antigos. */
  text?: string;
  /** Formato Sprint 2 — módulos renderizados separadamente. */
  data?: AiStructured;
  generatedAt: string;
  model?: string;
}


export interface DailyMetricsReport {
  date: string; // YYYY-MM-DD — identidade única por usuário+data
  updatedAt: string;
  version: number;
  general: GeneralInputs;
  calls: CallsChannel;
  blasts: BlastsChannel;
  followups: FollowupsChannel;
  outcome: OutcomeInputs;
  context: ContextInputs;
  ai?: AiAnalysis | null;
}

export const DIFFICULTY_OPTIONS = [
  "Encontrar o decisor",
  "Gerar conexão",
  "Converter conexão em decisor",
  "Agendar R1",
  "Comparecimento na R1",
  "Enviar proposta",
  "Fechar venda",
  "Outro",
] as const;

export const emptyGeneral = (): GeneralInputs => ({
  niche: "",
  region: "",
  meetingsGoal: null,
  hours: null,
  minutes: null,
});
export const emptyCalls = (): CallsChannel => ({ calls: null, connections: null, decisionMakers: null, r1: null });
export const emptyBlasts = (): BlastsChannel => ({ sent: null, opened: null, decisionMakers: null, meetings: null });
export const emptyFollowups = (): FollowupsChannel => ({ sent: null, decisionMakers: null, meetings: null });
export const emptyOutcome = (): OutcomeInputs => ({ sales: null, revenue: null });
export const emptyContext = (): ContextInputs => ({
  bestHour: "",
  difficulty: "",
  difficultyNote: "",
  objection: "",
  learning: "",
  goalHit: null,
});

export function emptyReport(date: string): DailyMetricsReport {
  return {
    date,
    updatedAt: new Date().toISOString(),
    version: DAILY_METRICS_VERSION,
    general: emptyGeneral(),
    calls: emptyCalls(),
    blasts: emptyBlasts(),
    followups: emptyFollowups(),
    outcome: emptyOutcome(),
    context: emptyContext(),
    ai: null,
  };
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ===== Migração local de formato (v1 -> v2) =====
// Preserva o histórico existente sempre que compatível. Campos sem equivalente
// direto (métricas automáticas) são descartados: a página é agora 100% manual.

type LegacyReport = {
  date?: string;
  updatedAt?: string;
  results?: { decisionMakerConnections?: number; meetingsScheduled?: number; sales?: number; revenue?: number };
  qualitative?: { mainObjection?: string; bottleneck?: string; learning?: string };
  ai?: AiAnalysis | null;
};

const num = (v: unknown): NumField =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function migrateReport(raw: unknown): DailyMetricsReport | null {
  const r = raw as Partial<DailyMetricsReport> & LegacyReport;
  if (!r || typeof r.date !== "string") return null;
  if (typeof r.version === "number" && r.version >= 2) {
    const base = emptyReport(r.date);
    return {
      ...base,
      ...r,
      general: { ...base.general, ...(r.general || {}) },
      calls: { ...base.calls, ...(r.calls || {}) },
      blasts: { ...base.blasts, ...(r.blasts || {}) },
      followups: { ...base.followups, ...(r.followups || {}) },
      outcome: { ...base.outcome, ...(r.outcome || {}) },
      context: { ...base.context, ...(r.context || {}) },
      updatedAt: r.updatedAt || base.updatedAt,
      version: DAILY_METRICS_VERSION,
    };
  }
  const out = emptyReport(r.date);
  out.updatedAt = r.updatedAt || out.updatedAt;
  out.calls.decisionMakers = num(r.results?.decisionMakerConnections);
  out.blasts.meetings = num(r.results?.meetingsScheduled);
  out.outcome.sales = num(r.results?.sales);
  out.outcome.revenue = num(r.results?.revenue);
  out.context.objection = r.qualitative?.mainObjection || "";
  out.context.difficultyNote = r.qualitative?.bottleneck || "";
  out.context.learning = r.qualitative?.learning || "";
  out.ai = r.ai ?? null;
  return out;
}

// ===== Persistência =====

export function listReports(): DailyMetricsReport[] {
  const all = uload<unknown[]>(DAILY_METRICS_KEY, []);
  if (!Array.isArray(all)) return [];
  return all
    .map(migrateReport)
    .filter((r): r is DailyMetricsReport => r !== null)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getReport(dateKey: string): DailyMetricsReport | null {
  return listReports().find((r) => r.date === dateKey) ?? null;
}

/** Upsert: um único fechamento por usuário e data. Nunca duplica nem apaga. */
export function saveReport(report: DailyMetricsReport): DailyMetricsReport {
  const list = listReports();
  const next: DailyMetricsReport = {
    ...report,
    version: DAILY_METRICS_VERSION,
    updatedAt: new Date().toISOString(),
  };
  const idx = list.findIndex((r) => r.date === report.date);
  if (idx >= 0) list[idx] = { ...list[idx], ...next };
  else list.push(next);
  usave(DAILY_METRICS_KEY, list);
  return next;
}

// ===== Cálculos (somente com denominador válido) =====

/** null quando numerador ou denominador não foram informados / denominador = 0. */
export function rate(numerator: NumField, denominator: NumField): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export const fmtRate = (v: number | null): string => (v === null ? "—" : `${v}%`);

export interface CallsRates { connection: number | null; decisionMaker: number | null; r1: number | null }
export interface BlastsRates { open: number | null; decisionMaker: number | null; meeting: number | null }
export interface FollowupsRates { decisionMaker: number | null; meeting: number | null }

export const callsRates = (c: CallsChannel): CallsRates => ({
  connection: rate(c.connections, c.calls),
  decisionMaker: rate(c.decisionMakers, c.connections),
  r1: rate(c.r1, c.decisionMakers),
});

export const blastsRates = (b: BlastsChannel): BlastsRates => ({
  open: rate(b.opened, b.sent),
  decisionMaker: rate(b.decisionMakers, b.opened),
  meeting: rate(b.meetings, b.decisionMakers),
});

export const followupsRates = (f: FollowupsChannel): FollowupsRates => ({
  decisionMaker: rate(f.decisionMakers, f.sent),
  meeting: rate(f.meetings, f.decisionMakers),
});

const has = (...vals: NumField[]) => vals.some((v) => v !== null && v > 0);

/** Minutos totais prospectando (null quando nada informado). */
export function totalMinutes(g: GeneralInputs): number | null {
  if (g.hours === null && g.minutes === null) return null;
  return (g.hours ?? 0) * 60 + (g.minutes ?? 0);
}

export interface InstantSummary {
  meetingsScheduled: number;
  meetingsGoal: NumField;
  meetingsPerHour: number | null;
  minutes: number | null;
  channels: string[];
  goalHit: boolean | null;
}

/** Resumo instantâneo — apenas dados manuais informados. */
export function buildInstantSummary(r: DailyMetricsReport): InstantSummary {
  const meetings = (r.blasts.meetings ?? 0) + (r.followups.meetings ?? 0) + (r.calls.r1 ?? 0);
  const minutes = totalMinutes(r.general);
  const channels: string[] = [];
  if (has(r.calls.calls, r.calls.connections, r.calls.decisionMakers, r.calls.r1)) channels.push("Ligações");
  if (has(r.blasts.sent, r.blasts.opened, r.blasts.decisionMakers, r.blasts.meetings)) channels.push("Disparos");
  if (has(r.followups.sent, r.followups.decisionMakers, r.followups.meetings)) channels.push("Follow-ups");
  return {
    meetingsScheduled: meetings,
    meetingsGoal: r.general.meetingsGoal,
    meetingsPerHour: minutes && minutes > 0 ? Math.round((meetings / (minutes / 60)) * 10) / 10 : null,
    minutes,
    channels,
    goalHit: r.context.goalHit,
  };
}

/** Filtro de histórico. */
export function filterHistory(reports: DailyMetricsReport[], scope: "week" | "month", ref = new Date()): DailyMetricsReport[] {
  const start = new Date(ref);
  if (scope === "week") {
    const dow = (start.getDay() + 6) % 7; // segunda como início
    start.setDate(start.getDate() - dow);
  } else {
    start.setDate(1);
  }
  const key = toDateKey(start);
  return reports.filter((r) => r.date >= key);
}

// ===== Payload mínimo para IA opcional (somente sob clique) =====

/** Resumo agregado dos últimos 7 fechamentos (somente números, sem identificação). */
export interface AiHistorySummary {
  fechamentos: number;
  calls: number;
  connections: number;
  decisionMakers: number;
  r1: number;
  meetings: number;
  minutes: number;
}

export interface AiPayload {
  date: string;
  general: Omit<GeneralInputs, "niche" | "region"> & { niche: string; region: string };
  calls: CallsChannel;
  blasts: BlastsChannel;
  followups: FollowupsChannel;
  outcome: OutcomeInputs & { r1: NumField };
  context: ContextInputs;
  rates: { calls: CallsRates; blasts: BlastsRates; followups: FollowupsRates };
  last7: AiHistorySummary;
}

export function summarizeLast7(reports: DailyMetricsReport[], beforeOrOn: string): AiHistorySummary {
  const slice = reports.filter((r) => r.date <= beforeOrOn).slice(0, 7);
  const sum = (f: (r: DailyMetricsReport) => number) => slice.reduce((a, r) => a + f(r), 0);
  return {
    fechamentos: slice.length,
    calls: sum((r) => r.calls.calls ?? 0),
    connections: sum((r) => r.calls.connections ?? 0),
    decisionMakers: sum((r) => (r.calls.decisionMakers ?? 0) + (r.blasts.decisionMakers ?? 0) + (r.followups.decisionMakers ?? 0)),
    r1: sum((r) => r.calls.r1 ?? 0),
    meetings: sum((r) => (r.blasts.meetings ?? 0) + (r.followups.meetings ?? 0) + (r.calls.r1 ?? 0)),
    minutes: sum((r) => totalMinutes(r.general) ?? 0),
  };
}

export function buildAiPayload(report: DailyMetricsReport, history: DailyMetricsReport[] = []): AiPayload {
  return {
    date: report.date,
    general: report.general,
    calls: report.calls,
    blasts: report.blasts,
    followups: report.followups,
    outcome: { ...report.outcome, r1: report.calls.r1 },
    context: report.context,
    rates: {
      calls: callsRates(report.calls),
      blasts: blastsRates(report.blasts),
      followups: followupsRates(report.followups),
    },
    last7: summarizeLast7(history, report.date),
  };

}
