import { format, isSameDay, isSameMonth, addDays, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MergedEvent } from "./AgendaEventCard";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/shared/utils/utils";

interface AgendaMonthViewProps {
  anchor: Date;
  range: { start: Date; end: Date };
  events: MergedEvent[];
}

export function AgendaMonthView({ anchor, range, events }: AgendaMonthViewProps) {
  const days: Date[] = [];
  const start = new Date(range.start);
  const end = new Date(range.end);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <Card className="border-border/40 shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="grid grid-cols-7 border-b border-border/40 bg-muted/30">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
            <div key={d} className="text-center py-2 text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <div className="divide-y divide-border/40">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 divide-x divide-border/40 min-h-[120px]">
              {week.map((day) => {
                const dayEvents = events.filter((e) => isSameDay(e.start, day));
                const inMonth = isSameMonth(day, anchor);
                const isToday = isSameDay(day, new Date());
                
                return (
                  <div 
                    key={day.toISOString()} 
                    className={cn(
                      "p-1 transition-colors",
                      !inMonth && "bg-muted/5 opacity-40",
                      inMonth && "bg-background hover:bg-muted/5",
                      isToday && "bg-accent/5"
                    )}
                  >
                    <div className="flex justify-between items-center mb-1 p-1">
                      <span className={cn(
                        "text-[11px] font-bold h-6 w-6 flex items-center justify-center rounded-full",
                        isToday ? "bg-accent text-accent-foreground" : "text-foreground/70"
                      )}>
                        {format(day, "d")}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="text-[9px] font-medium text-muted-foreground px-1 bg-muted/20 rounded">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((e) => (
                        <div 
                          key={e.key}
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-medium truncate border",
                            e.color,
                            e.task?.status === "concluida" && "opacity-50 line-through"
                          )}
                        >
                          {!e.allDay && <span className="opacity-70 mr-1">{format(e.start, "HH:mm")}</span>}
                          {e.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[9px] text-center font-semibold text-accent/80 pt-0.5">
                          + {dayEvents.length - 3} mais
                        </div>
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
