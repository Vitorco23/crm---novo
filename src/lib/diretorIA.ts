// ============================================================
// Diretor Comercial IA — orquestração do parecer diário.
// ------------------------------------------------------------
// - Coleta um snapshot agregado da operação (sem dados de lead individual).
// - Executa 1x por dia (por usuário, sincronizado via userStorage).
// - Persiste histórico (últimos 60 dias).
// - Chama a Edge Function `diretor-comercial-ia`.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { uload, usave } from "./userStorage";
import {
  getLeads, getMeetings, getMovementEvents, getSessions,
  getGoalsSettings, getStagesForPipeline,
} from "./store";
import { getTransactions, monthKey } from "./finance";
import { computeDailyGoals, computeDailyTotals } from "./coldCallMetrics";
import {
  runInsightsEngine, getInsights, sortInsights,
  CATEGORY_LABELS, PRIORITY_LABELS,
} from "./insights";
import {
  analyzeBottleneck, resolveBottleneckPeriod, previousPeriod, compareBottlenecks,
} from "./bottleneckEngine";

// ---- Persistência ----
export const LAST_RUN_KEY = "p21_diretor_ia_last_run";
export const HISTORY_KEY = "p21_diretor_ia_history";
const HISTORY_LIMIT = 60;

export interface PainelExecutivo {
  resumoOntem: string[];
  atencao: string[];
  oportunidades: string[];
  prioridades: string[];
  dica: string;
}

export interface MetaHojeProgresso {
  ligacoes: { atual: number; meta: number };
  reunioes: { atual: number; meta: number };
  vendas: { atual: number; meta: number };
}

export interface Parecer {
  id: string;
  date: string;        // YYYY-MM-DD (America/Sao_Paulo)
  generatedAt: string; // ISO
  model: string;
  content?: string;    // markdown (formato legado)
  painel?: PainelExecutivo;   // novo formato executivo
  metaHoje?: MetaHojeProgresso;
}

// ---- Datas em America/Sao_Paulo ----
export function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // YYYY-MM-DD
}

export function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function shouldRunToday(): boolean {
  const last = uload<string | null>(LAST_RUN_KEY, null);
  return last !== todayKey();
}

export function getHistory(): Parecer[] {
  return uload<Parecer[]>(HISTORY_KEY, []);
}

export function getTodayParecer(): Parecer | null {
  const t = todayKey();
  return getHistory().find((p) => p.date === t) ?? null;
}

export function saveParecer(p: Parecer) {
  const all = getHistory();
  // Substitui se já existe do mesmo dia; senão prepend.
  const filtered = all.filter((x) => x.date !== p.date);
  const next = [p, ...filtered].slice(0, HISTORY_LIMIT);
  usave(HISTORY_KEY, next);
  usave(LAST_RUN_KEY, p.date);
}

// ============================================================
// COLETA DE SNAPSHOT (somente agregados)
// ============================================================

