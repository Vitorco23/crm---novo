import { useState, useMemo } from "react";
import { getLeads, getSessions, getMovementEvents, PIPELINE_STAGES } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { isToday, isThisWeek, isThisMonth, format, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, Phone, MessageSquare, CalendarCheck, Trophy } from "lucide-react";

type Filter = "day" | "week" | "month";

const FUNNEL_COLORS = [
  "hsl(78 56% 47%)", "hsl(78 50% 50%)", "hsl(80 45% 53%)",
  "hsl(100 40% 50%)", "hsl(140 35% 48%)", "hsl(170 40% 45%)",
  "hsl(200 45% 45%)", "hsl(216 43% 30%)", "hsl(216 43% 25%)",
  "hsl(216 43% 20%)",
];

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

  const filteredLeads = useMemo(() => leads.filter((l) => filterByDate(l.createdAt, filter)), [leads, filter]);
  const filteredSessions = useMemo(() => sessions.filter((s) => filterByDate(s.startTime, filter)), [sessions, filter]);
  const filteredMovements = useMemo(() => movements.filter((m) => filterByDate(m.timestamp, filter)), [movements, filter]);

  // Movement-based totals
  const movementCalls = filteredMovements.filter((m) => m.type === "call").length;
  const movementMessages = filteredMovements.filter((m) => m.type === "message").length;

  // Session-based totals
  const sessionCalls = filteredSessions.reduce((a, s) => a + s.calls, 0);
  const sessionMessages = filteredSessions.reduce((a, s) => a + s.messages, 0);
  const totalMeetings = filteredSessions.reduce((a, s) => a + s.meetings, 0);

  // Combined totals
  const totalCalls = movementCalls + sessionCalls;
  const totalMessages = movementMessages + sessionMessages;

  // Funnel: conversion rates between stages (excluding Perdido)
  const funnelData = useMemo(() => {
    const stages = PIPELINE_STAGES.filter((s) => s !== "Perdido");
    return stages.map((stage, i) => {
      const count = filteredLeads.filter((l) => {
        const idx = PIPELINE_STAGES.indexOf(l.stage);
        const stageIdx = PIPELINE_STAGES.indexOf(stage);
        return idx >= stageIdx || l.stage === "Perdido";
      }).length;
      return { name: stage, value: count || 0, fill: FUNNEL_COLORS[i] };
    });
  }, [filteredLeads]);

  // Session chart
  const sessionChart = useMemo(() => {
    return filteredSessions.map((s) => ({
      label: format(new Date(s.startTime), "HH:mm", { locale: ptBR }),
      calls: s.calls,
      messages: s.messages,
      meetings: s.meetings,
    }));
  }, [filteredSessions]);

  // Golden Hour: cross-reference sessions with movements during that period
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
      const autoMsgsDuring = movsDuring.filter((m) => m.type === "message").length;
      return {
        ...s,
        totalActivity: s.meetings * 3 + (s.calls + autoCallsDuring) + (s.messages + autoMsgsDuring),
        autoCalls: autoCallsDuring,
        autoMsgs: autoMsgsDuring,
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

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> Leads
            </div>
            <p className="text-2xl font-bold text-foreground">{filteredLeads.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Phone className="h-3.5 w-3.5" /> Ligações
            </div>
            <p className="text-2xl font-bold text-foreground">{totalCalls}</p>
            {movementCalls > 0 && <p className="text-[10px] text-muted-foreground">{movementCalls} via pipeline</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <MessageSquare className="h-3.5 w-3.5" /> Mensagens
            </div>
            <p className="text-2xl font-bold text-foreground">{totalMessages}</p>
            {movementMessages > 0 && <p className="text-[10px] text-muted-foreground">{movementMessages} via pipeline</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <CalendarCheck className="h-3.5 w-3.5" /> Reuniões
            </div>
            <p className="text-2xl font-bold text-foreground">{totalMeetings}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Funil de Conversão</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem dados para o período.</p>
            ) : (
              <div className="space-y-1.5">
                {funnelData.map((item, i) => {
                  const maxVal = funnelData[0]?.value || 1;
                  const pct = maxVal > 0 ? Math.round((item.value / maxVal) * 100) : 0;
                  return (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <span className="w-44 truncate text-muted-foreground">{item.name}</span>
                      <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                        <div className="h-full rounded-sm transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: item.fill }} />
                      </div>
                      <span className="w-12 text-right font-medium text-foreground">{item.value} <span className="text-muted-foreground">({pct}%)</span></span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Session Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Produtividade por Sessão</CardTitle>
          </CardHeader>
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
                  <Bar dataKey="messages" name="Mensagens" fill="hsl(216 43% 30%)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="meetings" name="Reuniões" fill="hsl(78 56% 47%)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

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
                  {format(new Date(goldenHour.endTime), "HH:mm")} foi a mais produtiva:{" "}
                  <span className="font-medium text-accent">{goldenHour.meetings} reuniões</span>,{" "}
                  {goldenHour.calls + goldenHour.autoCalls} ligações, {goldenHour.messages + goldenHour.autoMsgs} mensagens.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
