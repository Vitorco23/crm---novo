import { useState, useMemo } from "react";
import {
  getLeads, getSessions, getMovementEvents,
  COLD_CALL_STAGES, OPORTUNIDADES_STAGES,
  getGoalsSettings, getLeadsForPipeline,
} from "@/lib/store";
import { getTransactions, formatBRL, monthKey } from "@/lib/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { isToday, isThisWeek, isThisMonth, format, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, Phone, Users, UserCheck, CalendarCheck, Trophy, DollarSign, Handshake, Trophy as TrophyIcon } from "lucide-react";

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

  const filteredLeads = useMemo(() => leads.filter((l) => filterByDate(l.createdAt, filter)), [leads, filter]);
  const filteredSessions = useMemo(() => sessions.filter((s) => filterByDate(s.startTime, filter)), [sessions, filter]);
  const filteredMovements = useMemo(() => movements.filter((m) => filterByDate(m.timestamp, filter)), [movements, filter]);

  const movementCalls = filteredMovements.filter((m) => m.type === "call").length;
  const movementMeetings = filteredMovements.filter((m) => m.type === "meeting").length;

  const sessionCalls = filteredSessions.reduce((a, s) => a + s.calls, 0);
  const sessionConnections = filteredSessions.reduce((a, s) => a + (s.connections || 0), 0);
  const sessionDecisionMakers = filteredSessions.reduce((a, s) => a + (s.decisionMakers || 0), 0);
  const totalSessionMeetings = filteredSessions.reduce((a, s) => a + s.meetings, 0);

  const totalCalls = movementCalls + sessionCalls;
  const totalMeetings = movementMeetings + totalSessionMeetings;

  // Funnel across cold call + oportunidades
  const allStages = [...COLD_CALL_STAGES, ...OPORTUNIDADES_STAGES.filter((s) => s !== "Perdido")];
  const funnelData = useMemo(() => {
    return allStages.map((stage, i) => {
      const count = filteredLeads.filter((l) => {
        const idx = allStages.indexOf(l.stage as any);
        return idx >= i || l.stage === "Perdido";
      }).length;
      const hue = 78 + i * 15;
      return { name: stage, value: count || 0, fill: `hsl(${hue} 50% ${47 - i * 2}%)` };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredLeads]);

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
                  return (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <span className="w-40 truncate text-muted-foreground">{item.name}</span>
                      <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                        <div className="h-full rounded-sm transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: item.fill }} />
                      </div>
                      <span className="w-12 text-right font-medium text-foreground">{item.value}</span>
                    </div>
                  );
                })}
              </div>
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
