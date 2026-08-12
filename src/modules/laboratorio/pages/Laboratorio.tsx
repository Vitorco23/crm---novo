// Laboratório Comercial — UI executiva.
// Página independente que consome os engines em src/lib/lab/*.
// Não altera nenhum outro módulo. Reage a storage/p21:storage-synced.
// Filtros persistidos em p21_lab_filters (sincroniza entre dispositivos).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlaskConical, Trophy, TrendingUp, MapPin, Building2, Clock,
  Users, Filter, Plus, Play, Pause, Archive, CheckCircle2, Trash2,
  Lightbulb, AlertTriangle, ChevronDown, LineChart, X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

import { uload, usave } from "@/shared/services/userStorage";
import { buildDataset } from "@/modules/laboratorio/services/collector";
import { rankByDimension, CONFIDENCE_META, HOUR_BUCKETS } from "@/modules/laboratorio/services/comparators";
import { buildRecommendations } from "@/modules/laboratorio/services/recommendations";
import {
  getExperiments, addExperiment, updateExperiment,
  setExperimentStatus, deleteExperiment,
} from "@/modules/laboratorio/services/experiments";
import type {
  LabDimension, LabFilters, LabPeriodPreset, RankingRow, Experiment, ExperimentStatus,
} from "@/modules/laboratorio/types/types";

// ============= filtros persistidos =============

const FILTERS_KEY = "p21_lab_filters";
const DEFAULT_FILTERS: LabFilters = {
  period: "today", niche: "all", campaign: "all", city: "all",
  script: "all", responsible: "all",
};

const PERIOD_LABELS: Record<LabPeriodPreset, string> = {
  today: "Hoje", last7: "Últimos 7 dias", last30: "Últimos 30 dias",
  last90: "Últimos 90 dias", thisMonth: "Este mês", lastMonth: "Mês anterior",
  custom: "Personalizado",
};

const DIM_META: Record<LabDimension, { label: string; icon: typeof FlaskConical }> = {
  script:      { label: "Scripts",       icon: FlaskConical },
  campaign:    { label: "Campanhas",     icon: TrendingUp },
  city:        { label: "Cidades",       icon: MapPin },
  niche:       { label: "Nichos",        icon: Building2 },
  hour:        { label: "Horários",      icon: Clock },
  responsible: { label: "Responsáveis",  icon: Users },
};

