// ============================================================
// Painel Estratégico — blocos analíticos do CRM Performance21.
// ------------------------------------------------------------
// Sprint 1 (separação Dashboard × Central de Decisão):
// estes blocos foram MOVIDOS da Central de Decisão para o
// Dashboard sem qualquer alteração de regra de negócio ou
// cálculo. São apenas leitura/apresentação de dados.
// ============================================================

import { useEffect, useMemo, useState, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles, TrendingUp, TrendingDown, Activity, ChevronRight,
  Layers, ArrowRight,
} from "lucide-react";

import {
  getLeads, getMeetings, getMovementEvents, getSessions,
  getStagesForPipeline,
  type Lead, type Meeting, type MovementEvent, type PomodoroSession,
} from "@/shared/services/store";
import { getTransactions, monthKey, formatBRL } from "@/modules/financeiro/services/finance";
import {
  analyzeBottleneck, resolveBottleneckPeriod, previousPeriod, compareBottlenecks,
  type Bottleneck,
} from "@/modules/cold-call/services/bottleneckEngine";
import {
  getInsights, sortInsights, CATEGORY_LABELS, type Insight,
} from "@/modules/intelligence/services/insights";

export type PeriodKey = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth";

interface CentralFilters {
  period: PeriodKey;
  city: string;
  niche: string;
  campaign: string;
}

const OPPORTUNITY_CATEGORIES = new Set(["cidade", "nicho", "campanha", "script", "horario"]);
function isOpportunity(i: Insight): boolean {
  if (!OPPORTUNITY_CATEGORIES.has(i.category)) return false;
  const t = i.title.toLowerCase();
  return /destaque|campe|lider|melhor|crescimento|evolu|em alta/.test(t);
}

// Assinatura simples aos sinais do barramento de eventos.
function useLiveTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("storage", bump);
    window.addEventListener("p21:storage-synced", bump as EventListener);
    return () => {
      window.removeEventListener("storage", bump);
      window.removeEventListener("p21:storage-synced", bump as EventListener);
    };
  }, []);
  return tick;
}

// Recorte de período para as agregações locais da Central.
function resolvePeriod(key: PeriodKey): { start: Date; end: Date; label: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay   = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  switch (key) {
    case "today":     return { start: startOfDay(now), end: endOfDay(now), label: "Hoje" };
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y), label: "Ontem" };
    }
    case "last7": {
      const s = new Date(now); s.setDate(s.getDate() - 6);
      return { start: startOfDay(s), end: endOfDay(now), label: "Últimos 7 dias" };
    }
    case "last30": {
      const s = new Date(now); s.setDate(s.getDate() - 29);
      return { start: startOfDay(s), end: endOfDay(now), label: "Últimos 30 dias" };
    }
    case "lastMonth": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: s, end: e, label: "Mês anterior" };
    }
    case "thisMonth":
    default: {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: s, end: endOfDay(now), label: "Este mês" };
    }
  }
}

function inRange(iso: string | undefined | null, r: { start: Date; end: Date }): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !isNaN(t) && t >= r.start.getTime() && t <= r.end.getTime();
}

const norm = (s: string | undefined | null) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

// ============================================================
// DATASET FILTRADO (compartilhado por todos os blocos)
// ============================================================

interface CentralDataset {
  filters: CentralFilters;
  range: { start: Date; end: Date; label: string };
  leads: Lead[];             // leads que casam com os filtros de recorte
  events: MovementEvent[];   // no período + leads escopados
  meetings: Meeting[];       // no período + leads escopados
  sessions: PomodoroSession[]; // no período (+ nicho quando aplicável)
  cities: string[];
  niches: string[];
  campaigns: { key: string; label: string }[];
}

