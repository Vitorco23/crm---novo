import { useMemo, useState } from "react";
import {
  getLeads, getSessions, getMovementEvents, getMeetings,
  COLD_CALL_STAGES, OPORTUNIDADES_STAGES,
  getGoalsSettings, getLeadsForPipeline,
} from "@/lib/store";
import { getTransactions, formatBRL, monthKey } from "@/lib/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isToday, isThisWeek, isThisMonth, isWithinInterval, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  TrendingUp, Phone, Users, UserCheck, CalendarCheck, Trophy, DollarSign,
  Handshake, Trophy as TrophyIcon, Send, Instagram, Mail, Activity, Layers, Crown,
  Calendar as CalendarIcon,
} from "lucide-react";
import PriorityCard from "@/components/PriorityCard";
import ExportExcelDialog from "@/components/ExportExcelDialog";
import { buildDashboardSheets } from "@/lib/exportBuilders";
import { resolvePeriod } from "@/lib/exportEngine";
import { cn } from "@/lib/utils";

type Filter = "day" | "week" | "month" | "custom";

interface CustomRange { start: Date; end: Date }

function filterByDate(dateStr: string, filter: Filter, custom?: CustomRange) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  if (filter === "day") return isToday(d);
  if (filter === "week") return isThisWeek(d, { weekStartsOn: 1 });
  if (filter === "month") return isThisMonth(d);
  if (filter === "custom" && custom) {
    return isWithinInterval(d, { start: custom.start, end: custom.end });
  }
  return false;
}

const filterLabels: Record<Filter, string> = {
  day: "Hoje", week: "Semana", month: "Mês", custom: "Personalizado",
};

export default function Dashboard() {
  const [filter, setFilter] = useState<Filter>("month");
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const custom = customStart && customEnd
    ? { start: new Date(customStart.setHours(0, 0, 0, 0)), end: new Date(customEnd.setHours(23, 59, 59, 999)) }
    : undefined;

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-muted rounded-lg p-0.5">
            {(["day", "week", "month", "custom"] as Filter[]).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "ghost"}
                onClick={() => setFilter(f)}
                className={filter === f ? "bg-accent text-accent-foreground hover:bg-accent/90 h-7 text-xs" : "h-7 text-xs"}>
                {filterLabels[f]}
              </Button>
            ))}
          </div>
          {filter === "custom" && (
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {customStart ? format(customStart, "dd/MM/yyyy") : "Início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarUI mode="single" selected={customStart} onSelect={setCustomStart}
                    initialFocus className={cn("p-3 pointer-events-auto")} locale={ptBR} />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">até</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {customEnd ? format(customEnd, "dd/MM/yyyy") : "Fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarUI mode="single" selected={customEnd} onSelect={setCustomEnd}
                    initialFocus className={cn("p-3 pointer-events-auto")} locale={ptBR} />
                </PopoverContent>
              </Popover>
            </div>
          )}
          <ExportExcelDialog
            moduleName="Dashboard"
            moduleSlug="Dashboard"
            build={(range) => buildDashboardSheets(range)}
            defaultPreset={
              filter === "day" ? "today" : filter === "week" ? "last7" :
              filter === "month" ? "thisMonth" : "custom"
            }
          />
        </div>
      </div>


      {/* ============ PAINEL 1: OPERACIONAL (período) ============ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-l-2 border-accent pl-3">
          <Activity className="h-4 w-4 text-accent" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Produtividade — {filterLabels[filter]}</h2>
            <p className="text-[11px] text-muted-foreground">Ligações, conexões, decisores e reuniões registrados no período.</p>
          </div>
        </div>
        <OperationalPanel filter={filter} />
        <PriorityCard />
      </section>

      {/* ============ PAINEL 2: PIPELINE COMERCIAL (independente) ============ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-l-2 border-accent pl-3">
          <Layers className="h-4 w-4 text-accent" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Pipeline Comercial</h2>
            <p className="text-[11px] text-muted-foreground">Distribuição atual de todos os leads nas etapas — independente do filtro de período.</p>
          </div>
        </div>
        <PipelinePanel />
      </section>

      {/* ============ FINANCEIRO + AGENDA (mantidos) ============ */}
      <section className="space-y-4">
        <FinancialHealthRow />
        <UpcomingMeetingsBlock />
      </section>
    </div>
  );
}

