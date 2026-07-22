import {
  createContext, useContext, useMemo, useState, ReactNode, useCallback,
} from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Brain, Clock, FlaskConical, MapPin, Building2, Megaphone, TrendingUp,
  Calendar as CalendarIcon, User, Filter, Search, Lightbulb, AlertTriangle,
  ArrowUpDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  getSessions, getLeads, getMovementEvents, getMeetings,
  type PomodoroSession, type Lead, type MovementEvent, type Meeting,
} from "@/lib/store";
import InsightsPanel from "@/components/InsightsPanel";

// ============================================================
// NORMALIZAÇÃO (não altera dados originais — apenas p/ análise)
// ============================================================

/** Chave canônica: sem acento, sem caixa, sem espaço duplicado. */
function norm(s: string | undefined | null): string {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Detecta se o "nicho" está no formato de campanha "NICHO - CIDADE". */
const CAMPAIGN_SPLIT = /\s+[-–—]\s+/;
function parseNicheField(niche: string, cityFallback: string) {
  const raw = (niche || "").trim();
  if (!raw) return { niche: "", cityFromCampaign: "" };
  if (CAMPAIGN_SPLIT.test(raw)) {
    const [n, c] = raw.split(CAMPAIGN_SPLIT);
    return { niche: (n || "").trim(), cityFromCampaign: (c || "").trim() };
  }
  return { niche: raw, cityFromCampaign: "" };
  void cityFallback;
}

/** Retorna cidade e nicho "lógicos" (aplicando parsing + normalização de display). */
function resolveSegments(lead: Lead) {
  const parsed = parseNicheField(lead.niche || "", lead.city || "");
  const cityDisplay = (lead.city || "").trim() || parsed.cityFromCampaign;
  const nicheDisplay = parsed.niche;
  return {
    cityKey: norm(cityDisplay),
    cityDisplay,
    nicheKey: norm(nicheDisplay),
    nicheDisplay,
    campaignKey: `${norm(nicheDisplay)}||${norm(cityDisplay)}`,
    campaignDisplay:
      nicheDisplay && cityDisplay ? `${nicheDisplay} — ${cityDisplay}` :
      nicheDisplay || cityDisplay || "(sem campanha)",
  };
}

// ============================================================
// CONFIABILIDADE (centralizada)
// ============================================================

const CONFIDENCE_THRESHOLDS = { medium: 30, high: 100 };
type Confidence = "high" | "medium" | "low";
function confidenceLevel(calls: number): Confidence {
  if (calls >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (calls >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}
const CONFIDENCE_META: Record<Confidence, { color: string; label: string; dot: string }> = {
  high:   { color: "text-emerald-500", label: "Alta confiança",  dot: "🟢" },
  medium: { color: "text-amber-500",   label: "Média confiança", dot: "🟡" },
  low:    { color: "text-rose-500",    label: "Baixa confiança", dot: "🔴" },
};

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
  responsible: string;
  niche: string;    // "all" | normKey
  campaign: string; // "all" | campaignKey
}

interface FiltersCtx {
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  range: DateRange;
  niches: { key: string; label: string }[];
  campaigns: { key: string; label: string }[];
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
  const setFilters = useCallback(
    (patch: Partial<Filters>) => setFiltersState((prev) => ({ ...prev, ...patch })),
    []
  );

  const value = useMemo<FiltersCtx>(() => {
    const range = resolveRange(filters);
    const allLeads = getLeads();
    const allSessions = getSessions();
    const allEvents = getMovementEvents();
    const allMeetings = getMeetings();

    // Opções de nicho e campanha (canônicas)
    const nicheMap = new Map<string, string>();
    const campaignMap = new Map<string, string>();
    for (const l of allLeads) {
      const seg = resolveSegments(l);
      if (seg.nicheKey && !nicheMap.has(seg.nicheKey)) nicheMap.set(seg.nicheKey, seg.nicheDisplay);
      if (seg.nicheKey && seg.cityKey && !campaignMap.has(seg.campaignKey))
        campaignMap.set(seg.campaignKey, seg.campaignDisplay);
    }
    const niches = [...nicheMap.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const campaigns = [...campaignMap.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const inRange = (iso: string) => {
      const t = new Date(iso).getTime();
      return !isNaN(t) && t >= range.start.getTime() && t <= range.end.getTime();
    };
    const matchesSegment = (l: Lead | undefined) => {
      if (!l) return false;
      const seg = resolveSegments(l);
      if (filters.niche !== "all" && seg.nicheKey !== filters.niche) return false;
      if (filters.campaign !== "all" && seg.campaignKey !== filters.campaign) return false;
      return true;
    };
    const leadById = new Map(allLeads.map((l) => [l.id, l]));

    const leads = allLeads.filter((l) => matchesSegment(l) && inRange(l.createdAt));

    const sessions = allSessions.filter((s) => {
      if (!inRange(s.startTime)) return false;
      if (filters.niche !== "all") {
        const p = parseNicheField(s.niche || "", "");
        if (norm(p.niche) !== filters.niche) return false;
      }
      if (filters.campaign !== "all") {
        const [nicheKey] = filters.campaign.split("||");
        const p = parseNicheField(s.niche || "", "");
        if (norm(p.niche) !== nicheKey) return false;
      }
      return true;
    });

    const events = allEvents.filter((e) => inRange(e.timestamp) && matchesSegment(leadById.get(e.leadId)));
    const meetings = allMeetings.filter((m) => {
      const iso = `${m.date}T${m.time || "00:00"}:00`;
      return inRange(iso) && matchesSegment(leadById.get(m.leadId));
    });

    return { filters, setFilters, range, niches, campaigns, leads, sessions, events, meetings };
  }, [filters, setFilters]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ============================================================
// UI: BARRA DE FILTROS
// ============================================================

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje", last7: "Últimos 7 dias", last30: "Últimos 30 dias",
  last90: "Últimos 90 dias", thisMonth: "Este mês", lastMonth: "Mês anterior",
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
            <CalendarIcon className="h-3.5 w-3.5 mr-1" /><SelectValue />
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
            <User className="h-3.5 w-3.5 mr-1" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todos</SelectItem>
            <SelectItem value="me" className="text-xs">Meu usuário</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.niche} onValueChange={(v) => setFilters({ niche: v })}>
          <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Nicho" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todos os nichos</SelectItem>
            {niches.map((n) => (
              <SelectItem key={n.key} value={n.key} className="text-xs">{n.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.campaign} onValueChange={(v) => setFilters({ campaign: v })}>
          <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue placeholder="Campanha" /></SelectTrigger>
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

const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const dash = "—";

interface AnalysisRow {
  key: string; label: string;
  leads?: number; calls: number;
  connections?: number; decisionMakers?: number;
  meetings: number; remaining?: number;
  connRate?: number; dmRate?: number; meetingRate: number;
  confidence: Confidence;
}

type SortKey = "meetingRate" | "connRate" | "meetings" | "calls";
const SORT_LABELS: Record<SortKey, string> = {
  meetingRate: "Maior taxa de reuniões",
  connRate: "Maior taxa de conexão",
  meetings: "Maior quantidade de reuniões",
  calls: "Maior quantidade de ligações",
};

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
  r.confidence = confidenceLevel(calls);
  return r;
}

function sortRowsBy(rows: AnalysisRow[], key: SortKey): AnalysisRow[] {
  const val = (r: AnalysisRow) => {
    if (key === "meetingRate") return r.meetingRate;
    if (key === "connRate") return r.connRate ?? -1;
    return r[key] as number;
  };
  return [...rows].sort((a, b) => {
    // Prioriza amostras não-baixa
    const aLow = a.confidence === "low" ? 1 : 0;
    const bLow = b.confidence === "low" ? 1 : 0;
    if (aLow !== bLow) return aLow - bLow;
    return val(b) - val(a);
  });
}

function ConfidenceDot({ level }: { level: Confidence }) {
  const m = CONFIDENCE_META[level];
  return (
    <span title={m.label} className={`inline-block text-xs ${m.color}`}>{m.dot}</span>
  );
}

// ============================================================
// INSIGHT GENERATOR
// ============================================================

function buildInsight(entity: string, rows: AnalysisRow[]): string {
  const usable = rows.filter((r) => r.confidence !== "low");
  if (usable.length === 0) return "Ainda não existem dados suficientes para gerar um insight confiável.";
  const best = [...usable].sort((a, b) => b.meetingRate - a.meetingRate)[0];
  if (!best || best.calls === 0) return "Ainda não existem dados suficientes para gerar um insight confiável.";
  if (usable.length === 1) {
    return `${best.label} é a única ${entity.toLowerCase()} com amostra suficiente até o momento (${fmtPct(best.meetingRate)} de reuniões).`;
  }
  const second = [...usable].sort((a, b) => b.meetingRate - a.meetingRate)[1];
  const diff = best.meetingRate - (second?.meetingRate ?? 0);
  if (diff > 2) {
    return `${best.label} lidera com ${fmtPct(best.meetingRate)} de reuniões — ${diff.toFixed(1)} p.p. acima da segunda colocada.`;
  }
  return `${best.label} apresenta atualmente a maior taxa de reuniões (${fmtPct(best.meetingRate)}), com desempenho próximo dos demais.`;
}

// ============================================================
// AnalysisCard — reutilizável (Top 10 + Modal completo)
// ============================================================

const PAGE_SIZES = [10, 25, 50, 100];

function AnalysisCard({
  icon, title, description, entityLabel, rows, columns, summaryLabel,
}: {
  icon: React.ReactNode; title: string; description: string;
  entityLabel: string;
  rows: AnalysisRow[]; columns: ColumnDef[]; summaryLabel: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("meetingRate");
  const [openAll, setOpenAll] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const sorted = useMemo(() => sortRowsBy(rows, sortKey), [rows, sortKey]);
  const best = sorted.find((r) => r.confidence !== "low");
  const insight = useMemo(() => buildInsight(entityLabel, sorted), [entityLabel, sorted]);

  const top10 = sorted.slice(0, 10);
  const bottom10 = sorted.length > 10 ? sorted.slice(-10).reverse() : [];

  const filteredAll = useMemo(() => {
    const q = norm(search);
    return q ? sorted.filter((r) => norm(r.label).includes(q)) : sorted;
  }, [sorted, search]);
  const totalPages = Math.max(1, Math.ceil(filteredAll.length / pageSize));
  const pageRows = filteredAll.slice(page * pageSize, page * pageSize + pageSize);

  const Table = ({ data, compact }: { data: AnalysisRow[]; compact?: boolean }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
            <th className="py-2 pr-2 w-6"></th>
            {columns.map((c, i) => (
              <th key={i} className={`py-2 pr-4 ${c.align === "right" ? "text-right" : "text-left"}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="py-6 text-center text-sm text-muted-foreground">
                Sem dados no período/segmento selecionado.
              </td>
            </tr>
          )}
          {data.map((r) => (
            <tr key={r.key} className="border-b last:border-b-0">
              <td className="py-2 pr-2"><ConfidenceDot level={r.confidence} /></td>
              {columns.map((c, i) => (
                <td key={i}
                  className={`py-2 pr-4 ${c.align === "right" ? "text-right tabular-nums" : ""} ${i === 0 ? "font-medium" : "text-muted-foreground"} ${compact ? "" : ""}`}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

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
      <CardContent className="space-y-4">
        {/* Insight */}
        <div className="rounded-lg border bg-muted/20 p-3 flex items-start gap-3">
          <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Insight</div>
            {insight}
          </div>
        </div>

        {/* Melhor Resultado */}
        <div className="rounded-lg border bg-accent/5 p-4">
          {best ? (
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-accent mt-0.5" />
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{summaryLabel}</div>
                <div className="text-xl font-semibold mt-0.5">{best.label}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Taxa de reuniões: <span className="text-foreground font-medium">{fmtPct(best.meetingRate)}</span>
                  {" · "}Base: <span className="text-foreground font-medium">{best.calls} ligações</span>
                  {" · "}<ConfidenceDot level={best.confidence} /> {CONFIDENCE_META[best.confidence].label}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Sem amostra suficiente para eleger um melhor resultado no período.
            </div>
          )}
        </div>

        {/* Sort control */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ArrowUpDown className="h-3.5 w-3.5" /> Ordenar por
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-7 w-[220px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <SelectItem key={k} value={k} className="text-xs">{SORT_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpenAll(true)}>
            Ver ranking completo ({sorted.length})
          </Button>
        </div>

        {/* Top 10 */}
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Top 10 melhores</div>
          <Table data={top10} />
        </div>
        {bottom10.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Top 10 piores</div>
            <Table data={bottom10} />
          </div>
        )}
      </CardContent>

      {/* Modal Ranking completo */}
      <Dialog open={openAll} onOpenChange={setOpenAll}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{title} — Ranking completo</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Pesquisar..." className="h-8 pl-7 text-xs"
              />
            </div>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
              <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-xs">{s} / pág.</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-y-auto flex-1">
            <Table data={pageRows} compact />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <div>{filteredAll.length} registros</div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0"
                onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span>Página {page + 1} de {totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================================
// MÓDULOS
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
        meetingRate: 0, confidence: "low",
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
    return [...map.values()].map(finalizeRates);
  }, [sessions]);

  return (
    <AnalysisCard
      icon={<Clock className="h-5 w-5" />}
      title="Análise de Horários"
      entityLabel="Faixa de horário"
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
    const ensure = (key: string, label: string) => {
      if (!map.has(key)) map.set(key, {
        key, label, leads: 0, calls: 0, meetings: 0, meetingRate: 0, confidence: "low",
      });
      return map.get(key)!;
    };
    for (const l of leads) {
      const seg = resolveSegments(l);
      if (!seg.cityKey) continue;
      ensure(seg.cityKey, seg.cityDisplay).leads! += 1;
    }
    for (const e of events.filter((x) => x.type === "call")) {
      const l = leadById.get(e.leadId); if (!l) continue;
      const seg = resolveSegments(l); if (!seg.cityKey) continue;
      ensure(seg.cityKey, seg.cityDisplay).calls += 1;
    }
    for (const m of meetings) {
      const l = leadById.get(m.leadId); if (!l) continue;
      const seg = resolveSegments(l); if (!seg.cityKey) continue;
      ensure(seg.cityKey, seg.cityDisplay).meetings += 1;
    }
    return [...map.values()].map(finalizeRates);
  }, [leads, events, meetings]);

  return (
    <AnalysisCard
      icon={<MapPin className="h-5 w-5" />}
      title="Análise por Cidade"
      entityLabel="Cidade"
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
    const ensure = (key: string, label: string) => {
      if (!map.has(key)) map.set(key, {
        key, label, leads: 0, calls: 0, connections: 0, decisionMakers: 0,
        meetings: 0, meetingRate: 0, confidence: "low",
      });
      return map.get(key)!;
    };
    for (const l of leads) {
      const seg = resolveSegments(l);
      if (!seg.nicheKey) continue;
      ensure(seg.nicheKey, seg.nicheDisplay).leads! += 1;
    }
    for (const s of sessions) {
      const p = parseNicheField(s.niche || "", "");
      const key = norm(p.niche); if (!key) continue;
      const row = ensure(key, p.niche);
      row.calls += s.calls || 0;
      row.connections = (row.connections || 0) + (s.connections || 0);
      row.decisionMakers = (row.decisionMakers || 0) + (s.decisionMakers || 0);
      row.meetings += s.meetings || 0;
    }
    const withSessions = new Set(
      sessions.map((s) => norm(parseNicheField(s.niche || "", "").niche)).filter(Boolean)
    );
    for (const e of events.filter((x) => x.type === "call")) {
      const l = leadById.get(e.leadId); if (!l) continue;
      const seg = resolveSegments(l);
      if (!seg.nicheKey || withSessions.has(seg.nicheKey)) continue;
      ensure(seg.nicheKey, seg.nicheDisplay).calls += 1;
    }
    for (const m of meetings) {
      const l = leadById.get(m.leadId); if (!l) continue;
      const seg = resolveSegments(l);
      if (!seg.nicheKey || withSessions.has(seg.nicheKey)) continue;
      ensure(seg.nicheKey, seg.nicheDisplay).meetings += 1;
    }
    return [...map.values()].map(finalizeRates);
  }, [leads, sessions, events, meetings]);

  return (
    <AnalysisCard
      icon={<Building2 className="h-5 w-5" />}
      title="Análise por Nicho"
      entityLabel="Nicho"
      description="Desempenho comercial agrupado por nicho de mercado (excluindo pares Cidade+Nicho tratados como Campanha)."
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
    const map = new Map<string, AnalysisRow>();
    const ensure = (key: string, label: string) => {
      if (!map.has(key)) map.set(key, {
        key, label, leads: 0, calls: 0, meetings: 0, remaining: 0,
        meetingRate: 0, confidence: "low",
      });
      return map.get(key)!;
    };
    for (const l of leads) {
      const seg = resolveSegments(l);
      if (!seg.nicheKey || !seg.cityKey) continue;
      const row = ensure(seg.campaignKey, seg.campaignDisplay);
      row.leads! += 1;
      if (l.stage === "Novo Lead") row.remaining! += 1;
    }
    for (const e of events.filter((x) => x.type === "call")) {
      const l = leadById.get(e.leadId); if (!l) continue;
      const seg = resolveSegments(l);
      if (!seg.nicheKey || !seg.cityKey) continue;
      ensure(seg.campaignKey, seg.campaignDisplay).calls += 1;
    }
    for (const m of meetings) {
      const l = leadById.get(m.leadId); if (!l) continue;
      const seg = resolveSegments(l);
      if (!seg.nicheKey || !seg.cityKey) continue;
      ensure(seg.campaignKey, seg.campaignDisplay).meetings += 1;
    }
    return [...map.values()]
      .filter((r) => (r.leads || 0) > 0 || r.calls > 0)
      .map(finalizeRates);
  }, [leads, events, meetings]);

  return (
    <AnalysisCard
      icon={<Megaphone className="h-5 w-5" />}
      title="Análise por Campanha"
      entityLabel="Campanha"
      description="Desempenho por campanha (par Cidade + Nicho)."
      summaryLabel="Campanha mais eficiente no período"
      rows={rows}
      columns={[
        { header: "Campanha", render: (r) => r.label },
        { header: "Leads", align: "right", render: (r) => r.leads ?? 0 },
        { header: "Ligações", align: "right", render: (r) => r.calls },
        { header: "Reuniões", align: "right", render: (r) => r.meetings },
        { header: "Tx. Reuniões", align: "right", render: (r) => r.calls > 0 ? fmtPct(r.meetingRate) : dash },
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

        {/* Aviso global de amostragem */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground">
            A operação ainda possui poucos dados para algumas análises. Resultados com baixa amostragem
            <span className="mx-1">(<ConfidenceDot level="low" />)</span>
            devem ser interpretados com cautela. Referências: <ConfidenceDot level="low" /> &lt; {CONFIDENCE_THRESHOLDS.medium} ligações
            {" · "}<ConfidenceDot level="medium" /> {CONFIDENCE_THRESHOLDS.medium}–{CONFIDENCE_THRESHOLDS.high - 1}
            {" · "}<ConfidenceDot level="high" /> ≥ {CONFIDENCE_THRESHOLDS.high}.
          </div>
        </div>

        <section className="grid gap-4">
          <InsightsPanel />
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
