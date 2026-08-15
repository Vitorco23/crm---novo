// ===== Fechamento diário de métricas (ETAPA 2) =====
// Consome exclusivamente dados já existentes:
//  • métricas automáticas -> summarizeActivity() (ledger já reconciliado)
//  • pomodoros/foco       -> p21_sessions (store existente)
//  • reuniões             -> p21_meetings (store existente)
// Persistência: userStorage namespaced (chave p21_daily_metrics_reports).
// Nenhuma migration, nenhuma tabela nova, nenhuma chamada de IA automática.

import { uload, usave } from "@/shared/services/userStorage";
import { summarizeActivity, getActivityLedger } from "@/shared/services/activityLedger";
import { getSessions, getMeetings } from "@/shared/services/store";

export const DAILY_METRICS_KEY = "p21_daily_metrics_reports";

/** Snapshot auditável das métricas automáticas no momento do fechamento. */
export interface AutoMetricsSnapshot {
  date: string; // YYYY-MM-DD
  capturedAt: string; // ISO
  pomodoros: number;
  focusMinutes: number;
  callsConfirmed: number;
  callsEstimated: number;
  messagesConfirmed: number;
  messagesEstimated: number;
  followupsEstimated: number;
  totalConfirmed: number;
  totalEstimated: number;
  meetings: number;
  /** Última ligação canônica CallFace/Matteline registrada (ISO) ou null. */
  lastCallfaceAt: string | null;
}

export interface ManualInputs {
  externalMessages: number;
  externalFollowups: number;
  externalMeetings: number;
  dayNote: string;
}

export interface ResultInputs {
  decisionMakerConnections: number;
  meetingsScheduled: number;
  proposals: number;
  sales: number;
  revenue: number;
}

export interface QualitativeInputs {
  mainObjection: string;
  bottleneck: string;
  learning: string;
}

export interface AiAnalysis {
  text: string;
  generatedAt: string;
  model?: string;
}

export interface DailyMetricsReport {
  date: string; // YYYY-MM-DD — identidade única por usuário+data
  updatedAt: string;
  auto: AutoMetricsSnapshot;
  manual: ManualInputs;
  results: ResultInputs;
  qualitative: QualitativeInputs;
  ai?: AiAnalysis | null;
}

export const emptyManual = (): ManualInputs => ({
  externalMessages: 0,
  externalFollowups: 0,
  externalMeetings: 0,
  dayNote: "",
});

export const emptyResults = (): ResultInputs => ({
  decisionMakerConnections: 0,
  meetingsScheduled: 0,
  proposals: 0,
  sales: 0,
  revenue: 0,
});

export const emptyQualitative = (): QualitativeInputs => ({
  mainObjection: "",
  bottleneck: "",
  learning: "",
});

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dayRange(dateKey: string): { from: Date; to: Date } {
  const [y, m, d] = dateKey.split("-").map(Number);
  const from = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  const to = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
  return { from, to };
}

/** Métricas automáticas do dia — sempre derivadas das fontes existentes. */
export function buildAutoMetrics(dateKey: string): AutoMetricsSnapshot {
  const { from, to } = dayRange(dateKey);
  const s = summarizeActivity(from, to);

  const inDay = (iso?: string) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return !isNaN(t) && t >= from.getTime() && t <= to.getTime();
  };

  const sessions = getSessions().filter((x) => inDay(x.endTime || x.startTime));
  const focusMinutes = sessions.reduce((acc, x) => acc + (x.durationMinutes || 0), 0);

  const meetings = getMeetings().filter((m) => m.date === dateKey).length;

  const lastCallface = getActivityLedger()
    .filter((e) => e.source === "callface" && inDay(e.at))
    .map((e) => e.at)
    .sort()
    .pop();

  return {
    date: dateKey,
    capturedAt: new Date().toISOString(),
    pomodoros: sessions.length,
    focusMinutes,
    callsConfirmed: s.confirmedByChannel.call,
    callsEstimated: s.estimatedByChannel.call,
    messagesConfirmed: s.confirmedByChannel.message,
    messagesEstimated: s.estimatedByChannel.message,
    followupsEstimated: s.estimatedByChannel.followup + s.confirmedByChannel.followup,
    totalConfirmed: s.totalConfirmed,
    totalEstimated: s.totalEstimated,
    meetings,
    lastCallfaceAt: lastCallface ?? null,
  };
}

