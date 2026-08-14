import { format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Video, 
  ExternalLink, 
  ListTodo, 
  MoreHorizontal, 
  MessageCircle, 
  Phone, 
  User, 
  CheckCircle2, 
  Clock, 
  AlertCircle 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LeadTask, completeTask, reopenTask } from "@/modules/leads/services/leadTasks";
import { toast } from "sonner";

export interface MergedEvent {
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
  description?: string;
}

interface AgendaEventCardProps {
  event: MergedEvent;
  onOpenLead: (leadId: string) => void;
  onRefresh: () => void;
}

export function AgendaEventCard({ event, onOpenLead, onRefresh }: AgendaEventCardProps) {
  const isExpired = isPast(event.end) && !isToday(event.end);
  const isTask = event.kind === "task";
  const isCompleted = isTask && event.task?.status === "concluida";
  const isMeeting = event.kind === "meeting" || (event.kind === "google" && !event.task);
  
  const handleToggleTask = () => {
    if (!event.task) return;
    if (isCompleted) {
      reopenTask(event.task.id);
      toast.success("Tarefa reaberta");
    } else {
      completeTask(event.task.id);
      toast.success("Tarefa concluída");
    }
    onRefresh();
  };

  const leadId = event.task?.leadId;
  
  // Extract phone/whatsapp if available in description or title for quick actions
  // In a real app, we'd have the lead object here.
  
  return (
    <div className={cn(
      "group relative flex items-start gap-3 rounded-lg border p-3 transition-all hover:shadow-md",
      event.color,
      isCompleted && "opacity-60 grayscale-[0.5]",
      !isCompleted && isExpired && "border-red-500/50 bg-red-500/5"
    )}>
      {/* Status Icon / Checkbox */}
      <div className="mt-0.5 shrink-0">
        {isTask ? (
          <button 
            onClick={handleToggleTask}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
              isCompleted ? "bg-accent border-accent text-accent-foreground" : "border-muted-foreground/30 hover:border-accent"
            )}
          >
            {isCompleted && <CheckCircle2 className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-accent">
            {isMeeting ? <Video className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "text-sm font-semibold truncate",
              isCompleted && "line-through text-muted-foreground"
            )}>
              {event.title}
            </span>
            {!isCompleted && isExpired && (
              <Badge variant="destructive" className="h-4 text-[9px] px-1 uppercase tracking-tighter">
                Atrasado
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {event.hangoutLink && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-accent" asChild title="Entrar no Meet">
                <a href={event.hangoutLink} target="_blank" rel="noopener noreferrer">
                  <Video className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {leadId && (
                  <DropdownMenuItem onClick={() => onOpenLead(leadId)}>
                    <User className="h-4 w-4 mr-2" /> Ver Lead
                  </DropdownMenuItem>
                )}
                {event.htmlLink && (
                  <DropdownMenuItem asChild>
                    <a href={event.htmlLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" /> Abrir no Google
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {isTask && (
                  <DropdownMenuItem onClick={handleToggleTask}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> 
                    {isCompleted ? "Reabrir Tarefa" : "Concluir Tarefa"}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1 font-mono">
            <Clock className="h-3 w-3" />
            {event.allDay ? "Dia inteiro" : `${format(event.start, "HH:mm")} – ${format(event.end, "HH:mm")}`}
          </span>
          
          {event.task?.priority && (
            <span className="capitalize">
              • Prioridade {event.task.priority}
            </span>
          )}
        </div>

        {event.description && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-2 leading-relaxed italic border-l-2 border-border/30 pl-2">
            {event.description}
          </p>
        )}
      </div>
    </div>
  );
}
