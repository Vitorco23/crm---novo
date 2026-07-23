// Laboratório Comercial — Motor de comparação e rankings.
// Agrega dataset por dimensão, calcula métricas, confiança e ranking.
// Constituição §7 (cálculo em engine), §15 (arquitetura: comparação/ranking).

import type { Lead, MovementEvent, Meeting, PomodoroSession } from "@/lib/store";
import type { FinanceTransaction } from "@/lib/finance";
import type { CallLog } from "@/lib/scripts";
import type { LabDataset } from "./collector";
import { resolveSegments, parseNicheField, norm } from "./collector";
import type { Confidence, LabDimension, LabMetrics, RankingRow } from "./types";

// ---------- confiança ----------
// Baseada em volume de ligações do grupo (proxy estatístico simples).
const CONF_THRESHOLDS = { medium: 30, high: 100, veryHigh: 300 };
export function computeConfidence(calls: number): Confidence {
  if (calls >= CONF_THRESHOLDS.veryHigh) return "very-high";
  if (calls >= CONF_THRESHOLDS.high) return "high";
  if (calls >= CONF_THRESHOLDS.medium) return "medium";
  return "low";
}
export const CONFIDENCE_META: Record<Confidence, { dot: string; label: string; color: string }> = {
  "very-high": { dot: "🟢", label: "Muito alta", color: "text-emerald-500" },
  "high":      { dot: "🟢", label: "Alta",       color: "text-emerald-500" },
  "medium":    { dot: "🟡", label: "Média",      color: "text-amber-500" },
  "low":       { dot: "🔴", label: "Baixa",      color: "text-rose-500" },
};

// ---------- helpers ----------
const dayMs = 24 * 60 * 60 * 1000;
const empty = (): LabMetrics => ({
  calls: 0, connections: 0, decisionMakers: 0, meetings: 0, sales: 0,
  revenue: 0, avgTicket: 0, connectionRate: 0, decisionRate: 0,
  meetingRate: 0, conversion: 0, avgTimeToMeetingDays: 0,
  avgTimeToSaleDays: 0, avgProductiveMinutes: 0,
});

function finalizeRates(m: LabMetrics): LabMetrics {
  m.connectionRate = m.calls ? m.connections / m.calls : 0;
  m.decisionRate = m.connections ? m.decisionMakers / m.connections : 0;
  m.meetingRate = m.decisionMakers ? m.meetings / m.decisionMakers
                    : m.calls ? m.meetings / m.calls : 0;
  m.conversion = m.calls ? m.sales / m.calls : 0;
  m.avgTicket = m.sales ? m.revenue / m.sales : 0;
  return m;
}

// score composto (0-100) — pesos: conversão, receita, meetingRate, ticket
function scoreOf(m: LabMetrics, maxRevenue: number, maxTicket: number): number {
  const conv = Math.min(m.conversion * 10, 1);       // 10% já é excelente
  const rev = maxRevenue ? m.revenue / maxRevenue : 0;
  const mr = Math.min(m.meetingRate, 1);
  const tk = maxTicket ? m.avgTicket / maxTicket : 0;
  return Math.round((conv * 40 + rev * 30 + mr * 20 + tk * 10) * 100) / 100;
}

// ---------- núcleo: agregação por chave ----------
interface Bucket {
  key: string; label: string;
  leads: Lead[];
  events: MovementEvent[];
  meetings: Meeting[];
  sessions: PomodoroSession[];
  callLogs: CallLog[];
  transactions: FinanceTransaction[];
}

