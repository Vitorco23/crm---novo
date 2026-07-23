// ============================================================
// Central de Decisão — visão executiva única do CRM Performance21.
// ------------------------------------------------------------
// Esta página é um NOVO módulo. Ela NÃO altera nenhum outro
// módulo do sistema: apenas lê os dados existentes (leads,
// sessões, movimentos, reuniões, lembretes, financeiro, metas)
// e consome os motores já implementados:
//
//  • Motor de Gargalos    → src/lib/bottleneckEngine.ts
//  • Motor de Insights    → src/lib/insights.ts
//  • Métricas diárias     → src/lib/coldCallMetrics.ts
//  • Prioridade do momento→ src/components/PriorityCard.tsx (reuso)
//  • Gargalo (card cheio) → src/components/BottleneckCard.tsx (reuso)
//
// Cada bloco é um componente independente e memoizado. Todos
// respondem a `storage` + `p21:storage-synced` (barramento de
// eventos) e recomputam ao vivo — sem botão de atualizar.
// ============================================================

import { useEffect, useMemo, useState, useCallback, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Compass, AlertTriangle, Sparkles, TrendingUp, TrendingDown,
  Target, CalendarClock, Layers, ListChecks, Activity,
  ChevronRight, Zap, Phone, MessageSquare, Handshake,
  DollarSign, Lightbulb, ArrowRight, Flame, CheckCircle2, Clock,
} from "lucide-react";

import {
  getLeads, getMeetings, getMovementEvents, getSessions,
  getGoalsSettings, getStagesForPipeline,
  type Lead, type Meeting, type MovementEvent, type PomodoroSession,
} from "@/lib/store";
import { getTransactions, monthKey, formatBRL } from "@/lib/finance";
import { getReminders } from "@/lib/reminders";
import {
  analyzeBottleneck, resolveBottleneckPeriod, previousPeriod, compareBottlenecks,
  type Bottleneck,
} from "@/lib/bottleneckEngine";
import {
  runInsightsEngine, getInsights, sortInsights, getLastRunAt,
  CATEGORY_LABELS, PRIORITY_LABELS,
  type Insight, type InsightPriority,
} from "@/lib/insights";
import { computeDailyGoals, computeDailyTotals } from "@/lib/coldCallMetrics";
import { uload, usave } from "@/lib/userStorage";

import PriorityCard from "@/components/PriorityCard";
import BottleneckCard from "@/components/BottleneckCard";

// ============================================================
// TIPOS E FILTROS LOCAIS DA CENTRAL
// ============================================================

type PeriodKey = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth";

interface CentralFilters {
  period: PeriodKey;
  city: string;      // "all" | valor
  niche: string;     // "all" | valor
  campaign: string;  // "all" | "NICHO||CIDADE"
}

const DEFAULT_FILTERS: CentralFilters = {
  period: "thisMonth",
  city: "all",
  niche: "all",
  campaign: "all",
};

const FILTERS_KEY = "p21_central_filters";

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today",     label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "last7",     label: "Últimos 7 dias" },
  { key: "last30",    label: "Últimos 30 dias" },
  { key: "thisMonth", label: "Este mês" },
  { key: "lastMonth", label: "Mês anterior" },
];

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
// COMPONENTE PRINCIPAL
// ============================================================