const STATUS_META: Record<ExperimentStatus, { label: string; className: string; icon: typeof Play }> = {
  "in-progress": { label: "Em andamento", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30", icon: Play },
  completed:     { label: "Concluído",    className: "bg-blue-500/10 text-blue-500 border-blue-500/30",       icon: CheckCircle2 },
  paused:        { label: "Pausado",      className: "bg-amber-500/10 text-amber-500 border-amber-500/30",     icon: Pause },
  archived:      { label: "Arquivado",    className: "bg-muted text-muted-foreground border-border",           icon: Archive },
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// ============= página =============

export default function Laboratorio() {
  const [filters, setFiltersState] = useState<LabFilters>(() =>
    uload<LabFilters>(FILTERS_KEY, DEFAULT_FILTERS));
  const [tick, setTick] = useState(0);
  const [dimension, setDimension] = useState<LabDimension>("script");

  // atualização em tempo real via bus (§4, §5)
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("storage", bump);
    window.addEventListener("p21:storage-synced", bump);
    return () => {
      window.removeEventListener("storage", bump);
      window.removeEventListener("p21:storage-synced", bump);
    };
  }, []);

  const setFilters = useCallback((patch: Partial<LabFilters>) => {
    setFiltersState((prev) => {
      const next = { ...prev, ...patch };
      usave(FILTERS_KEY, next);
      return next;
    });
  }, []);

  const dataset = useMemo(() => buildDataset(filters), [filters, tick]);
  const ranking = useMemo(() => rankByDimension(dataset, dimension), [dataset, dimension]);
  const recommendations = useMemo(() => buildRecommendations(dimension, ranking), [dimension, ranking]);

  // rankings globais (para "melhor de tudo")
  const globalHighlights = useMemo(() => ({
    script: rankByDimension(dataset, "script")[0],
    campaign: rankByDimension(dataset, "campaign")[0],
    city: rankByDimension(dataset, "city")[0],
    niche: rankByDimension(dataset, "niche")[0],
    hour: rankByDimension(dataset, "hour")[0],
  }), [dataset]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <FlaskConical className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-widest">Laboratório Comercial</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Experimentação contínua da operação
          </h1>
          <p className="text-sm text-muted-foreground">
            Compare scripts, campanhas, cidades, nichos e horários com dados reais.
            Todas as conclusões seguem o nível de confiança estatístico da amostra.
          </p>
        </div>
      </header>

      <FiltersBar
        filters={filters}
        setFilters={setFilters}
        niches={dataset.options.niches}
        campaigns={dataset.options.campaigns}
        cities={dataset.options.cities}
        scripts={dataset.options.scripts}
      />

      <HighlightsRow highlights={globalHighlights} />

      <ExperimentsPanel dataset={dataset} tick={tick} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-4 w-4" /> Comparações
          </CardTitle>
          <CardDescription>
            Ranking automático — vencedores no topo, com receita, conversão e tempo médio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={dimension} onValueChange={(v) => setDimension(v as LabDimension)}>
            <TabsList className="flex flex-wrap gap-1">
              {(Object.keys(DIM_META) as LabDimension[]).map((d) => {
                const Icon = DIM_META[d].icon;
                return (
                  <TabsTrigger key={d} value={d} className="gap-1.5">
                    <Icon className="h-3.5 w-3.5" /> {DIM_META[d].label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {(Object.keys(DIM_META) as LabDimension[]).map((d) => (
              <TabsContent key={d} value={d} className="mt-4">
                <RankingTable dimension={d} ranking={d === dimension ? ranking : rankByDimension(dataset, d)} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <RecommendationsPanel recommendations={recommendations} dimension={dimension} />
    </div>
  );
}

// ============= barra de filtros =============

interface FiltersBarProps {
  filters: LabFilters;
  setFilters: (p: Partial<LabFilters>) => void;
  niches: { key: string; label: string }[];
  campaigns: { key: string; label: string }[];
  cities: { key: string; label: string }[];
  scripts: string[];
}

function FiltersBar(p: FiltersBarProps) {
  const showCustom = p.filters.period === "custom";
  return (
    <Card className="border-border/70">
      <CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" /> Filtros
        </div>

        <FilterSelect
          value={p.filters.period}
          onChange={(v) => p.setFilters({ period: v as LabPeriodPreset })}
          items={(Object.keys(PERIOD_LABELS) as LabPeriodPreset[]).map((k) => ({ value: k, label: PERIOD_LABELS[k] }))}
          placeholder="Período"
          width="w-44"
        />

        {showCustom && (
          <>
            <DatePick
              label="Início"
              value={p.filters.customStart}
              onChange={(iso) => p.setFilters({ customStart: iso })}
            />
            <DatePick
              label="Fim"
              value={p.filters.customEnd}
              onChange={(iso) => p.setFilters({ customEnd: iso })}
            />
          </>
        )}

        <FilterSelect
          value={p.filters.niche}
          onChange={(v) => p.setFilters({ niche: v })}
          items={[{ value: "all", label: "Todos os nichos" },
            ...p.niches.map((n) => ({ value: n.key, label: n.label }))]}
          placeholder="Nicho"
          width="w-52"
        />

        <FilterSelect
          value={p.filters.city}
          onChange={(v) => p.setFilters({ city: v })}
          items={[{ value: "all", label: "Todas as cidades" },
            ...p.cities.map((c) => ({ value: c.key, label: c.label }))]}
          placeholder="Cidade"
          width="w-52"
        />

        <FilterSelect
          value={p.filters.campaign}
          onChange={(v) => p.setFilters({ campaign: v })}
          items={[{ value: "all", label: "Todas as campanhas" },
            ...p.campaigns.map((c) => ({ value: c.key, label: c.label }))]}
          placeholder="Campanha"
          width="w-56"
        />

        <FilterSelect
          value={p.filters.script}
          onChange={(v) => p.setFilters({ script: v })}
          items={[{ value: "all", label: "Todos os scripts" },
            ...p.scripts.map((s) => ({ value: s, label: s }))]}
          placeholder="Script"
          width="w-40"
        />

        {(p.filters.niche !== "all" || p.filters.city !== "all"
          || p.filters.campaign !== "all" || p.filters.script !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => p.setFilters({
            niche: "all", city: "all", campaign: "all", script: "all",
          })}>
            <X className="mr-1 h-3.5 w-3.5" /> Limpar
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function FilterSelect({ value, onChange, items, placeholder, width = "w-40" }: {
  value: string; onChange: (v: string) => void;
  items: { value: string; label: string }[]; placeholder: string; width?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={width}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function DatePick({ label, value, onChange }: { label: string; value?: string; onChange: (iso?: string) => void }) {
  const d = value ? new Date(value) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-40 justify-start text-left font-normal">
          {label}: {d ? d.toLocaleDateString("pt-BR") : "—"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={d} onSelect={(x) => onChange(x?.toISOString())} initialFocus />
      </PopoverContent>
    </Popover>
  );
}

// ============= destaques globais =============

function HighlightsRow({ highlights }: { highlights: Record<string, RankingRow | undefined> }) {
  const cards = [
    { key: "script",   title: "Melhor script",   row: highlights.script },
    { key: "campaign", title: "Melhor campanha", row: highlights.campaign },
    { key: "city",     title: "Melhor cidade",   row: highlights.city },
    { key: "niche",    title: "Melhor nicho",    row: highlights.niche },
    { key: "hour",     title: "Melhor horário",  row: highlights.hour },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.key} className="border-border/70">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <Trophy className="h-3 w-3" /> {c.title}
            </CardDescription>
            <CardTitle className="text-base">
              {c.row?.label ?? <span className="text-muted-foreground">—</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {c.row ? (
              <>
                <div>Conv: <span className="font-semibold text-foreground">{pct(c.row.metrics.conversion)}</span></div>
                <div>Receita: <span className="font-semibold text-foreground">{brl(c.row.metrics.revenue)}</span></div>
                <div className={CONFIDENCE_META[c.row.confidence].color}>
                  {CONFIDENCE_META[c.row.confidence].dot} {CONFIDENCE_META[c.row.confidence].label}
                </div>
              </>
            ) : "Sem amostra"}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============= ranking =============

function RankingTable({ dimension, ranking }: { dimension: LabDimension; ranking: RankingRow[] }) {
  if (!ranking.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nenhum dado disponível para <span className="font-medium">{DIM_META[dimension].label.toLowerCase()}</span> no período selecionado.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="p-2 text-left">#</th>
            <th className="p-2 text-left">{DIM_META[dimension].label.slice(0, -1)}</th>
            <th className="p-2 text-right">Ligações</th>
            <th className="p-2 text-right">Conexões</th>
            <th className="p-2 text-right">Decisores</th>
            <th className="p-2 text-right">Reuniões</th>
            <th className="p-2 text-right">Vendas</th>
            <th className="p-2 text-right">Receita</th>
            <th className="p-2 text-right">Ticket</th>
            <th className="p-2 text-right">Conv.</th>
            <th className="p-2 text-right">T. Reunião</th>
            <th className="p-2 text-right">T. Venda</th>
            <th className="p-2 text-right">Score</th>
            <th className="p-2 text-right">Confiança</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((r, i) => {
            const c = CONFIDENCE_META[r.confidence];
            return (
              <tr key={r.key} className="border-t hover:bg-muted/30">
                <td className="p-2 font-mono text-xs">{i + 1}</td>
                <td className="p-2 font-medium">
                  {i === 0 && r.confidence !== "low" && <Trophy className="mr-1 inline h-3 w-3 text-primary" />}
                  {r.label}
                </td>
                <td className="p-2 text-right">{r.metrics.calls}</td>
                <td className="p-2 text-right">{r.metrics.connections}</td>
                <td className="p-2 text-right">{r.metrics.decisionMakers}</td>
                <td className="p-2 text-right">{r.metrics.meetings}</td>
                <td className="p-2 text-right">{r.metrics.sales}</td>
                <td className="p-2 text-right font-medium">{brl(r.metrics.revenue)}</td>
                <td className="p-2 text-right">{brl(r.metrics.avgTicket)}</td>
                <td className="p-2 text-right">{pct(r.metrics.conversion)}</td>
                <td className="p-2 text-right">{r.metrics.avgTimeToMeetingDays ? `${r.metrics.avgTimeToMeetingDays.toFixed(1)}d` : "—"}</td>
                <td className="p-2 text-right">{r.metrics.avgTimeToSaleDays ? `${r.metrics.avgTimeToSaleDays.toFixed(1)}d` : "—"}</td>
                <td className="p-2 text-right font-semibold">{r.score}</td>
                <td className={`p-2 text-right ${c.color}`}>{c.dot} {c.label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============= recomendações =============

function RecommendationsPanel({
  recommendations, dimension,
}: { recommendations: ReturnType<typeof buildRecommendations>; dimension: LabDimension }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4" /> Recomendações — {DIM_META[dimension].label}
        </CardTitle>
        <CardDescription>Ações sugeridas com base nos dados reais do ranking.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.length === 0 && (
          <div className="text-sm text-muted-foreground">Nenhuma recomendação disponível.</div>
        )}
        {recommendations.map((r) => {
          const color =
            r.severity === "positive" ? "border-emerald-500/40 bg-emerald-500/5"
            : r.severity === "critical" ? "border-rose-500/40 bg-rose-500/5"
            : "border-amber-500/40 bg-amber-500/5";
          const Icon = r.severity === "positive" ? Lightbulb : AlertTriangle;
          return (
            <div key={r.id} className={`rounded-lg border p-3 ${color}`}>
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4" />
                <div className="flex-1">
                  <div className="font-medium">{r.title}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">{r.rationale}</div>
                  {r.metricSummary && (
                    <div className="mt-1 text-xs text-muted-foreground">{r.metricSummary}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ============= experimentos =============

function ExperimentsPanel({ dataset, tick }: { dataset: ReturnType<typeof buildDataset>; tick: number }) {
  const [items, setItems] = useState<Experiment[]>(() => getExperiments());
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ExperimentStatus | "all">("all");

  useEffect(() => { setItems(getExperiments()); }, [tick, open]);

  const filtered = statusFilter === "all" ? items : items.filter((e) => e.status === statusFilter);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" /> Painel de Experimentos
          </CardTitle>
          <CardDescription>Registre hipóteses e acompanhe resultado, amostra e confiança.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ExperimentStatus | "all")}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(Object.keys(STATUS_META) as ExperimentStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Novo experimento</Button>
            </DialogTrigger>
            <NewExperimentDialog onSaved={(x) => { setItems((p) => [x, ...p]); setOpen(false); }} />
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhum experimento registrado. Crie o primeiro para acompanhar hipóteses.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((e) => (
              <ExperimentRow key={e.id} exp={e} dataset={dataset}
                onChange={() => setItems(getExperiments())} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExperimentRow({ exp, dataset, onChange }: {
  exp: Experiment; dataset: ReturnType<typeof buildDataset>; onChange: () => void;
}) {
  const S = STATUS_META[exp.status];
  // ranking ao vivo se in-progress; snapshot se completed
  const live = useMemo(() => rankByDimension(dataset, exp.dimension), [dataset, exp.dimension]);
  const filteredRanking = exp.variants.length
    ? live.filter((r) => exp.variants.some((v) => r.label.toLowerCase().includes(v.toLowerCase())))
    : live;
  const totalCalls = filteredRanking.reduce((a, r) => a + r.metrics.calls, 0);
  const winner = filteredRanking[0];
  const conf = winner ? CONFIDENCE_META[winner.confidence] : null;

  const conclude = () => {
    updateExperiment(exp.id, {
      status: "completed",
      endDate: new Date().toISOString(),
      snapshot: {
        ranking: filteredRanking,
        confidence: winner?.confidence ?? "low",
        winner: winner ? { key: winner.key, label: winner.label } : undefined,
        recommendation: winner?.confidence !== "low"
          ? `Adotar ${winner?.label}` : "Amostra insuficiente",
        generatedAt: new Date().toISOString(),
      },
    });
    toast.success("Experimento concluído. Snapshot congelado no histórico.");
    onChange();
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{exp.name}</span>
            <Badge variant="outline" className={S.className}>
              <S.icon className="mr-1 h-3 w-3" /> {S.label}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {DIM_META[exp.dimension].label}
            </Badge>
          </div>
          {exp.objective && (
            <p className="mt-1 text-sm text-muted-foreground">{exp.objective}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>Início: {new Date(exp.startDate).toLocaleDateString("pt-BR")}</span>
            {exp.endDate && <span>Fim: {new Date(exp.endDate).toLocaleDateString("pt-BR")}</span>}
            {exp.owner && <span>Resp.: {exp.owner}</span>}
            <span>Amostra: {totalCalls} ligações</span>
            {conf && <span className={conf.color}>{conf.dot} {conf.label}</span>}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {exp.status === "in-progress" && (
            <Button size="sm" variant="outline" onClick={conclude}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Concluir
            </Button>
          )}
          {exp.status === "in-progress" && (
            <Button size="sm" variant="ghost" onClick={() => {
              setExperimentStatus(exp.id, "paused"); onChange();
            }}><Pause className="h-3.5 w-3.5" /></Button>
          )}
          {exp.status === "paused" && (
            <Button size="sm" variant="ghost" onClick={() => {
              setExperimentStatus(exp.id, "in-progress"); onChange();
            }}><Play className="h-3.5 w-3.5" /></Button>
          )}
          {exp.status !== "archived" && (
            <Button size="sm" variant="ghost" onClick={() => {
              setExperimentStatus(exp.id, "archived"); onChange();
            }}><Archive className="h-3.5 w-3.5" /></Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => {
            if (confirm("Excluir experimento?")) { deleteExperiment(exp.id); onChange(); }
          }}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
        </div>
      </div>

      {/* preview compacto do ranking */}
      {filteredRanking.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            <ChevronDown className="mr-1 inline h-3 w-3" /> Ver ranking do experimento
          </summary>
          <div className="mt-2">
            <RankingTable dimension={exp.dimension} ranking={filteredRanking} />
          </div>
        </details>
      )}
    </div>
  );
}

function NewExperimentDialog({ onSaved }: { onSaved: (e: Experiment) => void }) {
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [dimension, setDimension] = useState<LabDimension>("script");
  const [owner, setOwner] = useState("");
  const [variants, setVariants] = useState("");
  const [hypothesis, setHypothesis] = useState("");

  const save = () => {
    if (!name.trim()) { toast.error("Informe o nome do experimento."); return; }
    const exp = addExperiment({
      name: name.trim(),
      objective: objective.trim(),
      dimension,
      owner: owner.trim() || undefined,
      hypothesis: hypothesis.trim() || undefined,
      status: "in-progress",
      startDate: new Date().toISOString(),
      variants: variants.split(",").map((v) => v.trim()).filter(Boolean),
    });
    toast.success("Experimento criado.");
    onSaved(exp);
    setName(""); setObjective(""); setOwner(""); setVariants(""); setHypothesis("");
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Novo experimento</DialogTitle>
        <DialogDescription>
          Registre uma hipótese testável. O sistema compara os dados reais automaticamente.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Script B vs Script A — abril" />
        </div>
        <div>
          <Label>Objetivo</Label>
          <Textarea value={objective} onChange={(e) => setObjective(e.target.value)}
            placeholder="Ex.: Descobrir se o Script B aumenta reuniões marcadas em pelo menos 15%." />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Dimensão</Label>
            <Select value={dimension} onValueChange={(v) => setDimension(v as LabDimension)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DIM_META) as LabDimension[]).map((d) => (
                  <SelectItem key={d} value={d}>{DIM_META[d].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Responsável</Label>
            <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <div>
          <Label>Variantes (separadas por vírgula)</Label>
          <Input value={variants} onChange={(e) => setVariants(e.target.value)}
            placeholder="Ex.: Script A, Script B" />
        </div>
        <div>
          <Label>Hipótese (opcional)</Label>
          <Textarea value={hypothesis} onChange={(e) => setHypothesis(e.target.value)}
            placeholder="Ex.: Ligações no bloco 09-11h geram +20% de reuniões." />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save}>Criar experimento</Button>
      </DialogFooter>
    </DialogContent>
  );
}
