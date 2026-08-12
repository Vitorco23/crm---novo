// ============================================================
// Central de Decisão — centro de comando operacional do CRM.
// ------------------------------------------------------------
// Responsabilidade única: responder "o que eu faço agora?".
// Blocos analíticos (funil, receita, comparativos, ranking,
// gargalo, pipeline) vivem no Dashboard.
//
// Cada bloco é um componente independente e memoizado. Todos
// respondem a `storage` + `p21:storage-synced` (barramento de
// eventos) e recomputam ao vivo — sem botão de atualizar.
// ============================================================

import { useEffect, useMemo, useState, useCallback, ReactNode } from "react";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Compass, AlertTriangle, Target, CalendarClock, ListChecks, Activity,
  Zap, Phone, MessageSquare, Handshake,
  DollarSign, Lightbulb, ArrowRight, Clock,
} from "lucide-react";

import {
  getLeads, getMeetings, getMovementEvents, getSessions,
  getGoalsSettings,
  type Lead, type Meeting, type MovementEvent, type PomodoroSession,
} from "@/shared/services/store";
import { getTransactions, monthKey, formatBRL } from "@/modules/financeiro/services/finance";
import { getReminders } from "@/modules/agenda/services/reminders";
import {
  runInsightsEngine, getInsights, sortInsights, getLastRunAt,
  CATEGORY_LABELS, PRIORITY_LABELS,
  type Insight, type InsightPriority,
} from "@/modules/intelligence/services/insights";
import { computeDailyGoals, computeDailyTotals } from "@/modules/cold-call/services/coldCallMetrics";
import { uload, usave } from "@/shared/services/userStorage";

import PriorityCard from "@/modules/intelligence/components/PriorityCard";
import MissionOfTheDayCard from "@/modules/intelligence/components/MissionOfTheDayCard";
import DiretorComercialIACard from "@/modules/intelligence/components/DiretorComercialIACard";
import PriorityLeadsBlock from "@/modules/intelligence/components/PriorityLeadsBlock";

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
  period: "today",
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
              Centro de comando da operação — o que fazer agora, em que ordem e com quem falar.
              Indicadores históricos ficam no Dashboard.
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

      {/* 0. MISSÃO DO DIA — prioridade única gerada pelo Priority Engine */}
      <MissionOfTheDayCard />

      {/* 0.b DIRETOR COMERCIAL IA — parecer diário */}
      <DiretorComercialIACard />

      {/* 1. O QUE FAZER AGORA */}
      <Section title="O que fazer agora" icon={<Zap className="h-4 w-4" />} accent>
        <PriorityCard />
        <NextActionsList data={data} />
      </Section>

      {/* 1.b LEADS PRIORITÁRIOS DO DIA (IA) */}
      <PriorityLeadsBlock />

      {/* 2. PONTOS DE ATENÇÃO (prioridades + alertas unificados) + AGENDA DE HOJE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OperationalAlertsBlock tick={tick} />
        <AgendaBlock tick={tick} />
      </div>

      {/* 3. METAS DO DIA — execução, não análise histórica */}
      <GoalsBlock data={data} tick={tick} />
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
// BLOCO 2: PONTOS DE ATENÇÃO (Prioridades + Alertas unificados)
// ------------------------------------------------------------
// Sprint 1: "Prioridades da Operação" e "Alertas" comunicavam
// o mesmo problema em dois cards. Agora existe um único
// componente, que ordena os insights ativos por criticidade e
// remove duplicidade pelo id. Nenhuma regra de negócio mudou —
// as fontes (motor de insights) e a ordenação são as mesmas.
// ============================================================

const PRIO_STYLE: Record<InsightPriority, { badge: string; ring: string; dot: string }> = {
  critica: { badge: "bg-rose-500/15 text-rose-500 border-rose-500/30", ring: "border-l-rose-500", dot: "🔴" },
  alta:    { badge: "bg-amber-500/15 text-amber-600 border-amber-500/30", ring: "border-l-amber-500", dot: "🟠" },
  media:   { badge: "bg-sky-500/15 text-sky-500 border-sky-500/30", ring: "border-l-sky-500", dot: "🟡" },
  baixa:   { badge: "bg-muted text-muted-foreground border-border", ring: "border-l-muted", dot: "⚪" },
};

function isRisk(i: Insight): boolean {
  const t = (i.title + " " + i.description).toLowerCase();
  return i.priority === "critica" || i.priority === "alta"
    || /queda|risco|abaixo|baixo|atras|vencid|parad|gargalo/.test(t);
}

const ALERT_CATEGORIES = new Set([
  "funil", "comercial", "metas", "pipeline", "financeiro", "crm", "produtividade",
]);

function OperationalAlertsBlock({ tick }: { tick: number }) {
  const items = useMemo(() => {
    const active = getInsights().filter((i) => i.status === "active");
    const relevant = active.filter((i) => isRisk(i) || ALERT_CATEGORIES.has(i.category));
    const seen = new Set<string>();
    return sortInsights(relevant)
      .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Pontos de Atenção
          {items.length > 0 && (
            <Badge variant="outline" className="text-[10px] ml-1">{items.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            Nenhum ponto de atenção ativo. Siga a missão do dia.
          </p>
        ) : (
          items.map((i) => {
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