// ===== Persistência =====

export function listReports(): DailyMetricsReport[] {
  const all = uload<DailyMetricsReport[]>(DAILY_METRICS_KEY, []);
  return Array.isArray(all) ? [...all].sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
}

export function getReport(dateKey: string): DailyMetricsReport | null {
  return listReports().find((r) => r.date === dateKey) ?? null;
}

/** Salva/edita um único relatório por data (upsert, nunca duplica). */
export function saveReport(report: DailyMetricsReport): DailyMetricsReport {
  const all = uload<DailyMetricsReport[]>(DAILY_METRICS_KEY, []);
  const list = Array.isArray(all) ? all : [];
  const next: DailyMetricsReport = { ...report, updatedAt: new Date().toISOString() };
  const idx = list.findIndex((r) => r.date === report.date);
  if (idx >= 0) list[idx] = { ...list[idx], ...next };
  else list.push(next);
  usave(DAILY_METRICS_KEY, list);
  return next;
}

// ===== Diagnóstico determinístico (zero IA) =====

export interface Rates {
  connectionRate: number | null; // conexões com decisor / ligações confirmadas
  meetingRate: number | null; // reuniões marcadas / conexões
  proposalRate: number | null; // propostas / reuniões marcadas
  saleRate: number | null; // vendas / propostas
}

export function computeRates(r: DailyMetricsReport): Rates {
  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
  return {
    connectionRate: pct(r.results.decisionMakerConnections, r.auto.callsConfirmed),
    meetingRate: pct(r.results.meetingsScheduled, r.results.decisionMakerConnections),
    proposalRate: pct(r.results.proposals, r.results.meetingsScheduled),
    saleRate: pct(r.results.sales, r.results.proposals),
  };
}

export interface RuleDiagnosis {
  summary: string;
  rates: Rates;
  warnings: string[];
  bottleneck: string;
  recommendations: string[];
  suggestedGoals: string[];
}