function inRangeISO(iso: string | undefined, start: Date, end: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !isNaN(t) && t >= start.getTime() && t <= end.getTime();
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function aggregatePeriod(start: Date, end: Date) {
  const sessions = getSessions().filter((s) => inRangeISO(s.startTime, start, end));
  const meetings = getMeetings().filter((m) =>
    inRangeISO(`${m.date}T${m.time || "00:00"}`, start, end)
  );
  const movements = getMovementEvents().filter((e) => inRangeISO(e.timestamp, start, end));

  const calls = sessions.reduce((a, s) => a + (s.calls || 0), 0);
  const connections = sessions.reduce((a, s) => a + (s.connections || 0), 0);
  const decisionMakers = sessions.reduce((a, s) => a + (s.decisionMakers || 0), 0);
  const sessionMeetings = sessions.reduce((a, s) => a + (s.meetings || 0), 0);
  const productiveMinutes = sessions.reduce((a, s) => a + (s.durationMinutes || 0), 0);
  const wins = movements.filter((m) => /ganho/i.test(m.toStage)).length;
  const held = movements.filter((m) => /reuni[aã]o realizada/i.test(m.toStage)).length;

  return {
    calls, connections, decisionMakers,
    meetingsScheduled: Math.max(meetings.length, sessionMeetings),
    meetingsHeld: held,
    wins,
    productiveMinutes,
    sessions: sessions.length,
  };
}

function topByRate(
  bucket: Map<string, { calls: number; meetings: number; label: string }>,
  minCalls = 10,
): Array<{ label: string; calls: number; meetings: number; rate: number }> {
  const arr = Array.from(bucket.values())
    .filter((b) => b.calls >= minCalls)
    .map((b) => ({ ...b, rate: b.calls > 0 ? (b.meetings / b.calls) * 100 : 0 }))
    .sort((a, b) => b.rate - a.rate);
  return arr.slice(0, 5);
}

export interface DiretorSnapshot {
  today: string;
  yesterday: string;
  timezone: string;
  metas: {
    monthlyRevenueGoal: number;
    averageTicket: number;
    dailyGoals: ReturnType<typeof computeDailyGoals>;
    conversionTargets: {
      callToConnection: number;
      connectionToDecisionMaker: number;
      decisionMakerToMeetingScheduled: number;
      meetingScheduledToHeld: number;
      meetingHeldToClose: number;
    };
  };
  ontem: ReturnType<typeof aggregatePeriod> & { data: string };
  hojeAteAgora: ReturnType<typeof computeDailyTotals>;
  ultimos7: ReturnType<typeof aggregatePeriod>;
  ultimos30: ReturnType<typeof aggregatePeriod>;
  pipeline: {
    coldCall: Record<string, number>;
    oportunidades: Record<string, number>;
    oportunidadesValor: number;
    onboarding: Record<string, number>;
    leadsParados5dias: number;
    leadsParados10dias: number;
  };
  financeiro: {
    mesAtual: string;
    receitaMes: number;
    despesaMes: number;
    lucroMes: number;
    receitaMesAnterior: number;
    contratosFechadosMes: number;
  };
  gargalo: {
    principal: string | null;
    etapa: string | null;
    taxaAtualPct: number | null;
    taxaMetaPct: number | null;
    gapPct: number;
    explicacao: string;
    recomendacoes: string[];
    variacaoVsPeriodoAnterior?: string;
  };
  insights: Array<{
    titulo: string; descricao: string; motivo: string; sugestao: string;
    prioridade: string; categoria: string;
  }>;
  topScripts: Array<{ label: string; calls: number; meetings: number; rate: number }>;
  topNichos: Array<{ label: string; calls: number; meetings: number; rate: number }>;
  topCidades: Array<{ label: string; calls: number; meetings: number; rate: number }>;
  topHorarios: Array<{ hora: string; calls: number; meetings: number; rate: number }>;
}

export function collectSnapshot(): DiretorSnapshot {
  const now = new Date();
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const ontemStart = startOfLocalDay(y);
  const ontemEnd = endOfLocalDay(y);
  const s7 = new Date(now); s7.setDate(s7.getDate() - 6);
  const s30 = new Date(now); s30.setDate(s30.getDate() - 29);

  const goals = getGoalsSettings();

  // Pipeline distribution (contagem por etapa, sem expor leads)
  const leads = getLeads();
  const dist = (pipeline: "cold_call" | "oportunidades" | "onboarding") => {
    const stages = getStagesForPipeline(pipeline);
    const set = new Set(stages);
    const acc: Record<string, number> = {};
    stages.forEach((s) => (acc[s] = 0));
    leads.forEach((l) => {
      if (set.has(l.stage)) acc[l.stage] = (acc[l.stage] || 0) + 1;
    });
    return acc;
  };

  const oppStages = new Set(getStagesForPipeline("oportunidades"));
  const CLOSED = new Set(["Ganho", "Perdido"]);
  const oportunidadesValor = leads
    .filter((l) => oppStages.has(l.stage) && !CLOSED.has(l.stage))
    .reduce((a, l) => a + (l.contractValue || 0), 0);

  const paradosDias = (n: number) => {
    const cutoff = Date.now() - n * 86400000;
    return leads.filter((l) =>
      !CLOSED.has(l.stage) &&
      new Date(l.stageChangedAt).getTime() < cutoff
    ).length;
  };

  // Financeiro do mês
  const tx = getTransactions();
  const mkNow = monthKey(new Date().toISOString().slice(0, 10));
  const dPrev = new Date(); dPrev.setMonth(dPrev.getMonth() - 1);
  const mkPrev = monthKey(dPrev.toISOString().slice(0, 10));
  const sumBy = (k: "revenue" | "expense", mk: string) =>
    tx.filter((t) => t.kind === k && monthKey(t.date) === mk).reduce((a, t) => a + t.amount, 0);
  const receitaMes = sumBy("revenue", mkNow);
  const despesaMes = sumBy("expense", mkNow);
  const receitaMesAnterior = sumBy("revenue", mkPrev);
  const contratosFechadosMes = tx.filter(
    (t) => t.kind === "revenue" && t.source === "auto_onboarding" && monthKey(t.date) === mkNow
  ).length;

  // Gargalo (últimos 30 dias) + comparativo com período anterior
  const period30 = resolveBottleneckPeriod("last30");
  const b = analyzeBottleneck(period30);
  const bPrev = analyzeBottleneck(previousPeriod(period30));
  const cmp = compareBottlenecks(b, bPrev);

  // Insights ativos (roda motor para garantir estado atual)
  try { runInsightsEngine(); } catch { /* noop */ }
  const insightsAtivos = sortInsights(getInsights().filter((i) => i.status === "active"))
    .slice(0, 12)
    .map((i) => ({
      titulo: i.title,
      descricao: i.description,
      motivo: i.reason,
      sugestao: i.suggestion,
      prioridade: PRIORITY_LABELS[i.priority],
      categoria: CATEGORY_LABELS[i.category],
    }));

  // Buckets para ranking (últimos 30 dias)
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const sessions30 = getSessions().filter((s) => inRangeISO(s.startTime, s30, now));
  const meetings30 = getMeetings().filter((m) =>
    inRangeISO(`${m.date}T${m.time || "00:00"}`, s30, now)
  );

  const scriptBucket = new Map<string, { calls: number; meetings: number; label: string }>();
  const ensure = (map: Map<string, any>, key: string, label: string) => {
    if (!map.has(key)) map.set(key, { calls: 0, meetings: 0, label });
    return map.get(key)!;
  };
  sessions30.forEach((s) => {
    const key = (s.scriptUsed || "").trim() || "(sem script)";
    const b = ensure(scriptBucket, key, key);
    b.calls += s.calls || 0;
    b.meetings += s.meetings || 0;
  });

  const nicheBucket = new Map<string, { calls: number; meetings: number; label: string }>();
  const cityBucket = new Map<string, { calls: number; meetings: number; label: string }>();
  sessions30.forEach((s) => {
    if (s.niche) {
      const b = ensure(nicheBucket, s.niche.toUpperCase(), s.niche);
      b.calls += s.calls || 0;
      b.meetings += s.meetings || 0;
    }
  });
  meetings30.forEach((m) => {
    const l = leadById.get(m.leadId);
    if (l?.niche) {
      const b = ensure(nicheBucket, l.niche.toUpperCase(), l.niche);
      b.meetings += 1;
    }
    if (l?.city) {
      const b = ensure(cityBucket, l.city.toUpperCase(), l.city);
      b.meetings += 1;
    }
  });

  const hourBucket = new Map<string, { calls: number; meetings: number; label: string }>();
  sessions30.forEach((s) => {
    const h = new Date(s.startTime).getHours();
    const label = `${String(h).padStart(2, "0")}:00`;
    const b = ensure(hourBucket, label, label);
    b.calls += s.calls || 0;
    b.meetings += s.meetings || 0;
  });

  return {
    today: todayKey(),
    yesterday: yesterdayKey(),
    timezone: "America/Sao_Paulo",
    metas: {
      monthlyRevenueGoal: goals.monthlyRevenueGoal,
      averageTicket: goals.averageTicket,
      dailyGoals: computeDailyGoals(),
      conversionTargets: {
        callToConnection: goals.callToConnection,
        connectionToDecisionMaker: goals.connectionToDecisionMaker,
        decisionMakerToMeetingScheduled: goals.decisionMakerToMeetingScheduled,
        meetingScheduledToHeld: goals.meetingScheduledToHeld,
        meetingHeldToClose: goals.meetingHeldToClose,
      },
    },
    ontem: { ...aggregatePeriod(ontemStart, ontemEnd), data: yesterdayKey() },
    hojeAteAgora: computeDailyTotals(),
    ultimos7: aggregatePeriod(startOfLocalDay(s7), endOfLocalDay(now)),
    ultimos30: aggregatePeriod(startOfLocalDay(s30), endOfLocalDay(now)),
    pipeline: {
      coldCall: dist("cold_call"),
      oportunidades: dist("oportunidades"),
      oportunidadesValor,
      onboarding: dist("onboarding"),
      leadsParados5dias: paradosDias(5),
      leadsParados10dias: paradosDias(10),
    },
    financeiro: {
      mesAtual: mkNow,
      receitaMes,
      despesaMes,
      lucroMes: receitaMes - despesaMes,
      receitaMesAnterior,
      contratosFechadosMes,
    },
    gargalo: {
      principal: b.hasEnoughData ? b.main.label : null,
      etapa: b.hasEnoughData ? `${b.main.from} → ${b.main.to}` : null,
      taxaAtualPct: b.hasEnoughData ? b.main.actualPct : null,
      taxaMetaPct: b.hasEnoughData ? b.main.targetPct : null,
      gapPct: b.hasEnoughData ? b.main.gapPct : 0,
      explicacao: b.explanation,
      recomendacoes: b.recommendations.slice(0, 5),
      variacaoVsPeriodoAnterior: cmp ?? undefined,
    },
    insights: insightsAtivos,
    topScripts: topByRate(scriptBucket),
    topNichos: topByRate(nicheBucket, 5),
    topCidades: topByRate(cityBucket, 5),
    topHorarios: topByRate(hourBucket, 5).map((r) => ({
      hora: r.label, calls: r.calls, meetings: r.meetings, rate: r.rate,
    })),
  };
}

// ============================================================
// GERAÇÃO
// ============================================================

export async function generateParecer(): Promise<Parecer> {
  const snapshot = collectSnapshot();
  const { data, error } = await supabase.functions.invoke("diretor-comercial-ia", {
    body: { snapshot },
  });

  if (error) {
    let details = error.message;
    try {
      // @ts-ignore
      if (error.context?.text) details = await error.context.text();
    } catch { /* noop */ }
    throw new Error(details || "Falha ao gerar parecer");
  }

  const painel = (data as any)?.painel as PainelExecutivo | undefined;
  const model = (data as any)?.model || "openai/gpt-5.4-nano";
  if (!painel || typeof painel !== "object") {
    throw new Error("Resposta inválida da IA");
  }

  const dg = snapshot.metas.dailyGoals as any;
  const hoje = snapshot.hojeAteAgora as any;
  const metaHoje: MetaHojeProgresso = {
    ligacoes: { atual: Number(hoje?.calls ?? 0), meta: Number(dg?.calls ?? 0) },
    reunioes: { atual: Number(hoje?.meetings ?? 0), meta: Number(dg?.meetings ?? 0) },
    vendas:   { atual: Number(hoje?.wins ?? hoje?.sales ?? 0), meta: Number(dg?.wins ?? dg?.sales ?? 1) },
  };

  const parecer: Parecer = {
    id: crypto.randomUUID(),
    date: snapshot.today,
    generatedAt: new Date().toISOString(),
    model,
    painel,
    metaHoje,
  };
  saveParecer(parecer);
  try { window.dispatchEvent(new Event("p21:diretor-ia-updated")); } catch { /* noop */ }
  return parecer;
}
