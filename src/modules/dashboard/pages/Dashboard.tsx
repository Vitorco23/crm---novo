import { useMemo, useState, useEffect } from "react";
import {
  getLeads,
  getSessions,
  getMovementEvents,
  getMeetings,
  getGoalsSettings,
  getLeadsForPipeline,
} from "@/shared/services/store";
import { getTransactions, formatBRL, monthKey } from "@/modules/financeiro/services/finance";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isToday, isThisWeek, isThisMonth, isWithinInterval, format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Phone, Users, UserCheck, CalendarCheck, Trophy, DollarSign,
  Handshake, Calendar as CalendarIcon, Sparkles, Activity, Layers,
  ChevronDown, ChevronUp, BarChart3, TrendingUp, TrendingDown, Repeat, Wallet, Info
} from "lucide-react";
import StrategicIntelligencePanel, { type PeriodKey } from "@/modules/dashboard/components/StrategicIntelligencePanel";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ExportExcelDialog from "@/modules/pipeline/components/ExportExcelDialog";
import { buildDashboardSheets } from "@/modules/pipeline/services/exportBuilders";
import { cn } from "@/shared/utils/utils";
import DailyPriorities from "@/modules/dashboard/components/DailyPriorities";
import { summarizeActivity } from "@/shared/services/activityLedger";
import FinancialHealthRow from "@/modules/dashboard/components/FinancialHealthRow";

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

// --- Funil Helper ---
function getPeriodRange(filter: Filter, custom?: CustomRange): { start: Date; end: Date } {
  const now = new Date();
  if (filter === "day") return { start: new Date(new Date().setHours(0,0,0,0)), end: new Date(new Date().setHours(23,59,59,999)) };
  if (filter === "week") return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
  if (filter === "month") return { start: startOfMonth(now), end: endOfMonth(now) };
  return custom || { start: now, end: now };
}

function getPreviousPeriodRange(filter: Filter, current: { start: Date; end: Date }): { start: Date; end: Date } {
  const diff = current.end.getTime() - current.start.getTime();
  const start = new Date(current.start.getTime() - diff - 1);
  const end = new Date(current.start.getTime() - 1);
  return { start, end };
}