function useCentralDataset(filters: CentralFilters, tick: number): CentralDataset {
  return useMemo(() => {
    const range = resolvePeriod(filters.period);
    const allLeads = getLeads();
    const allEvents = getMovementEvents();
    const allMeetings = getMeetings();
    const allSessions = getSessions();

    // Domínios para os selects (independentes de outros filtros).
    const cities = Array.from(new Set(allLeads.map((l) => l.city).filter(Boolean))).sort();
    const niches = Array.from(new Set(allLeads.map((l) => l.niche).filter(Boolean))).sort();
    const campaignSet = new Map<string, string>();
    for (const l of allLeads) {
      if (!l.niche || !l.city) continue;
      const key = `${norm(l.niche)}||${norm(l.city)}`;
      const label = `${l.niche} — ${l.city}`;
      if (!campaignSet.has(key)) campaignSet.set(key, label);
    }
    const campaigns = Array.from(campaignSet.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    // Aplica filtros de escopo (cidade/nicho/campanha) sobre os leads.
    const scopeLead = (l: Lead) => {
      if (filters.city !== "all" && l.city !== filters.city) return false;
      if (filters.niche !== "all" && l.niche !== filters.niche) return false;
      if (filters.campaign !== "all") {
        const k = `${norm(l.niche)}||${norm(l.city)}`;
        if (k !== filters.campaign) return false;
      }
      return true;
    };
    const scopedLeads = allLeads.filter(scopeLead);
    const leadIds = new Set(scopedLeads.map((l) => l.id));

    const filteredEvents = allEvents.filter(
      (e) => inRange(e.timestamp, range) && (leadIds.size === 0 || leadIds.has(e.leadId))
    );
    const filteredMeetings = allMeetings.filter((m) => {
      const iso = `${m.date}T${m.time || "00:00"}`;
      return inRange(iso, range) && (leadIds.size === 0 || leadIds.has(m.leadId));
    });
    const filteredSessions = allSessions.filter((s) => {
      if (!inRange(s.startTime, range)) return false;
      if (filters.niche !== "all" && s.niche && s.niche !== filters.niche) return false;
      return true;
    });

    return {
      filters,
      range,
      leads: scopedLeads,
      events: filteredEvents,
      meetings: filteredMeetings,
      sessions: filteredSessions,
      cities,
      niches,
      campaigns,
    };
    // tick força recomputo em eventos do barramento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, tick]);
}
// ============================================================
// BLOCO 4: OPORTUNIDADES
// ============================================================

function OpportunitiesBlock({ tick }: { tick: number }) {
  const items = useMemo(() => {
    const active = getInsights().filter((i) => i.status === "active" && isOpportunity(i));
    return sortInsights(active).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          Oportunidades
          {items.length > 0 && (
            <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            Sem oportunidades destacadas no momento. Aumente volume de dados para
            ativar comparações de cidade, nicho, campanha, horário e script.
          </p>
        ) : (
          items.map((i) => (
            <div key={i.id} className="rounded-md border border-l-4 border-l-emerald-500 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-sm font-semibold">{i.title}</span>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {CATEGORY_LABELS[i.category]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{i.description}</p>
              <p className="text-[11px] mt-1">
                <span className="font-semibold text-foreground/80">Base: </span>
                <span className="text-muted-foreground">{i.reason}</span>
              </p>
              <p className="text-[11px] mt-1 flex items-start gap-1">
                <ArrowRight className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                <span>{i.suggestion}</span>
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// BLOCO 5: O QUE MUDOU
// ============================================================

function ChangesBlock({ data, tick }: { data: CentralDataset; tick: number }) {
  const changes = useMemo(() => {
    const bnPeriodKey =
      data.filters.period === "yesterday" ? "yesterday" :
      data.filters.period === "last7"     ? "last7" :
      data.filters.period === "last30"    ? "last30" :
      data.filters.period === "thisMonth" ? "thisMonth" :
      data.filters.period === "lastMonth" ? "lastMonth" : "today";
    const cur = analyzeBottleneck(resolveBottleneckPeriod(bnPeriodKey as any));
    const prev = analyzeBottleneck(previousPeriod(cur.period));
    const funnelChange = compareBottlenecks(cur, prev);

    const revenueChange = revenueDelta(data);
    const meetingsChange = meetingsDelta(data);
    const productivityChange = productivityDelta(data);
    const leaderChange = leadershipShifts(cur, prev);

    return { funnelChange, revenueChange, meetingsChange, productivityChange, leaderChange };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tick]);

  const items: { label: string; value: string; dir: "up" | "down" | "flat" }[] = [];
  if (changes.funnelChange) {
    items.push({
      label: "Funil",
      value: changes.funnelChange,
      dir: changes.funnelChange.includes("melhorou") ? "up"
         : changes.funnelChange.includes("piorou") ? "down" : "flat",
    });
  }
  if (changes.revenueChange) items.push(changes.revenueChange);
  if (changes.meetingsChange) items.push(changes.meetingsChange);
  if (changes.productivityChange) items.push(changes.productivityChange);
  if (changes.leaderChange) items.push({ label: "Gargalo", value: changes.leaderChange, dir: "flat" });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" />
          O que mudou vs. período anterior
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            Sem mudanças relevantes registradas em relação ao período anterior.
          </p>
        ) : (
          items.map((it, idx) => (
            <div key={idx} className="flex items-start gap-2 rounded-md border p-2.5 bg-card">
              {it.dir === "up" && <TrendingUp className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />}
              {it.dir === "down" && <TrendingDown className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />}
              {it.dir === "flat" && <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
              <div className="text-xs">
                <span className="font-semibold text-foreground/80">{it.label}: </span>
                <span className="text-muted-foreground">{it.value}</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function revenueDelta(data: CentralDataset): { label: string; value: string; dir: "up" | "down" | "flat" } | null {
  const range = data.range;
  const span = range.end.getTime() - range.start.getTime();
  const prevEnd = new Date(range.start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - span);
  const tx = getTransactions().filter((t) => t.kind === "revenue");
  const sum = (s: Date, e: Date) =>
    tx.filter((t) => {
      const dt = new Date(t.date + "T00:00:00").getTime();
      return dt >= s.getTime() && dt <= e.getTime();
    }).reduce((a, b) => a + b.amount, 0);
  const cur = sum(range.start, range.end);
  const prev = sum(prevStart, prevEnd);
  if (prev === 0 && cur === 0) return null;
  if (prev === 0) return { label: "Receita", value: `${formatBRL(cur)} (novo período com receita).`, dir: "up" };
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 3) return { label: "Receita", value: `${formatBRL(cur)} — estável vs. anterior.`, dir: "flat" };
  const dir = pct > 0 ? "up" : "down";
  return {
    label: "Receita",
    value: `${formatBRL(cur)} (${pct > 0 ? "+" : ""}${pct.toFixed(0)}% vs. ${formatBRL(prev)}).`,
    dir,
  };
}

function meetingsDelta(data: CentralDataset): { label: string; value: string; dir: "up" | "down" | "flat" } | null {
  const cur = data.meetings.length;
  const span = data.range.end.getTime() - data.range.start.getTime();
  const prevEnd = new Date(data.range.start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - span);
  const prev = getMeetings().filter((m) => {
    const iso = `${m.date}T${m.time || "00:00"}`;
    const t = new Date(iso).getTime();
    return t >= prevStart.getTime() && t <= prevEnd.getTime();
  }).length;
  if (cur + prev === 0) return null;
  if (prev === 0) return { label: "Reuniões", value: `${cur} reuniões (novo período).`, dir: "up" };
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 5) return { label: "Reuniões", value: `${cur} reuniões — estável.`, dir: "flat" };
  const dir = pct > 0 ? "up" : "down";
  return { label: "Reuniões", value: `${cur} reuniões (${pct > 0 ? "+" : ""}${pct.toFixed(0)}% vs. ${prev}).`, dir };
}

function productivityDelta(data: CentralDataset): { label: string; value: string; dir: "up" | "down" | "flat" } | null {
  const cur = data.sessions.reduce((a, s) => a + (s.calls || 0), 0);
  const span = data.range.end.getTime() - data.range.start.getTime();
  const prevEnd = new Date(data.range.start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - span);
  const prev = getSessions()
    .filter((s) => {
      const t = new Date(s.startTime).getTime();
      return t >= prevStart.getTime() && t <= prevEnd.getTime();
    })
    .reduce((a, s) => a + (s.calls || 0), 0);
  if (cur + prev === 0) return null;
  if (prev === 0) return { label: "Ligações", value: `${cur} ligações registradas (novo período).`, dir: "up" };
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 5) return { label: "Ligações", value: `${cur} ligações — estável.`, dir: "flat" };
  return {
    label: "Ligações",
    value: `${cur} ligações (${pct > 0 ? "+" : ""}${pct.toFixed(0)}% vs. ${prev}).`,
    dir: pct > 0 ? "up" : "down",
  };
}

function leadershipShifts(cur: Bottleneck, prev: Bottleneck): string | null {
  if (!cur.hasEnoughData || !prev.hasEnoughData) return null;
  if (cur.main.key !== prev.main.key) {
    return `O gargalo principal mudou de "${prev.main.label}" para "${cur.main.label}".`;
  }
  return null;
}

// ============================================================
// BLOCO 6: RESUMO EXECUTIVO
// ============================================================

function ExecutiveSummary({ data, tick }: { data: CentralDataset; tick: number }) {
  const summary = useMemo(() => buildExecutiveSummary(data), [data, tick]);
  return (
    <Card className="border-l-4 border-l-primary/70">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Resumo Executivo · {data.range.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-foreground/90 leading-relaxed">{summary}</p>
      </CardContent>
    </Card>
  );
}

function buildExecutiveSummary(data: CentralDataset): string {
  const parts: string[] = [];
  const calls = data.sessions.reduce((a, s) => a + (s.calls || 0), 0);
  const meetings = data.meetings.length;
  const cur = analyzeBottleneck(resolveBottleneckPeriod("thisMonth" as any));

  // Financeiro do mês atual
  const mk = new Date().toISOString().slice(0, 7);
  const revenue = getTransactions()
    .filter((t) => t.kind === "revenue" && monthKey(t.date) === mk)
    .reduce((a, b) => a + b.amount, 0);
  const goals = getGoalsSettings();
  const pct = goals.monthlyRevenueGoal > 0 ? (revenue / goals.monthlyRevenueGoal) * 100 : 0;

  if (calls === 0 && meetings === 0 && revenue === 0) {
    return "Ainda não há atividade suficiente no período selecionado para gerar um resumo executivo. Registre pomodoros, ligações e reuniões para ativar as análises.";
  }

  // Prospecção
  if (calls > 0) {
    parts.push(`No período foram registradas ${calls} ligações e ${meetings} reunião(ões).`);
  } else if (meetings > 0) {
    parts.push(`No período foram marcadas ${meetings} reunião(ões).`);
  }

  // Gargalo
  if (cur.hasEnoughData) {
    parts.push(
      `O maior ponto de atenção está entre ${cur.main.from} e ${cur.main.to}, com conversão de ${(cur.main.actualPct ?? 0).toFixed(1).replace(".", ",")}% (meta ${cur.main.targetPct}%).`
    );
  }

  // Meta
  if (goals.monthlyRevenueGoal > 0) {
    if (pct >= 100) {
      parts.push(`A meta mensal de ${formatBRL(goals.monthlyRevenueGoal)} foi atingida (${pct.toFixed(0)}% concluído).`);
    } else if (pct >= 60) {
      parts.push(`A meta mensal já está em ${pct.toFixed(0)}% (${formatBRL(revenue)} de ${formatBRL(goals.monthlyRevenueGoal)}).`);
    } else {
      parts.push(`A meta mensal está em ${pct.toFixed(0)}% (${formatBRL(revenue)} de ${formatBRL(goals.monthlyRevenueGoal)}), exigindo aceleração nas próximas semanas.`);
    }
  }

  // Campanha líder por reuniões
  const camps = new Map<string, number>();
  for (const m of data.meetings) {
    const l = data.leads.find((x) => x.id === m.leadId);
    if (!l?.niche || !l?.city) continue;
    const key = `${l.niche} — ${l.city}`;
    camps.set(key, (camps.get(key) || 0) + 1);
  }
  const topCamp = Array.from(camps.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topCamp) {
    parts.push(`A campanha "${topCamp[0]}" concentra o maior volume de reuniões do período (${topCamp[1]}).`);
  }

  return parts.join(" ");
}

// ============================================================
// ============================================================
// BLOCO 10: PIPELINE
// ============================================================

function PipelineBlock({ data }: { data: CentralDataset }) {
  const summary = useMemo(() => {
    const opp = getStagesForPipeline("oportunidades");
    const scopedLeads = getLeads().filter((l) => opp.includes(l.stage));
    const now = Date.now();

    const perStage = opp.map((stage) => {
      const inStage = scopedLeads.filter((l) => l.stage === stage);
      const value = inStage.reduce((a, l) => a + (l.contractValue || 0), 0);
      const avgDays = inStage.length
        ? inStage.reduce((a, l) => a + (now - new Date(l.stageChangedAt).getTime()), 0) / inStage.length / 86400000
        : 0;
      return { stage, count: inStage.length, value, avgDays: Math.round(avgDays) };
    });

    // Conversão do período com base nos movimentos escopados (data já filtra por lead+período).
    const events = data.events;
    const meetingsScheduled = events.filter((e) => /reuni[aã]o marcada/i.test(e.toStage)).length;
    const meetingsHeld      = events.filter((e) => /reuni[aã]o realizada/i.test(e.toStage)).length;
    const wins              = events.filter((e) => /ganho/i.test(e.toStage)).length;

    return { perStage, meetingsScheduled, meetingsHeld, wins };
  }, [data]);

  const totalValue = summary.perStage.reduce((a, s) => a + s.value, 0);
  const maxCount = Math.max(1, ...summary.perStage.map((s) => s.count));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="h-4 w-4 text-accent" />
            Pipeline · Oportunidades
          </CardTitle>
          <Link to="/oportunidades">
            <Button size="sm" variant="ghost" className="h-7 text-[11px]">
              Abrir pipeline <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <MiniStat label="Valor total" value={formatBRL(totalValue)} />
          <MiniStat label="Reuniões marcadas (período)" value={summary.meetingsScheduled.toString()} />
          <MiniStat label="Reuniões realizadas (período)" value={summary.meetingsHeld.toString()} />
          <MiniStat
            label="Fechamentos (período)"
            value={
              summary.wins.toString() +
              (summary.meetingsHeld > 0
                ? ` · ${Math.round((summary.wins / summary.meetingsHeld) * 100)}%`
                : "")
            }
          />
        </div>
        <div className="space-y-1.5">
          {summary.perStage.map((row) => (
            <div key={row.stage} className="flex items-center gap-2 text-[11px]">
              <span className="w-44 truncate text-muted-foreground">{row.stage}</span>
              <div className="flex-1 h-2 bg-muted rounded-sm overflow-hidden">
                <div
                  className={
                    row.stage === "Ganho" ? "h-full bg-emerald-500"
                    : row.stage === "Perdido" ? "h-full bg-rose-500"
                    : "h-full bg-accent"
                  }
                  style={{ width: `${(row.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="w-10 text-right tabular-nums">{row.count}</span>
              <span className="w-24 text-right tabular-nums text-muted-foreground">{formatBRL(row.value)}</span>
              <span className="w-16 text-right tabular-nums text-muted-foreground">{row.avgDays}d</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

// ============================================================
// PAINEL PÚBLICO — usado pelo Dashboard
// ============================================================

export default function StrategicIntelligencePanel({ period = "thisMonth" }: { period?: PeriodKey }) {
  const tick = useLiveTick();
  const filters = useMemo<CentralFilters>(
    () => ({ period, city: "all", niche: "all", campaign: "all" }),
    [period]
  );
  const data = useCentralDataset(filters, tick);

  return (
    <div className="space-y-4">
      <ExecutiveSummary data={data} tick={tick} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OpportunitiesBlock tick={tick} />
        <ChangesBlock data={data} tick={tick} />
      </div>
      <PipelineBlock data={data} />
    </div>
  );
}
