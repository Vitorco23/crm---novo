import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Bell, BellRing, Check, Copy, Trash2, Clock, AlertCircle, Plus, Settings,
} from "lucide-react";
import {
  getReminders, markReminderStatus, deleteReminder, type Reminder,
  getReminderTemplates, upsertReminderTemplate, deleteReminderTemplate,
  type ReminderTemplate, type ReminderAnchor, type ReminderDirection, type ReminderUnit,
} from "@/lib/reminders";
import { requestNotificationPermission } from "@/hooks/useReminderNotifications";
import { getLeads, getStagesForPipeline } from "@/lib/store";
import { pullKeysFromCloud } from "@/lib/userStorage";
import { toast } from "sonner";


type Filter = "today" | "upcoming" | "overdue" | "sent" | "all";

const CONFIGURABLE_STAGES = [
  ...getStagesForPipeline("oportunidades"),
];

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
  const markSent = (r: Reminder) => { markReminderStatus(r.id, "sent"); refresh(); toast.success("Marcado como enviado"); };
  const remove = (r: Reminder) => { deleteReminder(r.id); refresh(); };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Bell className="h-5 w-5 text-accent" /> Lembretes
          </h1>
          <p className="text-xs text-muted-foreground">
            Configure mensagens automáticas por etapa. Elas aparecem aqui na hora certa.
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

      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista"><Bell className="h-3.5 w-3.5 mr-1" /> Lembretes</TabsTrigger>
          <TabsTrigger value="config"><Settings className="h-3.5 w-3.5 mr-1" /> Configurar templates</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-3 mt-3">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <FilterBtn active={filter==="upcoming"} onClick={() => setFilter("upcoming")}>Próximos ({counts.upcoming})</FilterBtn>
            <FilterBtn active={filter==="today"} onClick={() => setFilter("today")}>Hoje ({counts.today})</FilterBtn>
            <FilterBtn active={filter==="overdue"} onClick={() => setFilter("overdue")}>Atrasados ({counts.overdue})</FilterBtn>
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
                            {leads.get(r.leadId) || "Lead removido"}{r.stage ? ` · ${r.stage}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {r.status === "sent" ? (
                            <Badge variant="outline" className="text-[10px]"><Check className="h-3 w-3 mr-1" /> Enviado</Badge>
                          ) : overdue ? (
                            <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive"><AlertCircle className="h-3 w-3 mr-1" /> Atrasado</Badge>
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
                      <pre className="whitespace-pre-wrap text-xs font-sans bg-muted/40 rounded p-2 max-h-64 overflow-auto">{r.message}</pre>
                      <div className="flex items-center gap-2 mt-2">
                        <Button size="sm" variant="outline" onClick={() => copy(r)}><Copy className="h-3.5 w-3.5 mr-1" /> Copiar</Button>
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
        </TabsContent>

        <TabsContent value="config" className="mt-3">
          <TemplatesConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md border transition-colors ${
        active ? "bg-accent text-accent-foreground border-accent" : "border-border hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

// ---------- Templates configuration ----------

function newBlankTemplate(stage: string): ReminderTemplate {
  return {
    id: crypto.randomUUID(),
    stage,
    title: "",
    message: "",
    anchor: "stage_change",
    direction: "after",
    offsetValue: 0,
    offsetUnit: "minutes",
    enabled: true,
    createdAt: new Date().toISOString(),
  };
}

function TemplatesConfig() {
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [stage, setStage] = useState<string>(CONFIGURABLE_STAGES[0] || "Reunião Marcada");

  const refresh = () => setTemplates(getReminderTemplates());
  useEffect(() => {
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.endsWith("p21_reminder_templates")) refresh();
    };
    const onSynced = () => refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("p21:storage-synced", onSynced as EventListener);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("p21:storage-synced", onSynced as EventListener);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const forStage = useMemo(
    () => templates.filter((t) => t.stage.toLowerCase() === stage.toLowerCase()),
    [templates, stage]
  );

  const addNew = () => {
    const t = newBlankTemplate(stage);
    upsertReminderTemplate(t);
    refresh();
  };
  const save = (t: ReminderTemplate) => { upsertReminderTemplate(t); refresh(); };
  const remove = (id: string) => { deleteReminderTemplate(id); refresh(); toast.success("Template removido"); };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-xs">Etapa:</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="w-[240px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONFIGURABLE_STAGES.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <Button size="sm" onClick={addNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="h-3.5 w-3.5 mr-1" /> Novo template
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Ao mover um lead para esta etapa, todos os templates ativos abaixo geram
            lembretes automaticamente. Use os marcadores{" "}
            <code className="bg-muted px-1 rounded">{"{nome}"}</code>,{" "}
            <code className="bg-muted px-1 rounded">{"{empresa}"}</code>,{" "}
            <code className="bg-muted px-1 rounded">{"{data}"}</code>,{" "}
            <code className="bg-muted px-1 rounded">{"{hora}"}</code>,{" "}
            <code className="bg-muted px-1 rounded">{"{link}"}</code>,{" "}
            <code className="bg-muted px-1 rounded">{"{protocolo}"}</code>{" "}
            para preencher automaticamente. Templates com âncora "reunião" só
            disparam se o lead tiver uma reunião marcada.
          </p>
        </CardContent>
      </Card>

      {forStage.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nenhum template configurado para esta etapa. Clique em "Novo template".
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {forStage.map((t) => (
            <TemplateEditor key={t.id} template={t} onSave={save} onDelete={() => remove(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({
  template, onSave, onDelete,
}: { template: ReminderTemplate; onSave: (t: ReminderTemplate) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState<ReminderTemplate>(template);
  useEffect(() => setDraft(template), [template.id]);

  const patch = <K extends keyof ReminderTemplate>(key: K, value: ReminderTemplate[K]) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    onSave(next);
  };

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Input
            value={draft.title}
            placeholder="Título do lembrete"
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onBlur={() => onSave(draft)}
            className="h-8 text-sm"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <Switch checked={draft.enabled} onCheckedChange={(v) => patch("enabled", v)} />
            <span className="text-[11px] text-muted-foreground">{draft.enabled ? "Ativo" : "Pausado"}</span>
          </div>
          <Button size="icon" variant="ghost" onClick={onDelete} className="h-8 w-8 text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Textarea
          value={draft.message}
          placeholder="Mensagem — use {nome} {empresa} {data} {hora} {link} {protocolo}"
          rows={4}
          onChange={(e) => setDraft({ ...draft, message: e.target.value })}
          onBlur={() => onSave(draft)}
          className="text-xs"
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Quando disparar</Label>
            <Select value={draft.anchor} onValueChange={(v) => patch("anchor", v as ReminderAnchor)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stage_change" className="text-xs">Ao entrar na etapa</SelectItem>
                <SelectItem value="meeting" className="text-xs">Relativo à reunião</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Antes/Depois</Label>
            <Select value={draft.direction} onValueChange={(v) => patch("direction", v as ReminderDirection)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="before" className="text-xs">Antes</SelectItem>
                <SelectItem value="after" className="text-xs">Depois</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Quantidade</Label>
            <Input
              type="number"
              min={0}
              value={draft.offsetValue}
              onChange={(e) => setDraft({ ...draft, offsetValue: Number(e.target.value) || 0 })}
              onBlur={() => onSave(draft)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Unidade</Label>
            <Select value={draft.offsetUnit} onValueChange={(v) => patch("offsetUnit", v as ReminderUnit)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes" className="text-xs">minutos</SelectItem>
                <SelectItem value="hours" className="text-xs">horas</SelectItem>
                <SelectItem value="days" className="text-xs">dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground">
          {draft.anchor === "meeting"
            ? `Dispara ${draft.offsetValue} ${draft.offsetUnit === "minutes" ? "min" : draft.offsetUnit === "hours" ? "h" : "dias"} ${draft.direction === "before" ? "antes" : "depois"} da reunião marcada do lead.`
            : `Dispara ${draft.offsetValue === 0 ? "imediatamente" : `${draft.offsetValue} ${draft.offsetUnit === "minutes" ? "min" : draft.offsetUnit === "hours" ? "h" : "dias"} ${draft.direction === "before" ? "antes" : "depois"}`} de entrar na etapa "${draft.stage}".`}
        </p>
      </CardContent>
    </Card>
  );
}
