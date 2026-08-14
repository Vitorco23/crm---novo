import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, RefreshCw, Loader2, Plus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ViewMode } from "../pages/Agenda";

interface AgendaHeaderProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  anchor: Date;
  range: { start: Date; end: Date };
  onNav: (dir: -1 | 1) => void;
  onToday: () => void;
  onRefresh: () => void;
  onNewTask: () => void;
  loading: boolean;
}

export function AgendaHeader({
  view,
  onViewChange,
  anchor,
  range,
  onNav,
  onToday,
  onRefresh,
  onNewTask,
  loading
}: AgendaHeaderProps) {
  const titleFmt = view === "mes"
    ? format(anchor, "MMMM 'de' yyyy", { locale: ptBR })
    : view === "semana"
      ? `${format(range.start, "dd/MM", { locale: ptBR })} — ${format(range.end, "dd/MM/yyyy", { locale: ptBR })}`
      : format(anchor, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-accent/10 p-2 rounded-lg">
            <CalendarIcon className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Agenda</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
              Gestão de Compromissos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={onRefresh} 
            disabled={loading}
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
            Sincronizar
          </Button>
          <Button 
            size="sm" 
            className="h-8 bg-accent text-accent-foreground hover:bg-accent/90 text-xs font-semibold px-4" 
            onClick={onNewTask}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Nova Tarefa
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between bg-muted/30 p-1.5 rounded-xl border border-border/50">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-background" onClick={() => onNav(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs font-medium px-3 hover:bg-background" onClick={onToday}>
            Hoje
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-background" onClick={() => onNav(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold capitalize ml-3 text-foreground/90">
            {titleFmt}
          </span>
        </div>

        <ToggleGroup 
          type="single" 
          value={view} 
          onValueChange={(v) => v && onViewChange(v as ViewMode)}
          className="bg-background/50 rounded-lg p-0.5 border border-border/20"
        >
          <ToggleGroupItem value="dia" size="sm" className="h-7 px-3 text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground">
            Dia
          </ToggleGroupItem>
          <ToggleGroupItem value="semana" size="sm" className="h-7 px-3 text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground">
            Semana
          </ToggleGroupItem>
          <ToggleGroupItem value="mes" size="sm" className="h-7 px-3 text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground">
            Mês
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