function bucketMetrics(b: Bucket): LabMetrics {
  const m = empty();

  // Sessões (Pomodoro) — trazem calls/connections/dm/meetings agregados
  for (const s of b.sessions) {
    m.calls += s.calls || 0;
    m.connections += s.connections || 0;
    m.decisionMakers += s.decisionMakers || 0;
    m.meetings += s.meetings || 0;
    m.avgProductiveMinutes += s.durationMinutes || 0;
  }
  if (b.sessions.length) m.avgProductiveMinutes = m.avgProductiveMinutes / b.sessions.length;

  // CallLogs também contam como ligações
  m.calls += b.callLogs.length;

  // Reuniões efetivas (fonte primária) — sobrescreve se houver
  if (b.meetings.length) m.meetings = Math.max(m.meetings, b.meetings.length);

  // Vendas: leads em "Ganho"
  const sales = b.leads.filter((l) => l.stage?.toLowerCase() === "ganho"
    || l.stage?.toLowerCase().includes("implementação"));
  m.sales = sales.length;
  m.revenue = sales.reduce((acc, l) => acc + (l.contractValue || 0), 0);

  // Receita adicional de transações (venda de serviços recorrentes)
  m.revenue += b.transactions
    .filter((t) => t.kind === "revenue")
    .reduce((acc, t) => acc + (t.amount || 0), 0);

  // Tempo até reunião / venda — usando movementEvents
  const eventsByLead = new Map<string, MovementEvent[]>();
  for (const e of b.events) {
    const arr = eventsByLead.get(e.leadId) || [];
    arr.push(e); eventsByLead.set(e.leadId, arr);
  }
  const timesToMeet: number[] = [];
  const timesToSale: number[] = [];
  for (const l of b.leads) {
    const evs = (eventsByLead.get(l.id) || []).sort(
      (a, b2) => new Date(a.timestamp).getTime() - new Date(b2.timestamp).getTime()
    );
    const created = new Date(l.createdAt).getTime();
    const firstMeet = evs.find((e) => e.type === "meeting");
    if (firstMeet) timesToMeet.push((new Date(firstMeet.timestamp).getTime() - created) / dayMs);
    if (l.stage?.toLowerCase() === "ganho") {
      const won = evs.find((e) => e.toStage?.toLowerCase() === "ganho");
      const ref = won ? new Date(won.timestamp).getTime() : new Date(l.stageChangedAt).getTime();
      timesToSale.push((ref - created) / dayMs);
    }
  }
  m.avgTimeToMeetingDays = timesToMeet.length
    ? timesToMeet.reduce((a, b3) => a + b3, 0) / timesToMeet.length : 0;
  m.avgTimeToSaleDays = timesToSale.length
    ? timesToSale.reduce((a, b3) => a + b3, 0) / timesToSale.length : 0;

  return finalizeRates(m);
}

function rank(buckets: Bucket[], dimension: LabDimension): RankingRow[] {
  const rows = buckets.map((b) => {
    const metrics = bucketMetrics(b);
    return {
      key: b.key, label: b.label, metrics, dimension,
      confidence: computeConfidence(metrics.calls),
      score: 0,
    } as RankingRow;
  });
  const maxRevenue = Math.max(1, ...rows.map((r) => r.metrics.revenue));
  const maxTicket = Math.max(1, ...rows.map((r) => r.metrics.avgTicket));
  for (const r of rows) r.score = scoreOf(r.metrics, maxRevenue, maxTicket);
  return rows.sort((a, b) => b.score - a.score);
}

// ---------- agrupadores por dimensão ----------
function groupBy<T>(items: T[], keyFn: (i: T) => { key: string; label: string } | null): Map<string, { label: string; items: T[] }> {
  const map = new Map<string, { label: string; items: T[] }>();
  for (const i of items) {
    const k = keyFn(i); if (!k || !k.key) continue;
    const cur = map.get(k.key) || { label: k.label, items: [] };
    cur.items.push(i); map.set(k.key, cur);
  }
  return map;
}

export function rankScripts(ds: LabDataset): RankingRow[] {
  // Agrupa sessions + callLogs por scriptUsed; leads são atribuídos via callLogs->leadId
  const scripts = new Set<string>();
  ds.sessions.forEach((s) => s.scriptUsed && scripts.add(s.scriptUsed));
  ds.callLogs.forEach((c) => c.scriptUsed && scripts.add(c.scriptUsed));
  const buckets: Bucket[] = [...scripts].map((script) => {
    const sessions = ds.sessions.filter((s) => s.scriptUsed === script);
    const callLogs = ds.callLogs.filter((c) => c.scriptUsed === script);
    const leadIds = new Set(callLogs.map((c) => c.leadId).filter(Boolean) as string[]);
    const leads = ds.leads.filter((l) => leadIds.has(l.id));
    const events = ds.events.filter((e) => leadIds.has(e.leadId));
    const meetings = ds.meetings.filter((m) => leadIds.has(m.leadId));
    const transactions = ds.transactions.filter((t) => t.clientId && leadIds.has(t.clientId));
    return { key: script, label: script, leads, events, meetings, sessions, callLogs, transactions };
  });
  return rank(buckets, "script");
}

export function rankCampaigns(ds: LabDataset): RankingRow[] {
  const groups = groupBy(ds.leads, (l) => {
    const seg = resolveSegments(l);
    if (!seg.nicheKey || !seg.cityKey) return null;
    return { key: seg.campaignKey, label: seg.campaignDisplay };
  });
  const buckets: Bucket[] = [...groups].map(([key, g]) => {
    const leadIds = new Set(g.items.map((l) => l.id));
    const [nicheKey] = key.split("||");
    return {
      key, label: g.label,
      leads: g.items,
      events: ds.events.filter((e) => leadIds.has(e.leadId)),
      meetings: ds.meetings.filter((m) => leadIds.has(m.leadId)),
      sessions: ds.sessions.filter((s) => norm(parseNicheField(s.niche || "").niche) === nicheKey),
      callLogs: ds.callLogs.filter((c) => c.leadId && leadIds.has(c.leadId)),
      transactions: ds.transactions.filter((t) => t.clientId && leadIds.has(t.clientId)),
    };
  });
  return rank(buckets, "campaign");
}