function OutboundFunnelCard({ filter, custom }: { filter: Filter; custom?: CustomRange }) {
  const sessions = getSessions();
  const currentRange = getPeriodRange(filter, custom);
  const previousRange = getPreviousPeriodRange(filter, currentRange);

  const aggregate = (range: { start: Date; end: Date }) => {
    const s = sessions.filter(ss => {
      const t = new Date(ss.startTime || ss.endTime).getTime();
      return t >= range.start.getTime() && t <= range.end.getTime();
    });
    const calls = s.reduce((a, b) => a + (b.calls || 0), 0);
    const conns = s.reduce((a, b) => a + (b.connections || 0), 0);
    const dms   = s.reduce((a, b) => a + (b.decisionMakers || 0), 0);
    const meets = s.reduce((a, b) => a + (b.meetings || 0), 0);
    return { calls, conns, dms, meets };
  };

  const cur = aggregate(currentRange);
  const prev = aggregate(previousRange);

  const formatDelta = (c: number, p: number) => {
    if (c + p === 0) return null;
    if (p === 0) return { dir: "up" as const, val: 100 };
    const pct = ((c - p) / p) * 100;
    return { dir: pct >= 0 ? "up" : "down", val: Math.abs(pct) };
  };

  const deltas = {
    calls: formatDelta(cur.calls, prev.calls),
    conns: formatDelta(cur.conns, prev.conns),
    dms: formatDelta(cur.dms, prev.dms),
    meets: formatDelta(cur.meets, prev.meets),
  };

  const stages = [
    { label: "Ligações", val: cur.calls, delta: deltas.calls },
    { label: "Conexões", val: cur.conns, delta: deltas.conns },
    { label: "Decisores", val: cur.dms, delta: deltas.dms },
    { label: "R1 agendadas", val: cur.meets, delta: deltas.meets },
  ];

  const max = Math.max(1, cur.calls);

  const bottleNeck = useMemo(() => {
    const rates = [
      { label: "Ligações → Conexões", val: cur.calls > 0 ? cur.conns / cur.calls : 1 },
      { label: "Conexões → Decisores", val: cur.conns > 0 ? cur.dms / cur.conns : 1 },
      { label: "Decisores → R1", val: cur.dms > 0 ? cur.meets / cur.dms : 1 },
    ];
    return rates.sort((a, b) => a.val - b.val)[0];
  }, [cur]);

  const goals = getGoalsSettings();
  const metaR1 = goals.monthlyRevenueGoal > 0 ? Math.round(goals.monthlyRevenueGoal / (goals.averageTicket || 1)) : 0;

  return (
    <Card className="border-border/40 bg-card/50">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-accent" />
          <h3 className="text-xs font-bold uppercase tracking-widest">Funil Outbound</h3>
        </div>

        <div className="space-y-4">
          {stages.map((s, i) => (
            <div key={s.label} className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground uppercase">{s.label}</span>
                  {s.delta && (
                    <span className={cn("text-[9px] flex items-center", s.delta.dir === "up" ? "text-emerald-500" : "text-rose-500")}>
                      {s.delta.dir === "up" ? <TrendingUp className="h-2 w-2 mr-0.5" /> : <TrendingDown className="h-2 w-2 mr-0.5" />}
                      {s.delta.val.toFixed(0)}%
                    </span>
                  )}
                </div>
                <span className="text-foreground">{s.val}</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-accent transition-all duration-700 rounded-full" 
                  style={{ width: `${(s.val / max) * 100}%`, opacity: 1 - (i * 0.15) }} />
              </div>
              {i > 0 && stages[i-1].val > 0 && (
                <div className="text-[9px] text-accent font-black text-right">
                  {(s.val / stages[i-1].val * 100).toFixed(1)}% de conversão
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-border/30 space-y-2 text-[10px] text-muted-foreground">
           <div className="flex justify-between items-center">
              <span>Decisores sem R1:</span>
              <div className="flex items-center gap-1">
                <span className="font-black text-foreground">{Math.max(0, cur.dms - cur.meets)}</span>
                <TooltipProvider>
                  <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 cursor-help"/>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[200px] text-[10px] bg-popover text-popover-foreground">
                          Este número representa uma diferença entre quantidades registradas. Como os Pomodoros não identificam pessoas únicas, ele pode incluir contatos repetidos.
                      </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
           </div>
           <p className="text-[9px] italic">Saldo aproximado para acompanhamento com base nos registros dos Pomodoros.</p>
        </div>

        <div className="pt-2 border-t border-border/30 space-y-1 text-[10px] font-bold">
           <div className="flex justify-between">
              <span>Principal gargalo:</span>
              <span className="text-rose-500">{bottleNeck.label} — {(bottleNeck.val * 100).toFixed(0)}%</span>
           </div>
           {metaR1 > 0 && (
             <div className="flex justify-between">
               <span>Ritmo da meta:</span>
               <span className="text-accent">{cur.meets} de {metaR1} R1 — {(cur.meets/metaR1 * 100).toFixed(0)}%</span>
             </div>
           )}
        </div>
      </CardContent>
    </Card>
  );
}

const Dashboard = () => {
  const [filter, setFilter] = useState<Filter>("day");
  const [customRange, setCustomRange] = useState<CustomRange | undefined>();
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Stats
  const leads = getLeads();
  const sessions = getSessions();
  const events = getMovementEvents();
  const meetings = getMeetings();
  const transactions = getTransactions();
  const goals = getGoalsSettings();

  const filteredLeads = leads.filter(l => filterByDate(l.createdAt, filter, customRange));
  const filteredSessions = sessions.filter(s => filterByDate(s.startTime, filter, customRange));
  const filteredEvents = events.filter(e => filterByDate(e.timestamp, filter, customRange));
  const filteredMeetings = meetings.filter(m => filterByDate(m.date, filter, customRange));

  const totalCalls = filteredSessions.reduce((sum, s) => sum + (s.calls || 0), 0);
  const totalMeetings = filteredMeetings.length;
  const totalSales = filteredEvents.filter(e => e.type === "stage_change" && e.to === "GANHO").length;
  const currentMonthRevenue = transactions.filter(t => t.kind === 'revenue' && isThisMonth(new Date(t.date))).reduce((sum, t) => sum + t.amount, 0);

  const stats = [
    { label: "Ligações", value: totalCalls, icon: Phone, color: "text-blue-500" },
    { label: "Leads Criados", value: filteredLeads.length, icon: Users, color: "text-accent" },
    { label: "Reuniões", value: totalMeetings, icon: CalendarCheck, color: "text-orange-500" },
    { label: "Vendas", value: totalSales, icon: Handshake, color: "text-emerald-500" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cockpit Operacional</h1>
          <p className="text-muted-foreground text-sm">Visão geral do desempenho comercial</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 bg-card/30 p-1.5 rounded-lg border border-border/50">
          {(Object.keys(filterLabels) as Filter[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilter(f)}
              className={cn("h-8 text-xs font-semibold px-4", filter === f && "bg-accent/20 text-accent hover:bg-accent/30")}
            >
              {filterLabels[f]}
            </Button>
          ))}
          
          {filter === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs px-3 gap-2 border-accent/30 text-accent">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {customRange ? `${format(customRange.start, "dd/MM")} - ${format(customRange.end, "dd/MM")}` : "Selecionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarUI
                  mode="range"
                  selected={customRange ? { from: customRange.start, to: customRange.end } : undefined}
                  onSelect={(range) => range?.from && range?.to && setCustomRange({ start: range.from, end: range.to })}
                  numberOfMonths={2}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          )}

          <div className="h-6 w-px bg-border/50 mx-1 hidden md:block" />

          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 text-xs px-3 gap-2 hover:bg-accent/10 hover:text-accent border-accent/20"
            onClick={() => setIsExportOpen(true)}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Exportar
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/40 bg-card/50 overflow-hidden relative">
            <CardContent className="p-4 flex flex-col gap-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black">{stat.value}</span>
                <div className={cn("p-1.5 rounded-md bg-muted/50", stat.color)}>
                  <stat.icon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <FinancialHealthRow revenue={currentMonthRevenue} goal={goals.monthlyRevenueGoal} />
          
          <StrategicIntelligencePanel filter={filter} customRange={customRange} />
          
          <Card className="border-border/40 bg-card/50">
            <CardContent className="p-0">
               <div className="p-4 border-b border-border/40 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <Activity className="h-4 w-4 text-accent" />
                   <h3 className="text-sm font-bold uppercase tracking-widest">Atividade Detalhada</h3>
                 </div>
               </div>
               <div className="p-6 h-[300px] flex flex-col items-center justify-center text-muted-foreground space-y-2">
                 <BarChart3 className="h-8 w-8 opacity-20" />
                 <p className="text-xs">Gráfico de atividade evolutiva será exibido aqui</p>
               </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <OutboundFunnelCard filter={filter} custom={customRange} />
          
          <DailyPriorities />
        </div>
      </div>

      <ExportExcelDialog 
        open={isExportOpen} 
        onOpenChange={setIsExportOpen} 
        title="Exportar Dashboard"
        onExport={(range) => buildDashboardSheets(range)}
      />
    </div>
  );
};

export default Dashboard;