export function buildRuleDiagnosis(
  report: DailyMetricsReport,
  history: DailyMetricsReport[] = []
): RuleDiagnosis {
  const a = report.auto;
  const res = report.results;
  const rates = computeRates(report);
  const warnings: string[] = [];

  const summary =
    `${a.callsConfirmed} ligação(ões) confirmada(s) via Matteline/CallFace, ` +
    `${a.callsEstimated} estimada(s) por registro no CRM. ` +
    `${a.messagesConfirmed} mensagem(ns) confirmada(s) e ${a.messagesEstimated} ação(ões) de mensagem estimada(s). ` +
    `${a.meetings} reunião(ões) na agenda, ${a.pomodoros} pomodoro(s) e ${a.focusMinutes} min de foco.`;

  if (a.callsConfirmed === 0) {
    warnings.push("Sem ligações confirmadas pela Matteline/CallFace neste dia: as taxas de conexão não têm base confiável.");
  }
  if (a.callsEstimated > a.callsConfirmed && a.callsEstimated > 0) {
    warnings.push("Volume estimado maior que o confirmado — parte da operação não passou pelo discador.");
  }
  if (res.decisionMakerConnections === 0) warnings.push("Sem conexões com decisor registradas: taxa de reunião sem denominador.");
  if (res.meetingsScheduled === 0) warnings.push("Sem reuniões marcadas: taxa de proposta sem denominador.");
  if (res.proposals === 0) warnings.push("Sem propostas: taxa de venda sem denominador.");

  // Gargalo: primeira etapa do funil com denominador válido e taxa mais baixa.
  let bottleneck = "Dados insuficientes para apontar gargalo com segurança.";
  const steps: { label: string; rate: number | null }[] = [
    { label: "contato com decisor (volume/qualificação da lista)", rate: rates.connectionRate },
    { label: "agendamento de reunião (abordagem e oferta)", rate: rates.meetingRate },
    { label: "envio de proposta (condução da reunião)", rate: rates.proposalRate },
    { label: "fechamento (negociação)", rate: rates.saleRate },
  ];
  const valid = steps.filter((s) => s.rate !== null) as { label: string; rate: number }[];
  if (valid.length > 0) {
    const worst = valid.reduce((m, s) => (s.rate < m.rate ? s : m), valid[0]);
    bottleneck = `Etapa com menor conversão hoje: ${worst.label} (${worst.rate}%). Observação estatística do dia, não causa comprovada.`;
  }

  const recommendations: string[] = [];
  if (a.callsConfirmed < 40) recommendations.push("Aumentar volume: priorizar blocos de discagem contínua no primeiro período do dia.");
  if (rates.connectionRate !== null && rates.connectionRate < 20) recommendations.push("Revisar horário de discagem e qualidade da lista para elevar contato com decisor.");
  if (rates.meetingRate !== null && rates.meetingRate < 20) recommendations.push("Testar variação de abertura e proposta de valor na conexão com decisor.");
  if (rates.proposalRate !== null && rates.proposalRate < 50) recommendations.push("Fechar a reunião com próximo passo definido e envio de proposta no mesmo dia.");
  if (report.qualitative.mainObjection) recommendations.push(`Preparar resposta objetiva para a objeção recorrente: "${report.qualitative.mainObjection}".`);
  if (a.pomodoros < 4) recommendations.push("Garantir ao menos 4 blocos de foco amanhã para sustentar o volume.");
  while (recommendations.length < 3) {
    recommendations.push("Registrar o resultado de cada tentativa no CRM para manter a base de decisão confiável.");
  }

  const recent = history.filter((h) => h.date !== report.date).slice(0, 7);
  const suggestedGoals: string[] = [];
  if (recent.length === 0) {
    suggestedGoals.push("Histórico insuficiente para metas baseadas em série: use o dia de hoje como linha de base.");
  } else {
    const avg = (nums: number[]) => Math.round(nums.reduce((x, y) => x + y, 0) / nums.length);
    const avgCalls = avg(recent.map((h) => h.auto.callsConfirmed));
    const avgMeetings = avg(recent.map((h) => h.results.meetingsScheduled));
    suggestedGoals.push(`Ligações confirmadas: ${Math.max(avgCalls + Math.ceil(avgCalls * 0.1), avgCalls + 1)} (média recente ${avgCalls}).`);
    suggestedGoals.push(`Reuniões marcadas: ${Math.max(avgMeetings + 1, 1)} (média recente ${avgMeetings}).`);
    suggestedGoals.push("Metas são referências de esforço com base no histórico, não promessa de resultado.");
  }

  return { summary, rates, warnings, bottleneck, recommendations, suggestedGoals };
}

// ===== Payload mínimo para IA opcional =====
// NUNCA inclui leads, nomes, telefones, interações, transcrições, áudios ou dashboard.

export interface AiPayload {
  date: string;
  metrics: Omit<AutoMetricsSnapshot, "date" | "capturedAt" | "lastCallfaceAt">;
  results: ResultInputs;
  manual: ManualInputs;
  qualitative: QualitativeInputs;
  rates: Rates;
  history7: { days: number; avgCallsConfirmed: number; avgMeetingsScheduled: number; avgSales: number };
}

export function buildAiPayload(report: DailyMetricsReport, history: DailyMetricsReport[] = []): AiPayload {
  const recent = history.filter((h) => h.date !== report.date).slice(0, 7);
  const avg = (nums: number[]) => (nums.length ? Math.round((nums.reduce((x, y) => x + y, 0) / nums.length) * 10) / 10 : 0);
  const { date: _d, capturedAt: _c, lastCallfaceAt: _l, ...metrics } = report.auto;
  return {
    date: report.date,
    metrics,
    results: report.results,
    manual: report.manual,
    qualitative: report.qualitative,
    rates: computeRates(report),
    history7: {
      days: recent.length,
      avgCallsConfirmed: avg(recent.map((h) => h.auto.callsConfirmed)),
      avgMeetingsScheduled: avg(recent.map((h) => h.results.meetingsScheduled)),
      avgSales: avg(recent.map((h) => h.results.sales)),
    },
  };
}