export function rankCities(ds: LabDataset): RankingRow[] {
  const groups = groupBy(ds.leads, (l) => {
    const seg = resolveSegments(l);
    if (!seg.cityKey) return null;
    return { key: seg.cityKey, label: seg.cityDisplay };
  });
  const buckets: Bucket[] = [...groups].map(([key, g]) => {
    const leadIds = new Set(g.items.map((l) => l.id));
    return {
      key, label: g.label,
      leads: g.items,
      events: ds.events.filter((e) => leadIds.has(e.leadId)),
      meetings: ds.meetings.filter((m) => leadIds.has(m.leadId)),
      sessions: [], // sessions não têm cidade — evita duplo-contar
      callLogs: ds.callLogs.filter((c) => c.leadId && leadIds.has(c.leadId)),
      transactions: ds.transactions.filter((t) => t.clientId && leadIds.has(t.clientId)),
    };
  });
  // Sem sessions, precisamos garantir calls: usa callLogs + eventos type=call
  for (const b of buckets) {
    const extraCalls = b.events.filter((e) => e.type === "call").length;
    // Injeta callLogs "sintéticos" p/ manter cálculo unificado
    // (não afetamos storage; apenas o cálculo local)
    for (let i = 0; i < extraCalls; i++) {
      b.callLogs.push({ id: `syn-${b.key}-${i}`, timestamp: "", scriptUsed: "",
        source: "call_note" } as CallLog);
    }
  }
  return rank(buckets, "city");
}

export function rankNiches(ds: LabDataset): RankingRow[] {
  const groups = groupBy(ds.leads, (l) => {
    const seg = resolveSegments(l);
    if (!seg.nicheKey) return null;
    return { key: seg.nicheKey, label: seg.nicheDisplay };
  });
  const buckets: Bucket[] = [...groups].map(([key, g]) => {
    const leadIds = new Set(g.items.map((l) => l.id));
    return {
      key, label: g.label,
      leads: g.items,
      events: ds.events.filter((e) => leadIds.has(e.leadId)),
      meetings: ds.meetings.filter((m) => leadIds.has(m.leadId)),
      sessions: ds.sessions.filter((s) => norm(parseNicheField(s.niche || "").niche) === key),
      callLogs: ds.callLogs.filter((c) => c.leadId && leadIds.has(c.leadId)),
      transactions: ds.transactions.filter((t) => t.clientId && leadIds.has(t.clientId)),
    };
  });
  return rank(buckets, "niche");
}

export const HOUR_BUCKETS = [
  { key: "08-10", label: "08h–10h", start: 8, end: 10 },
  { key: "10-12", label: "10h–12h", start: 10, end: 12 },
  { key: "13-15", label: "13h–15h", start: 13, end: 15 },
  { key: "15-17", label: "15h–17h", start: 15, end: 17 },
  { key: "17-19", label: "17h–19h", start: 17, end: 19 },
] as const;
function hourOf(iso: string): number {
  const d = new Date(iso); return isNaN(d.getTime()) ? -1 : d.getHours();
}
export function rankHours(ds: LabDataset): RankingRow[] {
  const buckets: Bucket[] = HOUR_BUCKETS.map((h) => {
    const inBucket = (iso: string) => {
      const hh = hourOf(iso); return hh >= h.start && hh < h.end;
    };
    const sessions = ds.sessions.filter((s) => inBucket(s.startTime));
    const callLogs = ds.callLogs.filter((c) => inBucket(c.timestamp));
    const events = ds.events.filter((e) => inBucket(e.timestamp));
    const meetings = ds.meetings.filter((m) => inBucket(`${m.date}T${m.time || "00:00"}:00`));
    const leadIds = new Set<string>();
    events.forEach((e) => leadIds.add(e.leadId));
    callLogs.forEach((c) => c.leadId && leadIds.add(c.leadId));
    const leads = ds.leads.filter((l) => leadIds.has(l.id));
    return {
      key: h.key, label: h.label,
      leads, events, meetings, sessions, callLogs,
      transactions: ds.transactions.filter((t) => t.clientId && leadIds.has(t.clientId)),
    };
  });
  return rank(buckets, "hour");
}

// Responsável: reservado — sistema atualmente single-user.
export function rankResponsibles(_ds: LabDataset): RankingRow[] {
  return [];
}

// ---------- comparação por dimensão (fachada) ----------
export function rankByDimension(ds: LabDataset, dimension: LabDimension): RankingRow[] {
  switch (dimension) {
    case "script": return rankScripts(ds);
    case "campaign": return rankCampaigns(ds);
    case "city": return rankCities(ds);
    case "niche": return rankNiches(ds);
    case "hour": return rankHours(ds);
    case "responsible": return rankResponsibles(ds);
  }
}
