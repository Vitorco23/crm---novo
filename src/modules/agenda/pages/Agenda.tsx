import { useEffect, useMemo, useState, useCallback } from "react";
import { AgendaRepository } from "@/modules/agenda/services/AgendaRepository";
import { getTasks, type LeadTask } from "@/modules/leads/services/leadTasks";
import { uload } from "@/shared/services/userStorage";
import { 
  addDays, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  addMonths, 
  addWeeks, 
  startOfDay, 
  endOfDay 
} from "date-fns";
import TaskFormDialog from "@/modules/leads/components/TaskFormDialog";
import LeadDetailDrawer from "@/modules/leads/components/LeadDetailDrawer";
import { on } from "@/shared/services/eventBus";
import { toast } from "sonner";

// Internal modules
import { AgendaHeader } from "../components/AgendaHeader";
import { AgendaListView } from "../components/AgendaListView";
import { AgendaMonthView } from "../components/AgendaMonthView";
import { MergedEvent } from "../components/AgendaEventCard";

export type ViewMode = "mes" | "semana" | "dia";

interface GEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  allDay?: boolean;
  htmlLink?: string;
  hangoutLink?: string;
  isTask?: boolean;
  priority?: string;
  status?: string;
}

const KIND_COLORS = {
  meeting: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  google: "bg-slate-500/10 text-slate-300 border-slate-500/30",
};

const PRIORITY_COLOR = {
  baixa: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  media: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  alta: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  urgente: "bg-red-500/10 text-red-400 border-red-500/30",
} as const;

const browserTZ = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

export default function Agenda() {
  const [view, setView] = useState<ViewMode>("semana");
  const [anchor, setAnchor] = useState(new Date());
  const [gEvents, setGEvents] = useState<GEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Lead Detail State
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadDrawerOpen, setLeadDrawerOpen] = useState(false);

  const range = useMemo(() => {
    if (view === "mes") {
      const s = startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 });
      const e = endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 });
      return { start: s, end: e };
    }
    if (view === "semana") {
      return { start: startOfWeek(anchor, { weekStartsOn: 0 }), end: endOfWeek(anchor, { weekStartsOn: 0 }) };
    }
    return { start: startOfDay(anchor), end: endOfDay(anchor) };
  }, [view, anchor]);

  const fetchGoogle = useCallback(async () => {
    setLoading(true);
    try {
      const data = await AgendaRepository.listGoogleEvents({
        timeMin: range.start.toISOString(), timeMax: range.end.toISOString(), timeZone: browserTZ(),
      });
      if (data?.error) {
        if (data.error !== "google_calendar_not_connected") {
          toast.warning("Falha ao carregar Google Agenda", { description: data.details });
        }
        setGEvents([]);
      } else {
        setGEvents((data.events || []) as unknown as GEvent[]);
      }
    } catch (e: any) {
      setGEvents([]);
    } finally {
      setLoading(false);
    }
  }, [range.start.getTime(), range.end.getTime()]);

  useEffect(() => { fetchGoogle(); }, [fetchGoogle]);

  useEffect(() => {
    const offs = [
      on("TarefaCriada", () => { setRefreshKey((x) => x + 1); fetchGoogle(); }),
      on("TarefaAtualizada", () => { setRefreshKey((x) => x + 1); fetchGoogle(); }),
      on("ReuniaoMarcada", () => { setRefreshKey((x) => x + 1); fetchGoogle(); }),
    ];
    return () => offs.forEach((f) => f());
  }, [fetchGoogle]);

  const events = useMemo<MergedEvent[]>(() => {
    void refreshKey;
    const tasks = getTasks();
    const meetings = uload<any[]>("p21_meetings", []);
    const syncedTaskIds = new Set(tasks.filter((t) => t.googleEventId).map((t) => t.googleEventId!));
    const meetingEventIds = new Set(meetings.filter((m) => m.googleEventId).map((m) => m.googleEventId));

    const list: MergedEvent[] = [];

    // Tasks locais
    for (const t of tasks) {
      const start = new Date(t.dueAt);
      if (start < range.start || start > range.end) continue;
      const end = new Date(start.getTime() + t.durationMin * 60000);
      list.push({
        key: `task:${t.id}`,
        title: t.title,
        start, end, kind: "task",
        color: PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.media,
        htmlLink: t.googleEventLink,
        task: t,
        description: t.description
      });
    }

    // Reuniões CRM
    for (const m of meetings) {
      if (!m.date || !m.time) continue;
      const start = new Date(`${m.date}T${m.time}:00`);
      if (isNaN(start.getTime())) continue;
      if (start < range.start || start > range.end) continue;
      list.push({
        key: `mtg:${m.id}`,
        title: m.title || `Reunião ${m.company || ""}`.trim(),
        start,
        end: new Date(start.getTime() + 30 * 60000),
        kind: "meeting",
        color: KIND_COLORS.meeting,
        htmlLink: m.googleEventUrl,
        hangoutLink: m.meetLink,
        description: m.description
      });
    }

    // Google events não duplicados
    for (const g of gEvents) {
      if (syncedTaskIds.has(g.id) || meetingEventIds.has(g.id)) continue;
      if (!g.start) continue;
      const start = new Date(g.start);
      const end = new Date(g.end || g.start);
      if (isNaN(start.getTime())) continue;
      const isTask = g.isTask;
      const color = isTask
        ? (PRIORITY_COLOR[(g.priority as keyof typeof PRIORITY_COLOR)] || PRIORITY_COLOR.media)
        : KIND_COLORS.google;
      list.push({
        key: `gcal:${g.id}`,
        title: g.summary,
        start, end,
        allDay: g.allDay,
        kind: isTask ? "task" : "google",
        color,
        htmlLink: g.htmlLink,
        hangoutLink: g.hangoutLink,
        description: g.description
      });
    }

    return list.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [gEvents, range.start.getTime(), range.end.getTime(), refreshKey]);

  const nav = (dir: -1 | 1) => {
    if (view === "mes") setAnchor(addMonths(anchor, dir));
    else if (view === "semana") setAnchor(addWeeks(anchor, dir));
    else setAnchor(addDays(anchor, dir));
  };

  const handleOpenLead = (leadId: string) => {
    setSelectedLeadId(leadId);
    setLeadDrawerOpen(true);
  };

  const handleRefresh = () => {
    setRefreshKey((x) => x + 1);
    fetchGoogle();
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6 pb-20">
      <AgendaHeader 
        view={view}
        onViewChange={setView}
        anchor={anchor}
        range={range}
        onNav={nav}
        onToday={() => setAnchor(new Date())}
        onRefresh={fetchGoogle}
        onNewTask={() => setTaskOpen(true)}
        loading={loading}
      />

      <div className="mt-2">
        {view === "mes" ? (
          <AgendaMonthView anchor={anchor} range={range} events={events} />
        ) : (
          <AgendaListView 
            range={range} 
            events={events} 
            view={view} 
            onOpenLead={handleOpenLead}
            onRefresh={handleRefresh}
          />
        )}
      </div>

      <TaskFormDialog 
        open={taskOpen} 
        onOpenChange={setTaskOpen} 
        leadId={null} 
        onSaved={handleRefresh} 
      />

      {/* Shared Lead Drawer */}
      {selectedLeadId && (
        <LeadDetailDrawer 
          lead={uload<any[]>("p21_leads", []).find(l => l.id === selectedLeadId) || null}
          open={leadDrawerOpen}
          onOpenChange={setLeadDrawerOpen}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  );
}
