import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellRing, Check, Copy, Trash2, Clock, AlertCircle } from "lucide-react";
import {
  getReminders, markReminderStatus, deleteReminder, type Reminder,
} from "@/lib/reminders";
import { requestNotificationPermission } from "@/hooks/useReminderNotifications";
import { getLeads } from "@/lib/store";
import { toast } from "sonner";

type Filter = "today" | "upcoming" | "overdue" | "sent" | "all";

export default function Lembretes() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [perm, setPerm] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );

  const refresh = () => setReminders(getReminders());
  useEffect(() => {
    refresh();
    const i = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(i);
  }, []);

  const leads = useMemo(() => {
    const map = new Map<string, string>();
    getLeads().forEach((l) => map.set(l.id, l.company));
    return map;
  }, [reminders]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    return reminders
      .filter((r) => {
        const t = new Date(r.scheduledFor).getTime();
        if (filter === "sent") return r.status === "sent";
        if (filter === "all") return true;
        if (r.status !== "pending") return false;
        if (filter === "today") return t >= startOfDay.getTime() && t <= endOfDay.getTime();
        if (filter === "overdue") return t < now;
        if (filter === "upcoming") return t >= now;
        return true;
      })
      .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
  }, [reminders, filter]);

  const counts = useMemo(() => {
    const now = Date.now();
    const pend = reminders.filter((r) => r.status === "pending");
    return {
      overdue: pend.filter((r) => new Date(r.scheduledFor).getTime() < now).length,
      today: pend.filter((r) => {
        const t = new Date(r.scheduledFor).getTime();
        const s = new Date(); s.setHours(0,0,0,0);
        const e = new Date(); e.setHours(23,59,59,999);
        return t >= s.getTime() && t <= e.getTime();
      }).length,
      upcoming: pend.filter((r) => new Date(r.scheduledFor).getTime() >= now).length,
    };
  }, [reminders]);

  const askPerm = async () => {
    const p = await requestNotificationPermission();
    setPerm(p);
    if (p === "granted") toast.success("Notificações do Chrome ativadas");
    else if (p === "denied") toast.error("Permissão negada nas configurações do navegador");
  };

  const copy = (r: Reminder) => {
    navigator.clipboard.writeText(r.message);
    toast.success("Mensagem copiada");
  };

  const markSent = (r: Reminder) => {
    markReminderStatus(r.id, "sent");
    refresh();
    toast.success("Marcado como enviado");
  };

  const remove = (r: Reminder) => {
    deleteReminder(r.id);
    refresh();
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Bell className="h-5 w-5 text-accent" /> Lembretes
          </h1>
          <p className="text-xs text-muted-foreground">
            Mensagens prontas para enviar em cada momento da jornada da reunião.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {perm === "granted" ? (
            <Badge className="bg-accent/20 text-accent border-accent/40">
              <BellRing className="h-3 w-3 mr-1" /> Notificações ativas
            </Badge>
          ) : (
            <Button size="sm" onClick={askPerm} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Bell className="h-4 w-4 mr-1" /> Ativar notificações Chrome
            </Button>
          )}
        </div>
      </div>

      {perm !== "granted" && (
        <div className="text-[11px] text-muted-foreground bg-muted/40 rounded p-2">
          Ative para receber uma notificação do navegador na hora exata de cada lembrete.
          Funciona somente enquanto o CRM está aberto em alguma aba.
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <FilterBtn active={filter==="upcoming"} onClick={() => setFilter("upcoming")}>
          Próximos ({counts.upcoming})
        </FilterBtn>
        <FilterBtn active={filter==="today"} onClick={() => setFilter("today")}>
          Hoje ({counts.today})
        </FilterBtn>
        <FilterBtn active={filter==="overdue"} onClick={() => setFilter("overdue")}>
          Atrasados ({counts.overdue})
        </FilterBtn>
        <FilterBtn active={filter==="sent"} onClick={() => setFilter("sent")}>Enviados</FilterBtn>
        <FilterBtn active={filter==="all"} onClick={() => setFilter("all")}>Todos</FilterBtn>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nenhum lembrete nesta visualização.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const when = new Date(r.scheduledFor);
            const overdue = r.status === "pending" && when.getTime() < Date.now();
            return (
              <Card key={r.id} className={overdue ? "border-destructive/40" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-sm">{r.title}</CardTitle>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {leads.get(r.leadId) || "Lead removido"} · {r.kind}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {r.status === "sent" ? (
                        <Badge variant="outline" className="text-[10px]">
                          <Check className="h-3 w-3 mr-1" /> Enviado
                        </Badge>
                      ) : overdue ? (
                        <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                          <AlertCircle className="h-3 w-3 mr-1" /> Atrasado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          <Clock className="h-3 w-3 mr-1" />
                          {when.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <pre className="whitespace-pre-wrap text-xs font-sans bg-muted/40 rounded p-2 max-h-64 overflow-auto">
                    {r.message}
                  </pre>
                  <div className="flex items-center gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={() => copy(r)}>
                      <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                    </Button>
                    {r.status === "pending" && (
                      <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => markSent(r)}>
                        <Check className="h-3.5 w-3.5 mr-1" /> Marcar como enviado
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => remove(r)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md border transition-colors ${
        active
          ? "bg-accent text-accent-foreground border-accent"
          : "border-border hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
