import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AgendaEventCard, MergedEvent } from "./AgendaEventCard";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/shared/utils/utils";

interface AgendaListViewProps {
  range: { start: Date; end: Date };
  events: MergedEvent[];
  view: "dia" | "semana";
  onOpenLead: (leadId: string) => void;
  onRefresh: () => void;
}

export function AgendaListView({ range, events, view, onOpenLead, onRefresh }: AgendaListViewProps) {
  const days: Date[] = [];
  const start = new Date(range.start);
  const end = new Date(range.end);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  return (
    <div className="space-y-6">
      {days.map((day) => {
        const dayEvents = events.filter((e) => isSameDay(e.start, day));
        const isToday = isSameDay(day, new Date());
        
        if (view === "dia" && !isToday && dayEvents.length === 0) return null;

        return (
          <div key={day.toISOString()} className="space-y-3">
            <div className="flex items-center gap-3 px-1">
              <span className={cn(
                "text-sm font-bold capitalize",
                isToday ? "text-accent" : "text-foreground/70"
              )}>
                {format(day, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </span>
              {isToday && (
                <div className="h-px flex-1 bg-accent/20" />
              )}
              {!isToday && (
                <div className="h-px flex-1 bg-border/40" />
              )}
            </div>

            {dayEvents.length === 0 ? (
              <div className="py-8 text-center rounded-xl border border-dashed border-border/50 bg-muted/5">
                <p className="text-xs text-muted-foreground italic">Sem compromissos agendados para este dia.</p>
              </div>
            ) : (
              <div className="grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {dayEvents.map((e) => (
                  <AgendaEventCard 
                    key={e.key} 
                    event={e} 
                    onOpenLead={onOpenLead} 
                    onRefresh={onRefresh} 
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
