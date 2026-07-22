import { createContext, useContext, useMemo, useState, ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Brain, Clock, FlaskConical, MapPin, Building2, Megaphone, TrendingUp,
  Calendar as CalendarIcon, User, Filter,
} from "lucide-react";
import {
  getSessions, getLeads, getMovementEvents, getMeetings, getStagesForPipeline,
  type PomodoroSession, type Lead, type MovementEvent, type Meeting,
} from "@/lib/store";

// ============================================================
// FILTROS GLOBAIS
// ============================================================

type PeriodPreset =
  | "today" | "last7" | "last30" | "last90"
  | "thisMonth" | "lastMonth" | "custom";

interface DateRange { start: Date; end: Date }

interface Filters {
  period: PeriodPreset;
  customStart?: Date;
  customEnd?: Date;
  responsible: string; // "all" | "me" | <userId futuro>
  niche: string;       // "all" | <niche>
  campaign: string;    // "all" | "<city>||<niche>"
}

interface FiltersCtx {
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  range: DateRange;
  niches: string[];
  campaigns: { key: string; label: string }[];
  // Datasets já filtrados (por período + nicho + campanha + responsável)
  leads: Lead[];
  sessions: PomodoroSession[];
  events: MovementEvent[];
  meetings: Meeting[];
}

const Ctx = createContext<FiltersCtx | null>(null);
const useFilters = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFilters fora de FiltersProvider");
  return c;
};

function resolveRange(f: Filters): DateRange {
  const now = new Date();
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  switch (f.period) {
    case "today": return { start, end };
    case "last7":  start.setDate(start.getDate() - 6); return { start, end };
    case "last30": start.setDate(start.getDate() - 29); return { start, end };
    case "last90": start.setDate(start.getDate() - 89); return { start, end };
    case "thisMonth":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
    case "lastMonth": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: s, end: e };
    }
    case "custom": {
      const s = f.customStart ? new Date(f.customStart) : start;
      const e = f.customEnd ? new Date(f.customEnd) : end;
      s.setHours(0, 0, 0, 0); e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }
  }
}

