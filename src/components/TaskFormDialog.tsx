import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CalendarIcon, Loader2, ListTodo } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { addTask, updateTask, type LeadTask, type TaskPriority } from "@/lib/leadTasks";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string | null;
  leadName?: string;
  editing?: LeadTask | null;
  onSaved?: (task: LeadTask) => void;
}

const browserTZ = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

export default function TaskFormDialog({ open, onOpenChange, leadId, leadName, editing, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState("09:00");
  const [durationMin, setDurationMin] = useState(30);
  const [priority, setPriority] = useState<TaskPriority>("media");
  const [syncGoogle, setSyncGoogle] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description || "");
      const d = new Date(editing.dueAt);
      setDate(format(d, "yyyy-MM-dd"));
      setTime(format(d, "HH:mm"));
      setDurationMin(editing.durationMin);
      setPriority(editing.priority);
      setSyncGoogle(!!editing.googleEventId);
    } else {
      setTitle("");
      setDescription("");
      setDate(format(new Date(), "yyyy-MM-dd"));
      setTime("09:00");
      setDurationMin(30);
      setPriority("media");
      setSyncGoogle(true);
    }
  }, [open, editing?.id]);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Informe o título da tarefa."); return; }
    setSaving(true);
    try {
      const dueAt = new Date(`${date}T${time}:00`).toISOString();
      let googleEventId = editing?.googleEventId;
      let googleEventLink = editing?.googleEventLink;

      // Google Calendar sync
      if (syncGoogle) {
        if (editing?.googleEventId) {
          // update
          try {
            const { data, error } = await supabase.functions.invoke("update-task-event", {
              body: { eventId: editing.googleEventId, title, description, dueISO: dueAt, durationMin, timeZone: browserTZ(), priority },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.details || data.error);
            googleEventLink = data.htmlLink || googleEventLink;
          } catch (e: any) {
            console.warn("[TaskForm] update google failed", e);
            toast.warning("Tarefa salva, mas falhou ao atualizar Google Agenda", { description: e?.message });
          }
        } else {
          try {
            const { data, error } = await supabase.functions.invoke("create-task-event", {
              body: { title, description, dueISO: dueAt, durationMin, timeZone: browserTZ(), priority },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.details || data.error);
            googleEventId = data.eventId;
            googleEventLink = data.htmlLink;
          } catch (e: any) {
            console.warn("[TaskForm] create google failed", e);
            toast.warning("Tarefa salva localmente. Google Agenda falhou", { description: e?.message });
          }
        }
      } else if (editing?.googleEventId) {
        // desmarcou sync → deletar do google
        try {
          await supabase.functions.invoke("delete-task-event", { body: { eventId: editing.googleEventId } });
        } catch {}
        googleEventId = undefined;
        googleEventLink = undefined;
      }

      let saved: LeadTask;
      if (editing) {
        saved = updateTask(editing.id, {
          title: title.trim(), description: description.trim() || undefined,
          dueAt, durationMin, priority,
          googleEventId, googleEventLink,
        })!;
        toast.success("Tarefa atualizada");
      } else {
        saved = addTask({
          leadId, title: title.trim(), description: description.trim() || undefined,
          dueAt, durationMin, priority,
          googleEventId, googleEventLink,
        });
        toast.success("Tarefa criada");
      }
      onSaved?.(saved);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-accent" />
            {editing ? "Editar Tarefa" : "Nova Tarefa"}
          </DialogTitle>
          {leadName && (
            <DialogDescription className="text-xs">Vinculada a: {leadName}</DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Título *</Label>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Enviar proposta comercial" />
          </div>
          <div>
            <Label className="text-xs">Descrição</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes, contexto, links..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                    <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                    {date ? format(parseISO(date), "dd/MM/yyyy", { locale: ptBR }) : "Escolher"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                  <Calendar mode="single" locale={ptBR} selected={parseISO(date)}
                    onSelect={(d) => d && setDate(format(d, "yyyy-MM-dd"))}
                    initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs">Hora *</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Duração</Label>
              <Select value={String(durationMin)} onValueChange={(v) => setDurationMin(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                  <SelectItem value="120">2 horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">🟢 Baixa</SelectItem>
                  <SelectItem value="media">🟡 Média</SelectItem>
                  <SelectItem value="alta">🟠 Alta</SelectItem>
                  <SelectItem value="urgente">🔴 Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 border border-border/40">
            <div>
              <Label className="text-sm">Adicionar ao Google Agenda</Label>
              <p className="text-[10px] text-muted-foreground">Aparece como evento no dia/hora com lembrete de 15min</p>
            </div>
            <Switch checked={syncGoogle} onCheckedChange={setSyncGoogle} />
          </div>
          <Button onClick={handleSave} disabled={saving || !title.trim()} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
            {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Salvando</> : (editing ? "Salvar alterações" : "Criar tarefa")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
