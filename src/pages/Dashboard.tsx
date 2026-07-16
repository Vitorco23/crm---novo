import { useState, useMemo } from "react";
import {
  getLeads, getSessions, getMovementEvents, getMeetings,
  COLD_CALL_STAGES, OPORTUNIDADES_STAGES,
  getGoalsSettings, getLeadsForPipeline,
} from "@/lib/store";
import { getTransactions, formatBRL, monthKey } from "@/lib/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { isToday, isThisWeek, isThisMonth, format, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, Phone, Users, UserCheck, CalendarCheck, Trophy, DollarSign, Handshake, Trophy as TrophyIcon, Send, Instagram, Mail } from "lucide-react";

type Filter = "day" | "week" | "month";

function filterByDate(dateStr: string, filter: Filter) {
  const d = new Date(dateStr);
  if (filter === "day") return isToday(d);
  if (filter === "week") return isThisWeek(d, { weekStartsOn: 1 });
  return isThisMonth(d);
}

export default function Dashboard() {
  const [filter, setFilter] = useState<Filter>("month");
  const leads = getLeads();
  const sessions = getSessions();
  const movements = getMovementEvents();
  const meetings = getMeetings();

  const filteredLeads = useMemo(() => leads.filter((l) => filterByDate(l.createdAt, filter)), [leads, filter]);
  const filteredSessions = useMemo(() => sessions.filter((s) => filterByDate(s.startTime, filter)), [sessions, filter]);
  const filteredMovements = useMemo(() => movements.filter((m) => filterByDate(m.timestamp, filter)), [movements, filter]);
  const filteredMeetings = useMemo(
    () => meetings.filter((m) => filterByDate(`${m.date}T${m.time || "00:00"}`, filter)),
    [meetings, filter]
  );

  // Meetings by source
  const meetingsBySource = useMemo(() => {
    const acc: Record<string, number> = { "Ligação": 0, "Disparo": 0, "Instagram": 0, "Email": 0 };
    filteredMeetings.forEach((m) => {
      const s = m.source || "Ligação"; // legacy meetings assumed as Ligação
      acc[s] = (acc[s] || 0) + 1;
    });
    return acc;
  }, [filteredMeetings]);

  const callMeetings = meetingsBySource["Ligação"] || 0;
  const otherChannelsMeetings =
    (meetingsBySource["Disparo"] || 0) +
    (meetingsBySource["Instagram"] || 0) +
    (meetingsBySource["Email"] || 0);

  const movementCalls = filteredMovements.filter((m) => m.type === "call").length;
  const movementMeetings = filteredMovements.filter((m) => m.type === "meeting").length;

  const sessionCalls = filteredSessions.reduce((a, s) => a + s.calls, 0);
  const sessionConnections = filteredSessions.reduce((a, s) => a + (s.connections || 0), 0);
  const sessionDecisionMakers = filteredSessions.reduce((a, s) => a + (s.decisionMakers || 0), 0);
  const totalSessionMeetings = filteredSessions.reduce((a, s) => a + s.meetings, 0);

  // Métricas contabilizadas EXCLUSIVAMENTE pelo registro do Pomodoro (não por movimentos no pipeline).
  // movementCalls / movementMeetings ficam disponíveis apenas para o cálculo da Golden Hour.
  void movementCalls; void movementMeetings;
  const totalCalls = sessionCalls;
  const totalMeetings = totalSessionMeetings;

  const goals = getGoalsSettings();

  // Expected conversion rate (%) from previous funnel stage into this stage
  const expectedRateByStage: Record<string, number> = {
    "Reunião Marcada": goals.decisionMakerToMeetingScheduled,
    "Reunião Realizada": goals.meetingScheduledToHeld,
    "Ganho": goals.meetingHeldToClose,
  };

  // Funnel across cold call + oportunidades
  const allStages = [...COLD_CALL_STAGES, ...OPORTUNIDADES_STAGES.filter((s) => s !== "Perdido")];
  const funnelData = useMemo(() => {
    const counts = allStages.map((_, i) =>
      filteredLeads.filter((l) => {
        const idx = allStages.indexOf(l.stage as any);
        return idx >= i || l.stage === "Perdido";
      }).length
    );
    return allStages.map((stage, i) => {
      const count = counts[i] || 0;
      const prev = i > 0 ? counts[i - 1] : 0;
      const realRate = prev > 0 ? (count / prev) * 100 : null;
      const expectedRate = expectedRateByStage[stage] ?? null;
      const hue = 78 + i * 15;
      return {
        name: stage,
        value: count,
        prev,
        realRate,
        expectedRate,
        fill: `hsl(${hue} 50% ${47 - i * 2}%)`,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredLeads]);

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


  const sessionChart = useMemo(() => {
    return filteredSessions.map((s) => ({
      label: format(new Date(s.startTime), "HH:mm", { locale: ptBR }),
      calls: s.calls,
      connections: s.connections || 0,
      meetings: s.meetings,
    }));
  }, [filteredSessions]);

  // Best hour by niche
  const nicheHourMap = useMemo(() => {
    const map: Record<string, Record<string, { calls: number; connections: number; decisionMakers: number; meetings: number; sessions: number }>> = {};
    filteredSessions.forEach((s) => {
      const niche = s.niche?.trim() || "Sem nicho";
      const hour = format(new Date(s.startTime), "HH'h'");
      map[niche] ??= {};
      map[niche][hour] ??= { calls: 0, connections: 0, decisionMakers: 0, meetings: 0, sessions: 0 };
      const slot = map[niche][hour];
      slot.calls += s.calls;
      slot.connections += s.connections || 0;
      slot.decisionMakers += s.decisionMakers || 0;
      slot.meetings += s.meetings;
      slot.sessions += 1;
    });
    return map;
  }, [filteredSessions]);

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

  const filterLabels: Record<Filter, string> = { day: "Hoje", week: "Semana", month: "Mês" };

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          {(["day", "week", "month"] as Filter[]).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "ghost"}
              onClick={() => setFilter(f)}
              className={filter === f ? "bg-accent text-accent-foreground hover:bg-accent/90 h-7 text-xs" : "h-7 text-xs"}>
              {filterLabels[f]}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingUp className="h-3.5 w-3.5" /> Leads</div>
          <p className="text-2xl font-bold text-foreground">{filteredLeads.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Phone className="h-3.5 w-3.5" /> Ligações</div>
          <p className="text-2xl font-bold text-foreground">{totalCalls}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Users className="h-3.5 w-3.5" /> Conexões</div>
          <p className="text-2xl font-bold text-foreground">{sessionConnections}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><UserCheck className="h-3.5 w-3.5" /> Decisores</div>
          <p className="text-2xl font-bold text-foreground">{sessionDecisionMakers}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><CalendarCheck className="h-3.5 w-3.5" /> Reuniões</div>
          <p className="text-2xl font-bold text-foreground">{totalMeetings}</p>
        </CardContent></Card>
      </div>

      <FinancialHealthRow />

      <UpcomingMeetingsBlock />


      {/* Funil de Outreach (Pomodoro) */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Funil de Outreach (Pomodoro)</CardTitle></CardHeader>
        <CardContent>
          {(() => {
            // Funil de outreach por LIGAÇÃO: contadores do Pomodoro + reuniões marcadas com origem "Ligação".
            const meetingsFromCalls = Math.max(callMeetings, totalSessionMeetings);
            const outreachStages = [
              { name: "Ligações", value: sessionCalls },
              { name: "Conexões", value: sessionConnections },
              { name: "Decisores", value: sessionDecisionMakers },
              { name: "Reuniões Marcadas (Ligação)", value: meetingsFromCalls },
            ];
            const maxVal = outreachStages[0].value || 1;
            if (outreachStages.every((s) => s.value === 0)) {
              return <p className="text-sm text-muted-foreground py-8 text-center">Sem atividade de outreach no período.</p>;
            }
            return (
              <div className="space-y-1.5">
                {outreachStages.map((s, i) => {
                  const pct = maxVal > 0 ? Math.round((s.value / maxVal) * 100) : 0;
                  const prev = i > 0 ? outreachStages[i - 1].value : 0;
                  const rate = i > 0 && prev > 0 ? Math.round((s.value / prev) * 100) : null;
                  const hue = 78 + i * 20;
                  return (
                    <div key={s.name} className="flex items-center gap-2 text-xs">
                      <span className="w-40 truncate text-muted-foreground">{s.name}</span>
                      <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                        <div
                          className="h-full rounded-sm transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: `hsl(${hue} 50% ${47 - i * 2}%)` }}
                        />
                      </div>
                      <span className="w-10 text-right font-medium text-foreground tabular-nums">{s.value}</span>
                      <span className="w-24 text-[10px] text-center px-1.5 py-0.5 rounded border tabular-nums border-transparent text-muted-foreground/60">
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

      {/* Reuniões por Canal (Disparo / Instagram / Email) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Reuniões por Canal Alternativo</CardTitle>
        </CardHeader>
        <CardContent>
          {otherChannelsMeetings === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Sem reuniões marcadas por Disparo, Instagram ou Email no período.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {([
                  { key: "Disparo", icon: Send, hue: 200 },
                  { key: "Instagram", icon: Instagram, hue: 320 },
                  { key: "Email", icon: Mail, hue: 40 },
                ] as const).map(({ key, icon: Icon, hue }) => (
                  <div key={key} className="rounded-md border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Icon className="h-3.5 w-3.5" style={{ color: `hsl(${hue} 50% 55%)` }} />
                      {key}
                    </div>
                    <p className="text-2xl font-bold text-foreground tabular-nums">
                      {meetingsBySource[key] || 0}
                    </p>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                {(["Disparo", "Instagram", "Email"] as const).map((k, i) => {
                  const v = meetingsBySource[k] || 0;
                  const pct = otherChannelsMeetings > 0 ? Math.round((v / otherChannelsMeetings) * 100) : 0;
                  const hue = [200, 320, 40][i];
                  return (
                    <div key={k} className="flex items-center gap-2 text-xs">
                      <span className="w-24 truncate text-muted-foreground">{k}</span>
                      <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                        <div
                          className="h-full rounded-sm transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: `hsl(${hue} 50% 50%)` }}
                        />
                      </div>
                      <span className="w-10 text-right font-medium text-foreground tabular-nums">{v}</span>
                      <span className="w-16 text-[10px] text-right tabular-nums text-muted-foreground/70">
                        {pct}% do total
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3 pt-2 border-t border-border">
                Total de reuniões por canais alternativos: <span className="font-medium text-foreground">{otherChannelsMeetings}</span> · Ligação: <span className="font-medium text-foreground">{callMeetings}</span>
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Funil (Cold Call → Oportunidades)</CardTitle></CardHeader>
          <CardContent>
            {filteredLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem dados para o período.</p>
            ) : (
              <div className="space-y-1.5">
                {funnelData.map((item) => {
                  const maxVal = funnelData[0]?.value || 1;
                  const pct = maxVal > 0 ? Math.round((item.value / maxVal) * 100) : 0;
                  let badge: { label: string; cls: string } | null = null;
                  if (item.expectedRate != null && item.realRate != null && item.prev > 0) {
                    const diff = item.realRate - item.expectedRate;
                    const tol = item.expectedRate * 0.15; // ±15% tolerance
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
                      <span className="w-40 truncate text-muted-foreground">{item.name}</span>
                      <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                        <div className="h-full rounded-sm transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: item.fill }} />
                      </div>
                      <span className="w-10 text-right font-medium text-foreground">{item.value}</span>
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


        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Produtividade por Sessão</CardTitle></CardHeader>
          <CardContent>
            {sessionChart.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem sessões no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sessionChart}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="calls" name="Ligações" fill="hsl(216 43% 16%)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="connections" name="Conexões" fill="hsl(216 43% 30%)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="meetings" name="Reuniões" fill="hsl(78 56% 47%)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Best hours by niche */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Melhores Horários por Nicho</CardTitle></CardHeader>
        <CardContent>
          {Object.keys(nicheHourMap).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Registre sessões com nicho preenchido para ver o mapa.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(nicheHourMap).map(([niche, hours]) => {
                const sorted = Object.entries(hours)
                  .map(([hour, v]) => ({ hour, score: v.meetings * 3 + v.decisionMakers * 2 + v.connections, ...v }))
                  .sort((a, b) => b.score - a.score);
                const best = sorted[0];
                return (
                  <div key={niche} className="border-l-2 border-accent/50 pl-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-foreground">{niche}</p>
                      {best && (
                        <span className="text-xs text-accent">
                          Melhor: {best.hour} ({best.meetings}R · {best.decisionMakers}D · {best.connections}C)
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-6 sm:grid-cols-12 gap-1 text-[10px]">
                      {sorted.map((s) => (
                        <div key={s.hour} className="bg-muted/40 rounded p-1 text-center">
                          <div className="font-medium text-foreground">{s.hour}</div>
                          <div className="text-muted-foreground">{s.calls}/{s.connections}/{s.meetings}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-muted-foreground/70">Formato por horário: ligações / conexões / reuniões</p>
            </div>
          )}
        </CardContent>
      </Card>

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
  const barColor =
    pct < 30 ? "bg-red-500" : pct < 70 ? "bg-yellow-500" : "bg-accent";

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
                  <div
                    key={m.id}
                    className="flex items-center gap-3 rounded-md border border-accent/20 bg-accent/5 px-3 py-2"
                  >
                    <span className="text-sm font-semibold text-accent tabular-nums w-12">{m.time}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{m.company}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {m.contactName || "—"}
                        {m.channel ? ` · ${m.channel}` : ""}
                      </p>
                    </div>
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] px-2 py-1 rounded bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
                      >
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


