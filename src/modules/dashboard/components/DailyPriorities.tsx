import { useMemo, useState, useEffect } from "react";
import { 
  computePriorities, 
  type LeadPriority, 
  ACTION_LABEL 
} from "@/modules/intelligence/services/priorityEngine";
import { getLeads, findLeadById } from "@/shared/services/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  ArrowRight, 
  AlertCircle, 
  Calendar, 
  ChevronRight,
  ExternalLink,
  Phone,
  MessageCircle,
  Mail,
  FileText,
  UserCheck
} from "lucide-react";
import { cn } from "@/shared/utils/utils";
import LeadDetailDrawer from "@/modules/leads/components/LeadDetailDrawer";

export default function DailyPriorities() {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
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

  const priorities = useMemo(() => {
    const allLeads = getLeads();
    return computePriorities(allLeads).slice(0, 10);
  }, [tick]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case "call": return <Phone className="h-3 w-3" />;
      case "whatsapp": return <MessageCircle className="h-3 w-3" />;
      case "email": return <Mail className="h-3 w-3" />;
      case "send_proposal": return <FileText className="h-3 w-3" />;
      case "schedule_meeting": return <Calendar className="h-3 w-3" />;
      case "close_deal": return <UserCheck className="h-3 w-3" />;
      default: return <ArrowRight className="h-3 w-3" />;
    }
  };

  if (priorities.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Tudo em dia! Nenhuma prioridade crítica para agora.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-orange-500" />
          Próximas Ações
        </h3>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {priorities.length} ITENS
        </span>
      </div>

      <div className="grid gap-2">
        {priorities.map((p) => (
          <div 
            key={p.leadId}
            className="group relative flex items-center justify-between p-3 rounded-xl border border-border bg-card hover:border-accent/40 transition-all cursor-pointer"
            onClick={() => setSelectedLeadId(p.leadId)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                p.tier === "critica" ? "bg-red-500/10 text-red-500" :
                p.tier === "alta" ? "bg-orange-500/10 text-orange-500" :
                "bg-accent/10 text-accent"
              )}>
                {getActionIcon(p.action)}
              </div>
              
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold text-foreground truncate">
                    {p.company}
                  </span>
                  <Badge variant="outline" className={cn(
                    "text-[9px] h-4 px-1.5 uppercase font-bold border-transparent",
                    p.tier === "critica" ? "bg-red-500/10 text-red-500" :
                    p.tier === "alta" ? "bg-orange-500/10 text-orange-500" :
                    "bg-accent/10 text-accent"
                  )}>
                    {p.tier}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-md">
                    {p.actionReason}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 ml-4">
              <div className="hidden sm:flex flex-col items-end text-right">
                <span className="text-[10px] font-medium text-foreground">
                  {p.actionLabel}
                </span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  ~{p.estimatedMinutes} min
                </span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
            </div>
          </div>
        ))}
      </div>

      {selectedLeadId && (
        <LeadDetailDrawer
          lead={findLeadById(selectedLeadId)}
          open={!!selectedLeadId}
          onOpenChange={(open) => !open && setSelectedLeadId(null)}
          onRefresh={() => setTick((t) => t + 1)}
        />
      )}
    </div>
  );
}