function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<Filters>({
    period: "last30", responsible: "all", niche: "all", campaign: "all",
  });
  const setFilters = (patch: Partial<Filters>) =>
    setFiltersState((prev) => ({ ...prev, ...patch }));

  const value = useMemo<FiltersCtx>(() => {
    const range = resolveRange(filters);
    const allLeads = getLeads();
    const allSessions = getSessions();
    const allEvents = getMovementEvents();
    const allMeetings = getMeetings();

    const niches = Array.from(
      new Set(allLeads.map((l) => (l.niche || "").trim()).filter(Boolean))
    ).sort();

    const campaignMap = new Map<string, string>();
    for (const l of allLeads) {
      const city = (l.city || "").trim();
      const niche = (l.niche || "").trim();
      if (!city || !niche) continue;
      const key = `${city}||${niche}`;
      if (!campaignMap.has(key)) campaignMap.set(key, `${niche} — ${city}`);
    }
    const campaigns = [...campaignMap.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    // Predicate helpers
    const inRange = (iso: string) => {
      const t = new Date(iso).getTime();
      return !isNaN(t) && t >= range.start.getTime() && t <= range.end.getTime();
    };
    const leadMatchesSegment = (l: Lead | undefined) => {
      if (!l) return false;
      if (filters.niche !== "all" && (l.niche || "").trim() !== filters.niche) return false;
      if (filters.campaign !== "all") {
        const [city, niche] = filters.campaign.split("||");
        if ((l.city || "").trim() !== city || (l.niche || "").trim() !== niche) return false;
      }
      return true;
    };
    const leadById = new Map(allLeads.map((l) => [l.id, l]));

    const leads = allLeads.filter((l) => leadMatchesSegment(l) && inRange(l.createdAt));

    const sessions = allSessions.filter((s) => {
      if (!inRange(s.startTime)) return false;
      if (filters.niche !== "all" && (s.niche || "").trim() !== filters.niche) return false;
      // Pomodoro não tem cidade — quando campanha for filtro, só aplica o nicho parte
      if (filters.campaign !== "all") {
        const [, niche] = filters.campaign.split("||");
        if ((s.niche || "").trim() !== niche) return false;
      }
      return true;
    });

    const events = allEvents.filter((e) => {
      if (!inRange(e.timestamp)) return false;
      return leadMatchesSegment(leadById.get(e.leadId));
    });

    const meetings = allMeetings.filter((m) => {
      const iso = `${m.date}T${m.time || "00:00"}:00`;
      if (!inRange(iso)) return false;
      return leadMatchesSegment(leadById.get(m.leadId));
    });

    return {
      filters, setFilters, range, niches, campaigns,
      leads, sessions, events, meetings,
    };
  }, [filters]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ============================================================
// UI: BARRA DE FILTROS
// ============================================================

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje",
  last7: "Últimos 7 dias",
  last30: "Últimos 30 dias",
  last90: "Últimos 90 dias",
  thisMonth: "Este mês",
  lastMonth: "Mês anterior",
  custom: "Personalizado",
};

function FiltersBar() {
  const { filters, setFilters, niches, campaigns, range } = useFilters();
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR");

  return (
    <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-background/95 backdrop-blur border-b">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground mr-1">
          <Filter className="h-3.5 w-3.5" /> Filtros
        </div>

        <Select value={filters.period} onValueChange={(v) => setFilters({ period: v as PeriodPreset })}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <CalendarIcon className="h-3.5 w-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => (
              <SelectItem key={p} value={p} className="text-xs">{PERIOD_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filters.period === "custom" && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  {filters.customStart ? fmt(filters.customStart) : "Início"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filters.customStart}
                  onSelect={(d) => d && setFilters({ customStart: d })} />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  {filters.customEnd ? fmt(filters.customEnd) : "Fim"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filters.customEnd}
                  onSelect={(d) => d && setFilters({ customEnd: d })} />
              </PopoverContent>
            </Popover>
          </>
        )}

        <Select value={filters.responsible} onValueChange={(v) => setFilters({ responsible: v })}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <User className="h-3.5 w-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todos</SelectItem>
            <SelectItem value="me" className="text-xs">Meu usuário</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.niche} onValueChange={(v) => setFilters({ niche: v })}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue placeholder="Nicho" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todos os nichos</SelectItem>
            {niches.map((n) => (
              <SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.campaign} onValueChange={(v) => setFilters({ campaign: v })}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue placeholder="Campanha" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todas as campanhas</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto text-[11px] text-muted-foreground">
          {range.start.toLocaleDateString("pt-BR")} — {range.end.toLocaleDateString("pt-BR")}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TIPOS/HELPERS DE ANÁLISE
// ============================================================

const MIN_SAMPLE = 30;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const dash = "—";

interface AnalysisRow {
  key: string; label: string;
  leads?: number; calls: number;
  connections?: number; decisionMakers?: number;
  meetings: number; remaining?: number;
  connRate?: number; dmRate?: number; meetingRate: number;
  sufficient: boolean;
}

interface ColumnDef {
  header: string;
  render: (r: AnalysisRow) => React.ReactNode;
  align?: "left" | "right";
}

function finalizeRates(r: AnalysisRow): AnalysisRow {
  const calls = r.calls || 0;
  const conns = r.connections || 0;
  r.connRate = calls > 0 && r.connections !== undefined ? (conns / calls) * 100 : undefined;
  r.dmRate = conns > 0 && r.decisionMakers !== undefined
    ? ((r.decisionMakers || 0) / conns) * 100 : undefined;
  r.meetingRate = calls > 0 ? (r.meetings / calls) * 100 : 0;
  r.sufficient = calls >= MIN_SAMPLE;
  return r;
}

function sortRows(rows: AnalysisRow[]): AnalysisRow[] {
  return [...rows].sort((a, b) => {
    if (a.sufficient !== b.sufficient) return a.sufficient ? -1 : 1;
    if (b.meetingRate !== a.meetingRate) return b.meetingRate - a.meetingRate;
    return b.calls - a.calls;
  });
}

function AnalysisCard({
  icon, title, description, rows, columns, summaryLabel,
  emptyMessage = "Ainda não existem dados suficientes para uma conclusão confiável.",
}: {
  icon: React.ReactNode; title: string; description: string;
  rows: AnalysisRow[]; columns: ColumnDef[]; summaryLabel: string;
  emptyMessage?: string;
}) {
  const best = rows.find((r) => r.sufficient);
  return (
    <Card className="border-l-4 border-l-accent">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-md bg-accent/15 text-accent flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border bg-muted/30 p-4">
          {best ? (
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-accent mt-0.5" />
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{summaryLabel}</div>
                <div className="text-xl font-semibold mt-0.5">{best.label}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Taxa de reuniões: <span className="text-foreground font-medium">{fmtPct(best.meetingRate)}</span>
                  {" · "}Base: <span className="text-foreground font-medium">{best.calls} ligações</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{emptyMessage}</div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                {columns.map((c, i) => (
                  <th key={i} className={`py-2 pr-4 ${c.align === "right" ? "text-right" : "text-left"}`}>
                    {c.header}
                  </th>
                ))}
                <th className="py-2 text-right">Confiabilidade</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="py-6 text-center text-sm text-muted-foreground">
                    Sem dados no período/segmento selecionado.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.key} className="border-b last:border-b-0">
                  {columns.map((c, i) => (
                    <td key={i}
                      className={`py-2 pr-4 ${c.align === "right" ? "text-right tabular-nums" : ""} ${i === 0 ? "font-medium" : "text-muted-foreground"}`}>
                      {c.render(r)}
                    </td>
                  ))}
                  <td className="py-2 text-right">
                    {r.sufficient
                      ? <Badge variant="outline" className="text-[10px]">OK</Badge>
                      : <Badge variant="secondary" className="text-[10px]">Amostra insuficiente</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Registros com menos de {MIN_SAMPLE} ligações são exibidos, mas não são considerados como referência confiável até acumularem mais dados.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
// MÓDULOS (consomem dados já filtrados via useFilters)
// ============================================================

function HoursModule() {
  const { sessions } = useFilters();
  const rows = useMemo(() => {
    const map = new Map<number, AnalysisRow>();
    for (let h = 8; h <= 18; h++) {
      map.set(h, {
        key: String(h),
        label: `${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00`,
        calls: 0, connections: 0, decisionMakers: 0, meetings: 0,
        meetingRate: 0, sufficient: false,
      });
    }
    for (const s of sessions) {
      const d = new Date(s.startTime); if (isNaN(d.getTime())) continue;
      const b = map.get(d.getHours()); if (!b) continue;
      b.calls += s.calls || 0;
      b.connections = (b.connections || 0) + (s.connections || 0);
      b.decisionMakers = (b.decisionMakers || 0) + (s.decisionMakers || 0);
      b.meetings += s.meetings || 0;
    }
    return sortRows([...map.values()].map(finalizeRates));
  }, [sessions]);

  return (
    <AnalysisCard
      icon={<Clock className="h-5 w-5" />}
      title="Análise de Horários"
      description="Desempenho por faixa de horário com base nas sessões de prospecção do período."
      summaryLabel="Melhor horário no período"
      rows={rows}
      columns={[
        { header: "Faixa", render: (r) => r.label },
        { header: "Ligações", align: "right", render: (r) => r.calls },
        { header: "Conexões", align: "right", render: (r) => r.connections ?? dash },
        { header: "Decisores", align: "right", render: (r) => r.decisionMakers ?? dash },
        { header: "Reuniões", align: "right", render: (r) => r.meetings },
        { header: "Tx. Conexão", align: "right", render: (r) => r.connRate !== undefined ? fmtPct(r.connRate) : dash },
        { header: "Tx. Decisores", align: "right", render: (r) => r.dmRate !== undefined ? fmtPct(r.dmRate) : dash },
        { header: "Tx. Reuniões", align: "right", render: (r) => r.calls > 0 ? fmtPct(r.meetingRate) : dash },
      ]}
    />
  );
}

function CityModule() {
  const { leads, events, meetings } = useFilters();
  const rows = useMemo(() => {
    const leadById = new Map(leads.map((l) => [l.id, l]));
    const map = new Map<string, AnalysisRow>();
    const ensure = (city: string) => {
      const key = city || "(sem cidade)";
      if (!map.has(key)) map.set(key, {
        key, label: key, leads: 0, calls: 0, meetings: 0,
        meetingRate: 0, sufficient: false,
      });
      return map.get(key)!;
    };
    for (const l of leads) ensure((l.city || "").trim()).leads! += 1;
    for (const e of events.filter((x) => x.type === "call")) {
      const l = leadById.get(e.leadId); if (!l) continue;
      ensure((l.city || "").trim()).calls += 1;
    }
    for (const m of meetings) {
      const l = leadById.get(m.leadId); if (!l) continue;
      ensure((l.city || "").trim()).meetings += 1;
    }
    return sortRows([...map.values()].map(finalizeRates));
  }, [leads, events, meetings]);

  return (
    <AnalysisCard
      icon={<MapPin className="h-5 w-5" />}
      title="Análise por Cidade"
      description="Desempenho comercial agrupado por cidade dos leads."
      summaryLabel="Cidade com melhor desempenho no período"
      rows={rows}
      columns={[
        { header: "Cidade", render: (r) => r.label },
        { header: "Leads", align: "right", render: (r) => r.leads ?? 0 },
        { header: "Ligações", align: "right", render: (r) => r.calls },
        { header: "Reuniões", align: "right", render: (r) => r.meetings },
        { header: "Tx. Reuniões", align: "right", render: (r) => r.calls > 0 ? fmtPct(r.meetingRate) : dash },
      ]}
    />
  );
}

function NicheModule() {
  const { leads, sessions, events, meetings } = useFilters();
  const rows = useMemo(() => {
    const leadById = new Map(leads.map((l) => [l.id, l]));
    const map = new Map<string, AnalysisRow>();
    const ensure = (niche: string) => {
      const key = niche || "(sem nicho)";
      if (!map.has(key)) map.set(key, {
        key, label: key, leads: 0, calls: 0, connections: 0, decisionMakers: 0,
        meetings: 0, meetingRate: 0, sufficient: false,
      });
      return map.get(key)!;
    };
    for (const l of leads) ensure((l.niche || "").trim()).leads! += 1;
    for (const s of sessions) {
      const key = (s.niche || "").trim(); if (!key) continue;
      const row = ensure(key);
      row.calls += s.calls || 0;
      row.connections = (row.connections || 0) + (s.connections || 0);
      row.decisionMakers = (row.decisionMakers || 0) + (s.decisionMakers || 0);
      row.meetings += s.meetings || 0;
    }
    const nichesWithSessions = new Set(sessions.map((s) => (s.niche || "").trim()).filter(Boolean));
    for (const e of events.filter((x) => x.type === "call")) {
      const l = leadById.get(e.leadId); if (!l) continue;
      const key = (l.niche || "").trim();
      if (nichesWithSessions.has(key)) continue;
      ensure(key).calls += 1;
    }
    for (const m of meetings) {
      const l = leadById.get(m.leadId); if (!l) continue;
      const key = (l.niche || "").trim();
      if (nichesWithSessions.has(key)) continue;
      ensure(key).meetings += 1;
    }
    return sortRows([...map.values()].map(finalizeRates));
  }, [leads, sessions, events, meetings]);

  return (
    <AnalysisCard
      icon={<Building2 className="h-5 w-5" />}
      title="Análise por Nicho"
      description="Desempenho comercial agrupado por nicho de mercado."
      summaryLabel="Nicho com melhor desempenho no período"
      rows={rows}
      columns={[
        { header: "Nicho", render: (r) => r.label },
        { header: "Leads", align: "right", render: (r) => r.leads ?? 0 },
        { header: "Ligações", align: "right", render: (r) => r.calls },
        { header: "Conexões", align: "right", render: (r) => r.connections ?? dash },
        { header: "Decisores", align: "right", render: (r) => r.decisionMakers ?? dash },
        { header: "Reuniões", align: "right", render: (r) => r.meetings },
        { header: "Tx. Conexão", align: "right", render: (r) => r.connRate !== undefined ? fmtPct(r.connRate) : dash },
        { header: "Tx. Reuniões", align: "right", render: (r) => r.calls > 0 ? fmtPct(r.meetingRate) : dash },
      ]}
    />
  );
}

function CampaignModule() {
  const { leads, events, meetings } = useFilters();
  const rows = useMemo(() => {
    const leadById = new Map(leads.map((l) => [l.id, l]));
    const coldStages = new Set(getStagesForPipeline("cold_call"));
    const map = new Map<string, AnalysisRow>();
    const ensure = (city: string, niche: string) => {
      const key = `${city}||${niche}`;
      if (!map.has(key)) map.set(key, {
        key, label: `${niche || "(sem nicho)"} — ${city || "(sem cidade)"}`,
        leads: 0, calls: 0, meetings: 0, remaining: 0,
        meetingRate: 0, sufficient: false,
      });
      return map.get(key)!;
    };
    for (const l of leads) {
      const row = ensure((l.city || "").trim(), (l.niche || "").trim());
      row.leads! += 1;
      if (coldStages.has(l.stage) && l.stage === "Novo Lead") row.remaining! += 1;
    }
    for (const e of events.filter((x) => x.type === "call")) {
      const l = leadById.get(e.leadId); if (!l) continue;
      ensure((l.city || "").trim(), (l.niche || "").trim()).calls += 1;
    }
    for (const m of meetings) {
      const l = leadById.get(m.leadId); if (!l) continue;
      ensure((l.city || "").trim(), (l.niche || "").trim()).meetings += 1;
    }
    const rows = [...map.values()]
      .filter((r) => (r.leads || 0) > 0 || r.calls > 0)
      .map(finalizeRates);
    return sortRows(rows);
  }, [leads, events, meetings]);

  return (
    <AnalysisCard
      icon={<Megaphone className="h-5 w-5" />}
      title="Análise por Campanha"
      description="Desempenho por campanha (par Cidade + Nicho)."
      summaryLabel="Campanha mais eficiente no período"
      rows={rows}
      columns={[
        { header: "Campanha", render: (r) => r.label },
        { header: "Leads", align: "right", render: (r) => r.leads ?? 0 },
        { header: "Ligações", align: "right", render: (r) => r.calls },
        { header: "Reuniões", align: "right", render: (r) => r.meetings },
        { header: "Tx. Conversão", align: "right", render: (r) => r.calls > 0 ? fmtPct(r.meetingRate) : dash },
        { header: "Restantes", align: "right", render: (r) => r.remaining ?? 0 },
      ]}
    />
  );
}

// ============================================================
// PÁGINA
// ============================================================

export default function InteligenciaComercial() {
  return (
    <FiltersProvider>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <header className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-md bg-accent/15 text-accent flex items-center justify-center">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Inteligência Comercial</h1>
            <p className="text-sm text-muted-foreground">
              Análises históricas e comparativas para apoiar decisões estratégicas da operação.
            </p>
          </div>
        </header>

        <FiltersBar />

        <section className="grid gap-4">
          <HoursModule />
          <CityModule />
          <NicheModule />
          <CampaignModule />

          <Card className="border-l-4 border-l-muted">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                  <FlaskConical className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Teste A/B de Scripts</CardTitle>
                  <CardDescription>
                    Compare variações de script de abordagem para identificar qual gera mais conexões, decisores e reuniões.
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">Em breve</Badge>
            </CardHeader>
          </Card>
        </section>
      </div>
    </FiltersProvider>
  );
}