export default function CentralDecisao() {
  const tick = useLiveTick();
  const [filters, setFiltersState] = useState<CentralFilters>(() =>
    uload<CentralFilters>(FILTERS_KEY, DEFAULT_FILTERS)
  );
  const setFilters = useCallback((patch: Partial<CentralFilters>) => {
    setFiltersState((prev) => {
      const next = { ...prev, ...patch };
      usave(FILTERS_KEY, next);
      return next;
    });
  }, []);

  const data = useCentralDataset(filters, tick);

  // Roda o motor de insights se estiver "velho" (>10min).
  useEffect(() => {
    const last = getLastRunAt();
    if (!last || Date.now() - new Date(last).getTime() > 10 * 60 * 1000) {
      // Timeout evita bloquear o primeiro render.
      const id = setTimeout(() => runInsightsEngine(), 60);
      return () => clearTimeout(id);
    }
  }, []);

  return (
    <div className="space-y-4 pb-10">
      {/* Cabeçalho + Filtros */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
            <Compass className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Central de Decisão</h1>
            <p className="text-sm text-muted-foreground">
              Onde a operação inteira cabe em uma tela — o que fazer agora, o que
              está travando o crescimento e onde estão as oportunidades.
            </p>
          </div>
        </div>
        <FiltersBar
          filters={filters}
          setFilters={setFilters}
          cities={data.cities}
          niches={data.niches}
          campaigns={data.campaigns}
        />
      </div>

      {/* 1. O QUE FAZER AGORA */}
      <Section title="O que fazer agora" icon={<Zap className="h-4 w-4" />} accent>
        <PriorityCard />
        <NextActionsList data={data} />
      </Section>

      {/* 2. PRIORIDADES DA OPERAÇÃO + 3. ALERTAS lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PrioritiesBlock tick={tick} />
        <AlertsBlock tick={tick} />
      </div>

      {/* 4. OPORTUNIDADES + 5. O QUE MUDOU */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OpportunitiesBlock tick={tick} />
        <ChangesBlock data={data} tick={tick} />
      </div>

      {/* 6. RESUMO EXECUTIVO */}
      <ExecutiveSummary data={data} tick={tick} />

      {/* 7. METAS + 9. AGENDA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GoalsBlock data={data} tick={tick} />
        <AgendaBlock tick={tick} />
      </div>

      {/* 8. GARGALO (reusa componente existente) */}
      <BottleneckCard />

      {/* 10. PIPELINE */}
      <PipelineBlock data={data} />
    </div>
  );
}

// ============================================================
// BARRA DE FILTROS
// ============================================================

function FiltersBar({
  filters, setFilters, cities, niches, campaigns,
}: {
  filters: CentralFilters;
  setFilters: (patch: Partial<CentralFilters>) => void;
  cities: string[];
  niches: string[];
  campaigns: { key: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={filters.period} onValueChange={(v) => setFilters({ period: v as PeriodKey })}>
        <SelectTrigger className="h-9 w-[160px] text-xs">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((p) => (
            <SelectItem key={p.key} value={p.key} className="text-xs">{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.city} onValueChange={(v) => setFilters({ city: v })}>
        <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Cidade" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">Todas as cidades</SelectItem>
          {cities.map((c) => (<SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>))}
        </SelectContent>
      </Select>

      <Select value={filters.niche} onValueChange={(v) => setFilters({ niche: v })}>
        <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Nicho" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">Todos os nichos</SelectItem>
          {niches.map((n) => (<SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>))}
        </SelectContent>
      </Select>

      <Select value={filters.campaign} onValueChange={(v) => setFilters({ campaign: v })}>
        <SelectTrigger className="h-9 w-[200px] text-xs"><SelectValue placeholder="Campanha" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">Todas as campanhas</SelectItem>
          {campaigns.map((c) => (<SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>))}
        </SelectContent>
      </Select>

      {(filters.city !== "all" || filters.niche !== "all" || filters.campaign !== "all") && (
        <Button variant="ghost" size="sm" className="h-9 text-xs"
          onClick={() => setFilters({ city: "all", niche: "all", campaign: "all" })}>
          Limpar
        </Button>
      )}
    </div>
  );
}

// ============================================================
// SEÇÃO GENÉRICA
// ============================================================

function Section({ title, icon, children, accent }: {
  title: string; icon?: ReactNode; children: ReactNode; accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-l-4 border-l-accent" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

// ============================================================
// BLOCO 1 (complemento): PRÓXIMAS AÇÕES OBJETIVAS
// ------------------------------------------------------------
// Complementa o PriorityCard listando até 6 ações imediatas
// derivadas dos dados reais, ordenadas por urgência.
// ============================================================

interface Action {
  key: string;
  icon: ReactNode;
  title: string;
  detail: string;
  urgency: 1 | 2 | 3 | 4; // 1 = máxima
  tag?: string;
  href?: string;
}

function computeNextActions(): Action[] {
  const now = new Date();
  const actions: Action[] = [];
  const leads = getLeads();
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const meetings = getMeetings();
  const reminders = getReminders();

  // Reuniões nas próximas 2h
  const soon = meetings
    .map((m) => ({ m, at: new Date(`${m.date}T${m.time || "00:00"}:00`).getTime() }))
    .filter(({ at }) => at >= now.getTime() && at - now.getTime() <= 2 * 3600 * 1000)
    .sort((a, b) => a.at - b.at);
  for (const { m, at } of soon.slice(0, 3)) {
    const mins = Math.max(1, Math.round((at - now.getTime()) / 60000));
    actions.push({
      key: `meet:${m.id}`,
      icon: <CalendarClock className="h-4 w-4" />,
      title: `Entrar na reunião com ${m.company}`,
      detail: `Começa em ${mins} min · ${m.time}`,
      urgency: 1,
      tag: "Reunião iminente",
      href: m.meetLink || m.link || m.googleEventUrl,
    });
  }

  // Reuniões de hoje sem confirmação
  const today = now.toISOString().slice(0, 10);
  const confirmedIds = new Set(reminders.filter((r) => r.status === "sent" && r.meetingId).map((r) => r.meetingId as string));
  meetings
    .filter((m) => m.date === today)
    .filter((m) => new Date(`${m.date}T${m.time}:00`).getTime() > now.getTime())
    .filter((m) => !confirmedIds.has(m.id))
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(0, 3)
    .forEach((m) => {
      actions.push({
        key: `conf:${m.id}`,
        icon: <CalendarClock className="h-4 w-4" />,
        title: `Confirmar reunião com ${m.company}`,
        detail: `Hoje às ${m.time} · ainda sem confirmação`,
        urgency: 2,
        tag: "Confirmar",
      });
    });

  // Follow-ups vencidos
  reminders
    .filter((r) => r.status === "pending" && new Date(r.scheduledFor).getTime() < now.getTime())
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
    .slice(0, 4)
    .forEach((r) => {
      const l = leadById.get(r.leadId);
      const late = Math.max(1, Math.round((now.getTime() - new Date(r.scheduledFor).getTime()) / 3600000));
      actions.push({
        key: `rem:${r.id}`,
        icon: <Phone className="h-4 w-4" />,
        title: `Follow-up com ${l?.company || r.title}`,
        detail: `"${r.title}" venceu há ${late}h`,
        urgency: 2,
        tag: "Follow-up",
      });
    });

  // Propostas paradas >2 dias
  leads
    .filter((l) => l.stage === "Proposta Enviada")
    .map((l) => ({ l, days: Math.floor((now.getTime() - new Date(l.stageChangedAt).getTime()) / 86400000) }))
    .filter(({ days }) => days >= 2)
    .sort((a, b) => b.days - a.days)
    .slice(0, 3)
    .forEach(({ l, days }) => {
      actions.push({
        key: `prop:${l.id}`,
        icon: <MessageSquare className="h-4 w-4" />,
        title: `Reengajar proposta com ${l.company}`,
        detail: `Sem retorno há ${days} dia(s)`,
        urgency: 3,
        tag: "Proposta",
      });
    });

  // Oportunidades paradas há mais de 8 dias
  const oppStages = new Set(["Reunião Marcada", "Reunião Realizada", "Documento de Guerra"]);
  leads
    .filter((l) => oppStages.has(l.stage))
    .map((l) => ({ l, days: Math.floor((now.getTime() - new Date(l.stageChangedAt).getTime()) / 86400000) }))
    .filter(({ days }) => days >= 8)
    .sort((a, b) => b.days - a.days)
    .slice(0, 3)
    .forEach(({ l, days }) => {
      actions.push({
        key: `opp:${l.id}`,
        icon: <Handshake className="h-4 w-4" />,
        title: `Mover ${l.company} no funil`,
        detail: `${l.stage} há ${days} dia(s) sem movimento`,
        urgency: 3,
        tag: "Oportunidade parada",
      });
    });

  return actions.sort((a, b) => a.urgency - b.urgency).slice(0, 6);
}

function NextActionsList({ data }: { data: CentralDataset }) {
  const actions = useMemo(() => computeNextActions(), [data]);
  if (actions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        Nenhuma ação urgente pendente. Continue a cadência de prospecção do dia.
      </p>
    );
  }
  const tone = (u: Action["urgency"]) =>
    u === 1 ? "border-l-red-500 bg-red-500/5"
    : u === 2 ? "border-l-orange-500 bg-orange-500/5"
    : u === 3 ? "border-l-yellow-500 bg-yellow-500/5"
    : "border-l-muted";

  return (
    <ul className="space-y-2">
      {actions.map((a) => (
        <li key={a.key} className={`rounded-md border border-l-4 ${tone(a.urgency)} p-2.5 flex items-center gap-3`}>
          <div className="h-8 w-8 rounded-md bg-accent/10 text-accent flex items-center justify-center shrink-0">
            {a.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">{a.title}</span>
              {a.tag && <Badge variant="outline" className="text-[10px]">{a.tag}</Badge>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{a.detail}</p>
          </div>
          {a.href && (
            <a href={a.href} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="h-7 text-[11px]">
                Abrir <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

// ============================================================
// BLOCO 2: PRIORIDADES DA OPERAÇÃO
// ============================================================

const PRIO_STYLE: Record<InsightPriority, { badge: string; ring: string; dot: string }> = {
  critica: { badge: "bg-rose-500/15 text-rose-500 border-rose-500/30", ring: "border-l-rose-500", dot: "🔴" },
  alta:    { badge: "bg-amber-500/15 text-amber-600 border-amber-500/30", ring: "border-l-amber-500", dot: "🟠" },
  media:   { badge: "bg-sky-500/15 text-sky-500 border-sky-500/30", ring: "border-l-sky-500", dot: "🟡" },
  baixa:   { badge: "bg-muted text-muted-foreground border-border", ring: "border-l-muted", dot: "⚪" },
};

// Categorias tratadas como "oportunidade positiva" (não risco).
const OPPORTUNITY_CATEGORIES = new Set(["cidade", "nicho", "campanha", "script", "horario"]);
function isOpportunity(i: Insight): boolean {
  if (!OPPORTUNITY_CATEGORIES.has(i.category)) return false;
  const t = i.title.toLowerCase();
  return /destaque|campe|lider|melhor|crescimento|evolu|em alta/.test(t);
}
function isRisk(i: Insight): boolean {
  const t = (i.title + " " + i.description).toLowerCase();
  return i.priority === "critica" || i.priority === "alta"
    || /queda|risco|abaixo|baixo|atras|vencid|parad|gargalo/.test(t);
}

function PrioritiesBlock({ tick }: { tick: number }) {
  const all = useMemo(
    () => sortInsights(getInsights().filter((i) => i.status === "active" && isRisk(i))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  );
  const top = all.slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Flame className="h-4 w-4 text-rose-500" />
          Prioridades da Operação
          {top.length > 0 && (
            <Badge variant="outline" className="text-[10px] ml-1">{top.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {top.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            Nenhuma prioridade crítica ativa. A operação segue dentro do esperado.
          </p>
        ) : (
          top.map((i) => {
            const s = PRIO_STYLE[i.priority];
            return (
              <div key={i.id} className={`rounded-md border border-l-4 ${s.ring} p-3`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{i.title}</span>
                  <Badge variant="outline" className={`${s.badge} border text-[10px] uppercase`}>
                    {s.dot} {PRIORITY_LABELS[i.priority]}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {CATEGORY_LABELS[i.category]}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{i.description}</p>
                <p className="text-[11px] mt-1">
                  <span className="font-semibold text-foreground/80">Motivo: </span>
                  <span className="text-muted-foreground">{i.reason}</span>
                </p>
                <p className="text-[11px] mt-1 flex items-start gap-1">
                  <Lightbulb className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                  <span><span className="font-semibold text-foreground/80">Ação: </span>{i.suggestion}</span>
                </p>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// BLOCO 3: ALERTAS
// ------------------------------------------------------------
// Fonte: insights ativos de operação (funil, comercial, metas,
// pipeline, financeiro, crm, produtividade). Dedup pelo causeKey
// (o motor já resolve alertas resolvidos automaticamente).
// ============================================================

const ALERT_CATEGORIES = new Set([
  "funil", "comercial", "metas", "pipeline", "financeiro", "crm", "produtividade",
]);

function AlertsBlock({ tick }: { tick: number }) {
  const alerts = useMemo(() => {
    const active = getInsights().filter(
      (i) => i.status === "active" && ALERT_CATEGORIES.has(i.category)
    );
    return sortInsights(active).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Alertas
          {alerts.length > 0 && (
            <Badge variant="outline" className="text-[10px]">{alerts.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            Sem alertas ativos. Todos os pontos de atenção anteriores foram resolvidos.
          </p>
        ) : (
          alerts.map((i) => {
            const s = PRIO_STYLE[i.priority];
            return (
              <div key={i.id} className={`rounded-md border-l-2 ${s.ring} bg-muted/20 px-3 py-2`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{i.title}</span>
                  <span className="text-[10px] text-muted-foreground">{CATEGORY_LABELS[i.category]}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{i.description}</p>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
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
// BLOCO 7: METAS
// ============================================================

function GoalsBlock({ data, tick }: { data: CentralDataset; tick: number }) {
  const rows = useMemo(() => {
    void tick;
    const dailyGoals = computeDailyGoals();
    const dailyTotals = computeDailyTotals();
    const goals = getGoalsSettings();

    // Ligações / Conexões / Decisores / Reuniões — visão diária
    const list: {
      label: string; icon: ReactNode; done: number; goal: number; formatter?: (n: number) => string;
    }[] = [
      { label: "Ligações (hoje)",  icon: <Phone className="h-3.5 w-3.5" />,       done: dailyTotals.calls,          goal: dailyGoals.calls },
      { label: "Conexões (hoje)",  icon: <Activity className="h-3.5 w-3.5" />,    done: dailyTotals.connections,    goal: dailyGoals.connections },
      { label: "Decisores (hoje)", icon: <Target className="h-3.5 w-3.5" />,      done: dailyTotals.decisionMakers, goal: dailyGoals.decisionMakers },
      { label: "Reuniões (hoje)",  icon: <CalendarClock className="h-3.5 w-3.5" />, done: dailyTotals.meetings,     goal: dailyGoals.meetings },
    ];

    // Receita — visão mensal
    const mk = new Date().toISOString().slice(0, 7);
    const revenue = getTransactions()
      .filter((t) => t.kind === "revenue" && monthKey(t.date) === mk)
      .reduce((a, b) => a + b.amount, 0);
    list.push({
      label: "Receita (mês)",
      icon: <DollarSign className="h-3.5 w-3.5" />,
      done: revenue,
      goal: goals.monthlyRevenueGoal,
      formatter: (n) => formatBRL(n),
    });

    // Pomodoros — visão do período do filtro (contagem)
    list.push({
      label: `Pomodoros (${data.range.label.toLowerCase()})`,
      icon: <Zap className="h-3.5 w-3.5" />,
      done: data.sessions.length,
      goal: Math.max(dailyGoals.calls > 0 ? Math.round(goals.workingDaysPerWeek * (goals.hoursPerDay || 4)) : 0, 4),
    });

    // Previsão de conclusão do mês proporcional (para Receita).
    return list.map((row) => {
      const pct = row.goal > 0 ? Math.min(100, Math.round((row.done / row.goal) * 100)) : 0;
      const fmt = row.formatter || ((n: number) => n.toString());
      let projection: string | null = null;
      if (row.label.startsWith("Receita")) {
        const now = new Date();
        const day = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const projected = day > 0 ? (row.done / day) * daysInMonth : row.done;
        if (row.goal > 0) {
          const projPct = Math.round((projected / row.goal) * 100);
          projection = `Projeção mês: ${fmt(projected)} (${projPct}%)`;
        }
      }
      return { ...row, pct, formatted: `${fmt(row.done)} / ${fmt(row.goal)}`, projection };
    });
  }, [data, tick]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" />
          Metas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                {r.icon} {r.label}
              </span>
              <span className="tabular-nums font-medium">{r.formatted} <span className="text-muted-foreground">· {r.pct}%</span></span>
            </div>
            <div className="h-1.5 bg-muted rounded-sm overflow-hidden">
              <div
                className={
                  r.pct >= 100 ? "h-full bg-emerald-500"
                  : r.pct >= 60 ? "h-full bg-accent"
                  : r.pct >= 30 ? "h-full bg-amber-500"
                  : "h-full bg-rose-500"
                }
                style={{ width: `${r.pct}%` }}
              />
            </div>
            {r.projection && (
              <p className="text-[10px] text-muted-foreground pl-5">{r.projection}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ============================================================
// BLOCO 9: AGENDA
// ============================================================

function AgendaBlock({ tick }: { tick: number }) {
  const items = useMemo(() => {
    void tick;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const meetingItems = getMeetings()
      .filter((m) => m.date === today)
      .map((m) => {
        const at = new Date(`${m.date}T${m.time || "00:00"}:00`);
        return {
          key: `m:${m.id}`,
          type: "Reunião" as const,
          icon: <CalendarClock className="h-3.5 w-3.5" />,
          title: `Reunião com ${m.company}`,
          detail: [m.time, m.channel].filter(Boolean).join(" · "),
          time: m.time || "00:00",
          overdue: at.getTime() < now.getTime(),
          href: m.meetLink || m.link || m.googleEventUrl,
        };
      });

    const reminderItems = getReminders()
      .filter((r) => r.status === "pending")
      .filter((r) => {
        const t = new Date(r.scheduledFor).getTime();
        return t < now.getTime() + 24 * 3600 * 1000;
      })
      .map((r) => {
        const at = new Date(r.scheduledFor);
        return {
          key: `r:${r.id}`,
          type: "Lembrete" as const,
          icon: <ListChecks className="h-3.5 w-3.5" />,
          title: r.title,
          detail: at.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }),
          time: at.toISOString().slice(11, 16),
          overdue: at.getTime() < now.getTime(),
        };
      });

    return [...meetingItems, ...reminderItems]
      .sort((a, b) => (a.overdue === b.overdue ? a.time.localeCompare(b.time) : a.overdue ? -1 : 1))
      .slice(0, 10);
  }, [tick]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-accent" />
          Agenda de Hoje
          {items.length > 0 && (
            <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            Sem compromissos ou lembretes para as próximas 24 horas.
          </p>
        ) : (
          items.map((it) => (
            <div
              key={it.key}
              className={`rounded-md border px-3 py-2 flex items-center gap-3 ${
                it.overdue ? "border-rose-500/50 bg-rose-500/5" : ""
              }`}
            >
              <div className="h-7 w-7 rounded-md bg-muted/50 flex items-center justify-center shrink-0">
                {it.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium truncate">{it.title}</span>
                  <Badge variant="outline" className="text-[10px]">{it.type}</Badge>
                  {it.overdue && (
                    <Badge variant="outline" className="text-[10px] bg-rose-500/15 text-rose-500 border-rose-500/30">
                      Atrasado
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" /> {it.detail}
                </p>
              </div>
              {"href" in it && it.href && (
                <a href={it.href} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="h-7 text-[11px]">Abrir</Button>
                </a>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

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

// Necessário para evitar warning de import não usado em algumas builds.
void CheckCircle2;
