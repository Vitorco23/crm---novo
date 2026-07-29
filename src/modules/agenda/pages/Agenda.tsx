import { useEffect, useMemo, useState, useCallback } from "react";
import { AgendaRepository } from "@/modules/agenda/services/AgendaRepository";
import { getTasks, PRIORITY_CLASSES, PRIORITY_LABEL, type LeadTask } from "@/modules/leads/services/leadTasks";
import { uload } from "@/shared/services/userStorage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Loader2, ChevronLeft, ChevronRight, RefreshCw, Video, ExternalLink, ListTodo, CalendarIcon, Plus } from "lucide-react";
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addMonths, addWeeks, isSameDay, isSameMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import TaskFormDialog from "@/modules/leads/components/TaskFormDialog";
import { on } from "@/shared/services/eventBus";
import { toast } from "sonner";

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

interface MergedEvent {
  key: string;
  title: string;
  start: Date;
  end: Date;
  kind: "task" | "meeting" | "google";
  allDay?: boolean;
  color: string;
  htmlLink?: string;
  hangoutLink?: string;
  task?: LeadTask;
}

const KIND_COLORS = {
  meeting: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  google: "bg-slate-500/20 text-slate-200 border-slate-500/40",
};

const PRIORITY_COLOR = {
  baixa: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  media: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  alta: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  urgente: "bg-red-500/20 text-red-300 border-red-500/40",
} as const;

type ViewMode = "mes" | "semana" | "dia";

const browserTZ = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

export default function Agenda() {
  const [view, setView] = useState<ViewMode>("semana");
  const [anchor, setAnchor] = useState(new Date());
  const [gEvents, setGEvents] = useState<GEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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
        console.warn("[Agenda] google list error", data);
        if (data.error !== "google_calendar_not_connected") {
          toast.warning("Falha ao carregar Google Agenda", { description: data.details });
        }
        setGEvents([]);
      } else {
        setGEvents((data.events || []) as unknown as GEvent[]);
      }
    } catch (e: any) {
      console.warn("[Agenda] fetch failed", e);
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

  // Merge tasks + meetings + google events (dedup by googleEventId)
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
        title: t.title + (t.status === "concluida" ? " ✓" : ""),
        start, end, kind: "task",
        color: PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.media,
        htmlLink: t.googleEventLink,
        task: t,
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
      });
    }

    return list.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [gEvents, range.start.getTime(), range.end.getTime(), refreshKey]);

  const nav = (dir: -1 | 1) => {
    if (view === "mes") setAnchor(addMonths(anchor, dir));
    else if (view === "semana") setAnchor(addWeeks(anchor, dir));
    else setAnchor(addDays(anchor, dir));
  };

  const titleFmt = view === "mes"
    ? format(anchor, "MMMM 'de' yyyy", { locale: ptBR })
    : view === "semana"
      ? `${format(range.start, "dd/MM", { locale: ptBR })} — ${format(range.end, "dd/MM/yyyy", { locale: ptBR })}`
      : format(anchor, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-accent" /> Agenda
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Reuniões e tarefas — sincronizado com Google Agenda</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={fetchGoogle} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Atualizar
          </Button>
          <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setTaskOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nova Tarefa
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => nav(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setAnchor(new Date())}>Hoje</Button>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => nav(1)}><ChevronRight className="h-4 w-4" /></Button>
          <span className="text-sm font-medium capitalize ml-2">{titleFmt}</span>
        </div>
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as ViewMode)}>
          <ToggleGroupItem value="mes" size="sm">Mês</ToggleGroupItem>
          <ToggleGroupItem value="semana" size="sm">Semana</ToggleGroupItem>
          <ToggleGroupItem value="dia" size="sm">Dia</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {view === "mes" ? <MonthView anchor={anchor} range={range} events={events} /> : <ListView range={range} events={events} view={view} />}

      <TaskFormDialog open={taskOpen} onOpenChange={setTaskOpen} leadId={null} onSaved={() => { setRefreshKey((x) => x + 1); fetchGoogle(); }} />
    </div>
  );
}

function MonthView({ anchor, range, events }: { anchor: Date; range: { start: Date; end: Date }; events: MergedEvent[] }) {
  const days: Date[] = [];
  for (let d = new Date(range.start); d <= range.end; d = addDays(d, 1)) days.push(new Date(d));
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <Card>
      <CardContent className="p-2">
        <div className="grid grid-cols-7 text-[10px] uppercase tracking-wider text-muted-foreground pb-1">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="text-center py-1">{d}</div>)}
        </div>
        <div className="space-y-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((day) => {
                const dayEvents = events.filter((e) => isSameDay(e.start, day));
                const inMonth = isSameMonth(day, anchor);
                const isToday = isSameDay(day, new Date());
                return (
                  <div key={day.toISOString()} className={`min-h-[100px] rounded border p-1 ${inMonth ? "bg-muted/10" : "bg-muted/5 opacity-50"} ${isToday ? "border-accent/60" : "border-border/40"}`}>
                    <div className={`text-xs font-medium mb-1 ${isToday ? "text-accent" : ""}`}>{format(day, "d")}</div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((e) => (
                        <a key={e.key} href={e.htmlLink || "#"} target={e.htmlLink ? "_blank" : undefined} rel="noopener noreferrer"
                           className={`block text-[10px] px-1 py-0.5 rounded border truncate ${e.color} hover:brightness-125`}>
                          {!e.allDay && <span className="opacity-70">{format(e.start, "HH:mm")} </span>}{e.title}
                        </a>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} mais</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ListView({ range, events, view }: { range: { start: Date; end: Date }; events: MergedEvent[]; view: ViewMode }) {
  const days: Date[] = [];
  for (let d = new Date(range.start); d <= range.end; d = addDays(d, 1)) days.push(new Date(d));

  return (
    <div className="space-y-3">
      {days.map((day) => {
        const dayEvents = events.filter((e) => isSameDay(e.start, day));
        const isToday = isSameDay(day, new Date());
        return (
          <Card key={day.toISOString()} className={isToday ? "border-accent/50" : ""}>
            <CardHeader className="py-2 px-4">
              <CardTitle className={`text-sm font-medium capitalize ${isToday ? "text-accent" : ""}`}>
                {format(day, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                {isToday && <Badge variant="outline" className="ml-2 text-[10px] border-accent/50 text-accent">Hoje</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-4">
              {dayEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 py-2">Sem eventos</p>
              ) : (
                <div className="space-y-1.5">
                  {dayEvents.map((e) => (
                    <div key={e.key} className={`flex items-start gap-2 rounded border p-2 ${e.color}`}>
                      <div className="text-xs font-mono shrink-0 w-24">
                        {e.allDay ? "dia inteiro" : `${format(e.start, "HH:mm")} – ${format(e.end, "HH:mm")}`}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {e.kind === "task" && <ListTodo className="h-3 w-3 shrink-0" />}
                          {e.kind === "meeting" && <Video className="h-3 w-3 shrink-0" />}
                          <span className="text-sm font-medium">{e.title}</span>
                        </div>
                        <div className="flex gap-2 mt-0.5">
                          {e.hangoutLink && (
                            <a href={e.hangoutLink} target="_blank" rel="noopener noreferrer" className="text-[10px] inline-flex items-center gap-0.5 hover:underline">
                              <Video className="h-2.5 w-2.5" /> Meet
                            </a>
                          )}
                          {e.htmlLink && (
                            <a href={e.htmlLink} target="_blank" rel="noopener noreferrer" className="text-[10px] inline-flex items-center gap-0.5 hover:underline">
                              <ExternalLink className="h-2.5 w-2.5" /> Google
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
