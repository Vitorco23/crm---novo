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
import { isToday, isThisWeek, isThisMonth, isWithinInterval, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Phone, Users, UserCheck, CalendarCheck, Trophy, DollarSign,
  Handshake, Calendar as CalendarIcon, Sparkles, Activity, Layers,
  ChevronDown, ChevronUp, BarChart3, TrendingUp, TrendingDown, Repeat, Wallet
} from "lucide-react";
import StrategicIntelligencePanel, { type PeriodKey } from "@/modules/dashboard/components/StrategicIntelligencePanel";
import EstimatedActivityCard from "@/modules/dashboard/components/EstimatedActivityCard";
import ExportExcelDialog from "@/modules/pipeline/components/ExportExcelDialog";
import { buildDashboardSheets } from "@/modules/pipeline/services/exportBuilders";
import { computeEfficiencyRatio, countOutcomes } from "@/modules/dashboard/services/efficiency";
import { cn } from "@/shared/utils/utils";
import DailyPriorities from "@/modules/dashboard/components/DailyPriorities";
import { summarizeActivity } from "@/shared/services/activityLedger";

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
  const [filter, setFilter] = useState<Filter>("day");
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const [showAdditional, setShowAdditional] = useState(false);

  const custom = customStart && customEnd
    ? { start: new Date(customStart.setHours(0, 0, 0, 0)), end: new Date(customEnd.setHours(23, 59, 59, 999)) }
    : undefined;

  const strategicPeriod: PeriodKey =
    filter === "day" ? "today" : filter === "week" ? "last7" : "thisMonth";

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
      {/* 1. CABEÇALHO DA PÁGINA */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Visão Geral</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest bg-accent/5 text-accent border-accent/20">
              {filterLabels[filter]}
            </Badge>
            <span className="text-[11px] text-muted-foreground font-medium">
              Performance do time comercial
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-muted/50 rounded-lg p-1 border border-border/50">
            {(["day", "week", "month", "custom"] as Filter[]).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "ghost"}
                onClick={() => setFilter(f)}
                className={cn(
                  "h-8 px-3 text-xs font-bold transition-all",
                  filter === f ? "bg-accent text-accent-foreground shadow-sm" : "text-muted-foreground"
                )}>
                {filterLabels[f]}
              </Button>
            ))}
          </div>

          {filter === "custom" && (
            <div className="flex items-center gap-1 animate-in slide-in-from-right-2 duration-300">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs font-bold gap-2 rounded-lg border-border/50">
                    <CalendarIcon className="h-3.5 w-3.5 text-accent" />
                    {customStart ? format(customStart, "dd/MM/yy") : "Início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-xl shadow-2xl border-border/50" align="start">
                  <CalendarUI mode="single" selected={customStart} onSelect={setCustomStart}
                    initialFocus className={cn("p-3 pointer-events-auto")} locale={ptBR} />
                </PopoverContent>
              </Popover>
              <span className="text-[10px] font-black text-muted-foreground/50 mx-1">/</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs font-bold gap-2 rounded-lg border-border/50">
                    <CalendarIcon className="h-3.5 w-3.5 text-accent" />
                    {customEnd ? format(customEnd, "dd/MM/yy") : "Fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-xl shadow-2xl border-border/50" align="start">
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
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 2. BLOCO PRINCIPAL — PRIORIDADES DO DIA (Col 1-8) */}
        <div className="lg:col-span-8 space-y-6">
          <section>
            <DailyPriorities />
          </section>

          {/* 4. VISÃO RESUMIDA DO FUNIL E DA AGENDA */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <PipelineCompactCard />
             <ActivityFunnelCard filter={filter} custom={custom} />
          </section>
        </div>

        {/* 3. INDICADORES ESSENCIAIS (Col 9-12) */}
        <aside className="lg:col-span-4 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-accent" />
                Performance
              </h3>
            </div>
            <EssentialMetrics filter={filter} custom={custom} />
          </section>
        </aside>
      </div>

      {/* FINANCEIRO */}
      <section className="pt-4 border-t border-border/30">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-bold tracking-tight">Saúde Financeira</h2>
        </div>
        <FinancialHealthRow />
      </section>

      {/* 5. INFORMAÇÕES SECUNDÁRIAS (Recolhível) */}
      <section className="space-y-4 pt-6">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setShowAdditional(!showAdditional)}
          className="w-full flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-all border border-dashed border-border/50 rounded-xl py-6"
        >
          {showAdditional ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span className="text-xs font-bold uppercase tracking-widest">
            {showAdditional ? "Recolher Análises Adicionais" : "Ver Análises Adicionais"}
          </span>
        </Button>

        {showAdditional && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-top-4 duration-500">
            <div className="space-y-6">
              <StrategicIntelligencePanel period={strategicPeriod} />
              <OperationalAnalysis filter={filter} custom={custom} />
            </div>
            <div className="space-y-6">
              <EstimatedActivityPanel filter={filter} custom={custom} />
              <PomodoroRankingPanel filter={filter} custom={custom} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function EssentialMetrics({ filter, custom }: { filter: Filter; custom?: CustomRange }) {
  const sessions = getSessions();
  const meetings = getMeetings();
  const allLeads = getLeads();

  const filteredSessions = useMemo(() => sessions.filter((s) => filterByDate(s.startTime, filter, custom)), [sessions, filter, custom]);
  const sessionCalls = filteredSessions.reduce((a, s) => a + s.calls, 0);

  const filteredMeetings = useMemo(
    () => meetings.filter((m) => filterByDate(`${m.date}T${m.time || "00:00"}`, filter, custom)),
    [meetings, filter, custom]
  );

  const oppLeads = getLeadsForPipeline("oportunidades");
  const negotiating = oppLeads
    .filter((l) => l.stage !== "Ganho" && l.stage !== "Perdido")
    .reduce((s, l) => s + (l.contractValue || 0), 0);

  // Atividade do ledger (Diferente da sessão manual)
  const activity = useMemo(() => {
    const now = new Date();
    let from = new Date(now); from.setHours(0, 0, 0, 0);
    let to = new Date(now); to.setHours(23, 59, 59, 999);
    if (filter === "week") { from = new Date(now); from.setDate(now.getDate() - 6); from.setHours(0, 0, 0, 0); }
    if (filter === "month") { from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0); }
    if (filter === "custom" && custom) { from = custom.start; to = custom.end; }
    return summarizeActivity(from, to);
  }, [filter, custom]);

  return (
    <div className="grid grid-cols-1 gap-3">
      <MetricCard 
        icon={Phone} 
        label="Ligações" 
        value={activity.byChannel.call} 
        description="Registradas pelo sistema"
      />
      <MetricCard 
        icon={CalendarCheck} 
        label="Reuniões" 
        value={filteredMeetings.length} 
        description={filterLabels[filter]}
      />
      <MetricCard 
        icon={Handshake} 
        label="Em Negociação" 
        value={formatBRL(negotiating)} 
        description="Valor no pipeline"
      />
      <MetricCard 
        icon={Users} 
        label="Leads Ativos" 
        value={allLeads.length} 
        description="Total na base"
      />
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, description }: { icon: any; label: string; value: string | number; description: string }) {
  return (
    <Card className="border-border/40 shadow-sm bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-accent/5 border border-accent/10 flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-accent" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 mb-0.5">{label}</p>
            <p className="text-lg font-black text-foreground tabular-nums leading-none truncate">{value}</p>
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground font-medium text-right shrink-0">
          {description}
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineCompactCard() {
  const leads = getLeads();
  const distribution = useMemo(() => {
    const opps = ["Reunião Marcada", "Reunião Realizada", "Proposta Enviada", "Ganho"];
    return opps.map((s) => ({
      name: s,
      value: leads.filter((l) => l.stage === s).length,
    }));
  }, [leads]);

  const max = Math.max(1, ...distribution.map(d => d.value));

  return (
    <Card className="border-border/40 bg-card/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="h-3.5 w-3.5 text-accent" />
          <h3 className="text-xs font-bold uppercase tracking-widest">Pipeline Ativo</h3>
        </div>
        <div className="space-y-3">
          {distribution.map((d, i) => (
            <div key={d.name} className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span className="text-muted-foreground uppercase">{d.name}</span>
                <span className="text-foreground">{d.value}</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent transition-all duration-700 rounded-full" 
                  style={{ width: `${(d.value / max) * 100}%`, opacity: 1 - (i * 0.15) }} 
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityFunnelCard({ filter, custom }: { filter: Filter; custom?: CustomRange }) {
  const sessions = getSessions();
  const filteredSessions = useMemo(() => sessions.filter((s) => filterByDate(s.startTime, filter, custom)), [sessions, filter, custom]);
  
  const calls = filteredSessions.reduce((a, s) => a + s.calls, 0);
  const connections = filteredSessions.reduce((a, s) => a + (s.connections || 0), 0);
  const meetings = filteredSessions.reduce((a, s) => a + s.meetings, 0);

  const stages = [
    { label: "Ligações", value: calls },
    { label: "Conexões", value: connections },
    { label: "Reuniões", value: meetings },
  ];

  const max = Math.max(1, calls);

  return (
    <Card className="border-border/40 bg-card/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-3.5 w-3.5 text-accent" />
          <h3 className="text-xs font-bold uppercase tracking-widest">Conversão Outreach</h3>
        </div>
        <div className="space-y-3">
          {stages.map((s, i) => (
            <div key={s.label} className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span className="text-muted-foreground uppercase">{s.label}</span>
                <span className="text-foreground">{s.value}</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent transition-all duration-700 rounded-full" 
                  style={{ width: `${(s.value / max) * 100}%`, opacity: 1 - (i * 0.2) }} 
                />
              </div>
              {i > 0 && stages[i-1].value > 0 && (
                <div className="text-[9px] text-accent font-black text-right">
                  {Math.round((s.value / stages[i-1].value) * 100)}% de conversão
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Subcomponentes para a área secundária (reutilizam lógica do original simplificada)
function OperationalAnalysis({ filter, custom }: { filter: Filter; custom?: CustomRange }) {
    // Implementação básica do OperationalPanel (antes perdido)
    const sessions = getSessions();
    const filteredSessions = useMemo(() => sessions.filter((s) => filterByDate(s.startTime, filter, custom)), [sessions, filter, custom]);
    
    const stats = useMemo(() => {
        const totalCalls = filteredSessions.reduce((a, s) => a + s.calls, 0);
        const totalConns = filteredSessions.reduce((a, s) => a + (s.connections || 0), 0);
        const totalMeets = filteredSessions.reduce((a, s) => a + s.meetings, 0);
        const totalTime = filteredSessions.reduce((a, s) => a + (s.duration || 0), 0);
        return { totalCalls, totalConns, totalMeets, totalTime };
    }, [filteredSessions]);

    return (
        <Card className="border-border/40 bg-card/50">
            <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                    <Activity className="h-3.5 w-3.5 text-accent" />
                    <h3 className="text-xs font-bold uppercase tracking-widest">Análise Operacional</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Total Chamadas</p>
                        <p className="text-xl font-black">{stats.totalCalls}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Conexões</p>
                        <p className="text-xl font-black">{stats.totalConns}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Reuniões</p>
                        <p className="text-xl font-black">{stats.totalMeets}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Minutos Foco</p>
                        <p className="text-xl font-black">{stats.totalTime}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function EstimatedActivityPanel({ filter, custom }: { filter: Filter; custom?: CustomRange }) {
    const now = new Date();
    let from = new Date(now); from.setHours(0, 0, 0, 0);
    let to = new Date(now); to.setHours(23, 59, 59, 999);
    if (filter === "week") { from = new Date(now); from.setDate(now.getDate() - 6); from.setHours(0, 0, 0, 0); }
    if (filter === "month") { from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0); }
    if (filter === "custom" && custom) { from = custom.start; to = custom.end; }
    return <EstimatedActivityCard from={from} to={to} periodLabel={filterLabels[filter]} />;
}

function PomodoroRankingPanel({ filter, custom }: { filter: Filter; custom?: CustomRange }) {
    const sessions = getSessions();
    const filteredSessions = useMemo(() => sessions.filter((s) => filterByDate(s.startTime, filter, custom)), [sessions, filter, custom]);
    
    // Implementação básica do PomodoroRanking
    const ranking = useMemo(() => {
        const users = new Map<string, { calls: number; sessions: number }>();
        filteredSessions.forEach(s => {
            const current = users.get(s.userName || "Vendedor") || { calls: 0, sessions: 0 };
            users.set(s.userName || "Vendedor", {
                calls: current.calls + s.calls,
                sessions: current.sessions + 1
            });
        });
        return Array.from(users.entries()).sort((a, b) => b[1].calls - a[1].calls);
    }, [filteredSessions]);

    return (
        <Card className="border-border/40 bg-card/50">
            <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                    <Trophy className="h-3.5 w-3.5 text-accent" />
                    <h3 className="text-xs font-bold uppercase tracking-widest">Ranking de Foco</h3>
                </div>
                <div className="space-y-3">
                    {ranking.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Nenhuma sessão no período.</p>
                    ) : (
                        ranking.map(([name, data], i) => (
                            <div key={name} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-accent w-4">#{i+1}</span>
                                    <span className="text-xs font-bold">{name}</span>
                                </div>
                                <div className="text-right">
                                    <p className="text-[11px] font-black">{data.calls} calls</p>
                                    <p className="text-[9px] text-muted-foreground uppercase">{data.sessions} sessões</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function FinancialHealthRow() {
    const txs = getTransactions();
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    const monthTxs = useMemo(() => txs.filter(t => monthKey(t.date) === currentMonth), [txs]);
    const revenue = monthTxs.filter(t => t.kind === "revenue").reduce((a, b) => a + b.amount, 0);
    const expenses = monthTxs.filter(t => t.kind === "expense").reduce((a, b) => a + b.amount, 0);
    const profit = revenue - expenses;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-border/40 bg-card/50">
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <TrendingUp className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Entradas</p>
                        <p className="text-lg font-black text-emerald-500">{formatBRL(revenue)}</p>
                    </div>
                </CardContent>
            </Card>
            <Card className="border-border/40 bg-card/50">
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                        <TrendingDown className="h-5 w-5 text-rose-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Saídas</p>
                        <p className="text-lg font-black text-rose-500">{formatBRL(expenses)}</p>
                    </div>
                </CardContent>
            </Card>
            <Card className="border-border/40 bg-card/50">
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                        <Wallet className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Lucro</p>
                        <p className={`text-lg font-black ${profit >= 0 ? "text-accent" : "text-rose-500"}`}>{formatBRL(profit)}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}