/* ============================================================
   PAINEL 1 — OPERACIONAL
   ============================================================ */
function OperationalPanel({ filter }: { filter: Filter }) {
  const sessions = getSessions();
  const movements = getMovementEvents();
  const meetings = getMeetings();

  const filteredSessions = useMemo(() => sessions.filter((s) => filterByDate(s.startTime, filter)), [sessions, filter]);
  const filteredMeetings = useMemo(
    () => meetings.filter((m) => filterByDate(`${m.date}T${m.time || "00:00"}`, filter)),
    [meetings, filter]
  );

  const meetingsBySource = useMemo(() => {
    const acc: Record<string, number> = { "Ligação": 0, "Disparo": 0, "Instagram": 0, "Email": 0 };
    filteredMeetings.forEach((m) => {
      const s = m.source || "Ligação";
      acc[s] = (acc[s] || 0) + 1;
    });
    return acc;
  }, [filteredMeetings]);

  const callMeetings = meetingsBySource["Ligação"] || 0;
  const otherChannelsMeetings =
    (meetingsBySource["Disparo"] || 0) + (meetingsBySource["Instagram"] || 0) + (meetingsBySource["Email"] || 0);

  const sessionCalls = filteredSessions.reduce((a, s) => a + s.calls, 0);
  const sessionConnections = filteredSessions.reduce((a, s) => a + (s.connections || 0), 0);
  const sessionDecisionMakers = filteredSessions.reduce((a, s) => a + (s.decisionMakers || 0), 0);
  const sessionMeetings = filteredSessions.reduce((a, s) => a + s.meetings, 0);

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
  const rateCallConn = pct(sessionConnections, sessionCalls);
  const rateConnDM = pct(sessionDecisionMakers, sessionConnections);
  const rateDMMeet = pct(sessionMeetings, sessionDecisionMakers);

  const goldenHour = useMemo(() => {
    if (filteredSessions.length === 0) return null;
    const enriched = filteredSessions.map((s) => {
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      const movsDuring = movements.filter((m) => {
        const t = new Date(m.timestamp);
        return isWithinInterval(t, { start, end });
      });
      const autoCallsDuring = movsDuring.filter((m) => m.type === "call").length;
      return {
        ...s,
        totalActivity: s.meetings * 3 + (s.decisionMakers || 0) * 2 + s.calls + autoCallsDuring,
        autoCalls: autoCallsDuring,
      };
    });
    return enriched.sort((a, b) => b.totalActivity - a.totalActivity)[0];
  }, [filteredSessions, movements]);

  return (
    <div className="space-y-4">
      {/* Métricas do período */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={Phone} label="Ligações" value={sessionCalls} />
        <MetricCard icon={Users} label="Conexões" value={sessionConnections} sub={rateCallConn != null ? `${rateCallConn}% das ligações` : undefined} />
        <MetricCard icon={UserCheck} label="Decisores" value={sessionDecisionMakers} sub={rateConnDM != null ? `${rateConnDM}% das conexões` : undefined} />
        <MetricCard icon={CalendarCheck} label="Reuniões" value={sessionMeetings} sub={rateDMMeet != null ? `${rateDMMeet}% dos decisores` : undefined} />
      </div>

      {/* Funil de Outreach do período */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Funil de Outreach — {filterLabels[filter]}</CardTitle></CardHeader>
        <CardContent>
          {(() => {
            const meetingsFromCalls = Math.max(callMeetings, sessionMeetings);
            const stages = [
              { name: "Ligações", value: sessionCalls },
              { name: "Conexões", value: sessionConnections },
              { name: "Decisores", value: sessionDecisionMakers },
              { name: "Reuniões (Ligação)", value: meetingsFromCalls },
            ];
            const maxVal = stages[0].value || 1;
            if (stages.every((s) => s.value === 0)) {
              return <p className="text-sm text-muted-foreground py-6 text-center">Sem atividade de outreach no período.</p>;
            }
            return (
              <div className="space-y-1.5">
                {stages.map((s, i) => {
                  const w = maxVal > 0 ? Math.round((s.value / maxVal) * 100) : 0;
                  const prev = i > 0 ? stages[i - 1].value : 0;
                  const rate = i > 0 && prev > 0 ? Math.round((s.value / prev) * 100) : null;
                  const hue = 78 + i * 20;
                  return (
                    <div key={s.name} className="flex items-center gap-2 text-xs">
                      <span className="w-40 truncate text-muted-foreground">{s.name}</span>
                      <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                        <div className="h-full rounded-sm transition-all duration-500"
                          style={{ width: `${w}%`, backgroundColor: `hsl(${hue} 50% ${47 - i * 2}%)` }} />
                      </div>
                      <span className="w-10 text-right font-medium text-foreground tabular-nums">{s.value}</span>
                      <span className="w-20 text-[10px] text-right tabular-nums text-muted-foreground/70">
                        {rate != null ? `${rate}% conv.` : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Reuniões por canal alternativo */}
      {otherChannelsMeetings > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Reuniões por Canal Alternativo</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {([
                { key: "Disparo", icon: Send, hue: 200 },
                { key: "Instagram", icon: Instagram, hue: 320 },
                { key: "Email", icon: Mail, hue: 40 },
              ] as const).map(({ key, icon: Icon, hue }) => (
                <div key={key} className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Icon className="h-3.5 w-3.5" style={{ color: `hsl(${hue} 50% 55%)` }} /> {key}
                  </div>
                  <p className="text-2xl font-bold text-foreground tabular-nums">
                    {meetingsBySource[key] || 0}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 pt-2 border-t border-border">
              Alternativos: <span className="font-medium text-foreground">{otherChannelsMeetings}</span> · Ligação: <span className="font-medium text-foreground">{callMeetings}</span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Ranking de Pomodoros do período */}
      <PomodoroRanking sessions={filteredSessions} />

      {/* Golden Hour */}
      {goldenHour && (
        <Card className="border-accent/30 bg-accent/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-accent" />
              <div>
                <p className="text-sm font-semibold text-foreground">Golden Hour</p>
                <p className="text-xs text-muted-foreground">
                  Sessão das {format(new Date(goldenHour.startTime), "HH:mm")} às{" "}
                  {format(new Date(goldenHour.endTime), "HH:mm")}
                  {goldenHour.niche ? ` (${goldenHour.niche})` : ""} foi a mais produtiva:{" "}
                  <span className="font-medium text-accent">{goldenHour.meetings} reuniões</span>,{" "}
                  {goldenHour.decisionMakers || 0} decisores, {goldenHour.calls + goldenHour.autoCalls} ligações.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/* ============================================================
   PAINEL 1.b — RANKING DE POMODOROS
   ============================================================ */
function PomodoroRanking({ sessions }: { sessions: ReturnType<typeof getSessions> }) {
  const ranked = useMemo(() => {
    return [...sessions]
      .map((s) => ({
        ...s,
        score: s.meetings * 3 + (s.decisionMakers || 0) * 2 + (s.connections || 0) + s.calls * 0.5,
      }))
      .sort((a, b) => b.score - a.score);
  }, [sessions]);

  const bestId = ranked[0]?.id;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Crown className="h-4 w-4 text-accent" /> Ranking de Pomodoros
        </CardTitle>
      </CardHeader>
      <CardContent>
        {ranked.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma sessão registrada no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="py-2 pr-2 font-medium">#</th>
                  <th className="py-2 pr-2 font-medium">Horário</th>
                  <th className="py-2 pr-2 font-medium">Nicho</th>
                  <th className="py-2 pr-2 font-medium text-right">Lig.</th>
                  <th className="py-2 pr-2 font-medium text-right">Conex.</th>
                  <th className="py-2 pr-2 font-medium text-right">Decis.</th>
                  <th className="py-2 pr-2 font-medium text-right">Reun.</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((s, idx) => {
                  const isBest = s.id === bestId;
                  return (
                    <tr
                      key={s.id}
                      className={`border-b border-border/50 last:border-0 ${
                        isBest ? "bg-accent/10" : "hover:bg-muted/30"
                      }`}
                    >
                      <td className="py-2 pr-2 tabular-nums">
                        <span className={`inline-flex items-center gap-1 ${isBest ? "text-accent font-semibold" : "text-muted-foreground"}`}>
                          {isBest && <Crown className="h-3 w-3" />}
                          {idx + 1}
                        </span>
                      </td>
                      <td className="py-2 pr-2 tabular-nums text-foreground">
                        {format(new Date(s.startTime), "dd/MM HH:mm", { locale: ptBR })}
                        <span className="text-muted-foreground">
                          {" → "}{format(new Date(s.endTime), "HH:mm")}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-muted-foreground truncate max-w-[140px]">{s.niche || "—"}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-foreground">{s.calls}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-foreground">{s.connections || 0}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-foreground">{s.decisionMakers || 0}</td>
                      <td className={`py-2 pr-2 text-right tabular-nums font-medium ${isBest ? "text-accent" : "text-foreground"}`}>
                        {s.meetings}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
   PAINEL 2 — PIPELINE COMERCIAL (independente do filtro)
   ============================================================ */
function PipelinePanel() {
  const leads = getLeads();
  const goals = getGoalsSettings();

  const expectedRateByStage: Record<string, number> = {
    "Reunião Marcada": goals.decisionMakerToMeetingScheduled,
    "Reunião Realizada": goals.meetingScheduledToHeld,
    "Ganho": goals.meetingHeldToClose,
  };

  // Agrupamento: Tentativas colapsadas + demais etapas de Oportunidades + Perdido
  const distribution = useMemo(() => {
    const attemptsStages = COLD_CALL_STAGES.filter((s) => s !== "Novo Lead");
    const novo = leads.filter((l) => l.stage === "Novo Lead").length;
    const tentativas = leads.filter((l) => (attemptsStages as readonly string[]).includes(l.stage)).length;
    const opps = OPORTUNIDADES_STAGES.map((s) => ({
      name: s,
      value: leads.filter((l) => l.stage === s).length,
    }));
    return [
      { name: "Novo Lead", value: novo },
      { name: "Tentativas", value: tentativas },
      ...opps,
    ];
  }, [leads]);

  // Funil com taxas reais x esperadas (usa a ordem cold call → oportunidades sem Perdido)
  const funnelData = useMemo(() => {
    const allStages = [...COLD_CALL_STAGES, ...OPORTUNIDADES_STAGES.filter((s) => s !== "Perdido")];
    const counts = allStages.map((_, i) =>
      leads.filter((l) => {
        const idx = allStages.indexOf(l.stage as any);
        return idx >= i;
      }).length
    );
    return allStages.map((stage, i) => {
      const count = counts[i] || 0;
      const prev = i > 0 ? counts[i - 1] : 0;
      const realRate = prev > 0 ? (count / prev) * 100 : null;
      const expectedRate = expectedRateByStage[stage] ?? null;
      const hue = 78 + i * 12;
      return {
        name: stage,
        value: count,
        prev,
        realRate,
        expectedRate,
        fill: `hsl(${hue} 50% ${47 - i * 1.5}%)`,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads]);

  const bottleneck = useMemo(() => {
    let worst: { name: string; prevName: string; real: number; expected: number; diff: number } | null = null;
    funnelData.forEach((d, i) => {
      if (d.expectedRate == null || d.realRate == null || d.prev === 0) return;
      const diff = d.realRate - d.expectedRate;
      if (worst == null || diff < worst.diff) {
        worst = { name: d.name, prevName: funnelData[i - 1].name, real: d.realRate, expected: d.expectedRate, diff };
      }
    });
    return worst;
  }, [funnelData]);

  const maxDist = Math.max(1, ...distribution.map((d) => d.value));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Distribuição por etapa */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Distribuição de Leads por Etapa</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {distribution.map((d, i) => {
              const w = Math.round((d.value / maxDist) * 100);
              const hue = 78 + i * 15;
              const isLost = d.name === "Perdido";
              return (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="w-40 truncate text-muted-foreground">{d.name}</span>
                  <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                    <div
                      className="h-full rounded-sm transition-all duration-500"
                      style={{
                        width: `${w}%`,
                        backgroundColor: isLost
                          ? "hsl(0 60% 45%)"
                          : `hsl(${hue} 50% ${47 - i * 1.5}%)`,
                      }}
                    />
                  </div>
                  <span className="w-10 text-right font-medium text-foreground tabular-nums">{d.value}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 pt-2 border-t border-border">
            Total: <span className="font-medium text-foreground">{leads.length}</span> leads no CRM.
          </p>
        </CardContent>
      </Card>

      {/* Funil real x esperado */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Funil (Real × Meta)</CardTitle></CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem leads no CRM ainda.</p>
          ) : (
            <div className="space-y-1.5">
              {funnelData.map((item) => {
                const maxVal = funnelData[0]?.value || 1;
                const w = maxVal > 0 ? Math.round((item.value / maxVal) * 100) : 0;
                let badge: { label: string; cls: string } | null = null;
                if (item.expectedRate != null && item.realRate != null && item.prev > 0) {
                  const diff = item.realRate - item.expectedRate;
                  const tol = item.expectedRate * 0.15;
                  const cls =
                    diff >= tol
                      ? "bg-accent/15 text-accent border-accent/30"
                      : diff <= -tol
                      ? "bg-red-500/15 text-red-400 border-red-500/30"
                      : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
                  badge = { label: `${Math.round(item.realRate)}% / ${Math.round(item.expectedRate)}%`, cls };
                }
                return (
                  <div key={item.name} className="flex items-center gap-2 text-xs">
                    <span className="w-36 truncate text-muted-foreground">{item.name}</span>
                    <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                      <div className="h-full rounded-sm transition-all duration-500" style={{ width: `${w}%`, backgroundColor: item.fill }} />
                    </div>
                    <span className="w-8 text-right font-medium text-foreground tabular-nums">{item.value}</span>
                    <span className={`w-24 text-[10px] text-center px-1.5 py-0.5 rounded border tabular-nums ${badge ? badge.cls : "border-transparent text-muted-foreground/40"}`}>
                      {badge ? badge.label : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {bottleneck && (
            <p className="text-[11px] text-muted-foreground mt-3 pt-2 border-t border-border">
              <span className="text-red-400 font-medium">Gargalo atual:</span>{" "}
              {bottleneck.prevName} → {bottleneck.name} ({Math.round(bottleneck.real)}% real vs {Math.round(bottleneck.expected)}% esperado)
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================================
   FINANCEIRO + AGENDA (mantidos)
   ============================================================ */
function FinancialHealthRow() {
  const data = useMemo(() => {
    const m = new Date().toISOString().slice(0, 7);
    const txs = getTransactions();
    const revenue = txs
      .filter((t) => t.kind === "revenue" && monthKey(t.date) === m)
      .reduce((s, t) => s + t.amount, 0);
    const goal = getGoalsSettings().monthlyRevenueGoal;

    const oppLeads = getLeadsForPipeline("oportunidades");
    const negotiating = oppLeads
      .filter((l) => l.stage !== "Ganho" && l.stage !== "Perdido")
      .reduce((s, l) => s + (l.contractValue || 0), 0);

    const wonThisMonth = oppLeads.filter(
      (l) => l.stage === "Ganho" && monthKey(l.stageChangedAt) === m
    );
    const wonAmount = wonThisMonth.reduce((s, l) => s + (l.contractValue || 0), 0);

    return { revenue, goal, negotiating, wonCount: wonThisMonth.length, wonAmount };
  }, []);

  const pct = data.goal > 0 ? Math.min((data.revenue / data.goal) * 100, 100) : 0;
  const barColor = pct < 30 ? "bg-red-500" : pct < 70 ? "bg-yellow-500" : "bg-accent";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Card><CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          <DollarSign className="h-3.5 w-3.5" /> Receita do mês
        </div>
        <p className="text-2xl font-bold text-foreground">{formatBRL(data.revenue)}</p>
        <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
          {formatBRL(data.revenue)} / {formatBRL(data.goal)}
        </p>
      </CardContent></Card>

      <Card><CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          <Handshake className="h-3.5 w-3.5" /> Em negociação
        </div>
        <p className="text-2xl font-bold text-foreground">{formatBRL(data.negotiating)}</p>
        <p className="text-[10px] text-muted-foreground mt-1">Oportunidades em aberto</p>
      </CardContent></Card>

      <Card><CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          <TrophyIcon className="h-3.5 w-3.5" /> Fechamentos no mês
        </div>
        <p className="text-2xl font-bold text-foreground">{data.wonCount}</p>
        <p className="text-[10px] text-accent mt-1 tabular-nums">{formatBRL(data.wonAmount)}</p>
      </CardContent></Card>
    </div>
  );
}

function UpcomingMeetingsBlock() {
  const { today, upcoming } = useMemo(() => {
    const all = getMeetings();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const in7 = new Date(now);
    in7.setDate(in7.getDate() + 7);

    const sortFn = (a: { date: string; time: string }, b: { date: string; time: string }) =>
      (a.date + a.time).localeCompare(b.date + b.time);

    const today = all.filter((m) => m.date === todayStr).sort(sortFn);

    const upcomingFlat = all
      .filter((m) => {
        if (m.date <= todayStr) return false;
        const d = new Date(m.date + "T00:00:00");
        return d <= in7;
      })
      .sort(sortFn);

    const grouped: Record<string, typeof upcomingFlat> = {};
    upcomingFlat.forEach((m) => {
      (grouped[m.date] ??= []).push(m);
    });

    return { today, upcoming: grouped };
  }, []);

  const formatDay = (dateStr: string) =>
    format(new Date(dateStr + "T00:00:00"), "EEE, dd 'de' MMM", { locale: ptBR });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-accent" /> Próximas Reuniões
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Hoje</p>
          {today.length === 0 ? (
            <p className="text-xs text-muted-foreground/70 italic">
              Nenhuma reunião hoje — foco em prospecção
            </p>
          ) : (
            <div className="space-y-1.5">
              {today.map((m) => {
                const link = m.meetLink || m.link || m.googleEventUrl;
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-md border border-accent/20 bg-accent/5 px-3 py-2">
                    <span className="text-sm font-semibold text-accent tabular-nums w-12">{m.time}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{m.company}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {m.contactName || "—"}
                        {m.channel ? ` · ${m.channel}` : ""}
                      </p>
                    </div>
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] px-2 py-1 rounded bg-accent text-accent-foreground hover:bg-accent/90 transition-colors">
                        Entrar
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {Object.keys(upcoming).length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Próximos 7 dias</p>
            <div className="space-y-2">
              {Object.entries(upcoming).map(([date, list]) => (
                <div key={date}>
                  <p className="text-[11px] font-medium text-muted-foreground mb-1">{formatDay(date)}</p>
                  <div className="space-y-0.5 pl-2 border-l border-border">
                    {list.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 text-xs py-0.5">
                        <span className="text-muted-foreground tabular-nums w-12">{m.time}</span>
                        <span className="text-foreground truncate">{m.company}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// TrendingUp import used by types elsewhere; keep to satisfy lint if unused
void TrendingUp;
