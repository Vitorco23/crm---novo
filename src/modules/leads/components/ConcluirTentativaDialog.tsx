import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  type Lead,
  addCallNote,
  updateLead,
  updateLeadStage,
  moveLeadToStage,
  getStagesForPipeline,
} from "@/shared/services/store";
import { upsertReminders, type Reminder } from "@/modules/agenda/services/reminders";
import { getStepForLead } from "@/modules/leads/services/cadence";

type Outcome =
  | "nao_atendeu"
  | "caixa_postal"
  | "sem_interesse"
  | "pediu_retorno"
  | "agendou"
  | "numero_invalido"
  | "outro";

const OPTIONS: { value: Outcome; label: string }[] = [
  { value: "nao_atendeu", label: "Não atendeu" },
  { value: "caixa_postal", label: "Caixa postal" },
  { value: "sem_interesse", label: "Conversou mas não houve interesse" },
  { value: "pediu_retorno", label: "Pediu retorno" },
  { value: "agendou", label: "Agendou reunião" },
  { value: "numero_invalido", label: "Número inválido" },
  { value: "outro", label: "Outro" },
];

function nextAttemptStage(currentStage: string): string {
  const m = currentStage.match(/tentativa\s*(\d+)/i);
  if (/novo lead/i.test(currentStage)) return "Tentativa 1";
  if (!m) return "Tentativa 1";
  const n = parseInt(m[1], 10);
  if (n >= 10) return "Sem contato";
  return `Tentativa ${n + 1}`;
}

interface Props {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  onRequestSchedule: () => void; // abre ScheduleMeetingDialog do pai
}

export default function ConcluirTentativaDialog({ lead, open, onOpenChange, onDone, onRequestSchedule }: Props) {
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [reminderDays, setReminderDays] = useState<"30" | "60" | "90" | "none">("none");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("10:00");
  const [freeText, setFreeText] = useState("");

  if (!lead) return null;
  const step = getStepForLead(lead);
  const stepLabel = step ? `D${step.day} · ${step.channel} · ${step.nextAction}` : lead.stage;

  const reset = () => {
    setOutcome(""); setReminderDays("none"); setReturnDate(""); setReturnTime("10:00"); setFreeText("");
  };

  const scheduleReminder = (title: string, message: string, whenISO: string) => {
    const r: Reminder = {
      id: crypto.randomUUID(),
      leadId: lead.id,
      stage: lead.stage,
      kind: "cadence:manual",
      title,
      message,
      scheduledFor: whenISO,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    upsertReminders([r]);
  };

  const submit = () => {
    if (!outcome) { toast.error("Selecione um desfecho"); return; }
    const noteHeader = `[Cadência ${stepLabel}]`;

    // Toda conclusão de tentativa conta como uma ligação (fonte "tentativa").
    // O ledger deduplica contra a movimentação/nota gerada logo em seguida.
    recordActivity({ leadId: lead.id, channel: "call", source: "attempt" });

    if (outcome === "nao_atendeu" || outcome === "caixa_postal") {
      const label = outcome === "nao_atendeu" ? "Não atendeu" : "Caixa postal";
      addCallNote(lead.id, `${noteHeader} ${label} — avançando cadência`);
      const dest = nextAttemptStage(lead.stage);
      // "Sem contato" continua no pipeline cold_call → updateLeadStage é suficiente
      const coldStages = new Set(getStagesForPipeline("cold_call"));
      if (coldStages.has(dest)) updateLeadStage(lead.id, dest);
      else moveLeadToStage(lead.id, dest);
      toast.success(`Lead movido para ${dest}`);
    } else if (outcome === "sem_interesse") {
      addCallNote(lead.id, `${noteHeader} Sem interesse`);
      updateLeadStage(lead.id, "Não Quer");
      if (reminderDays !== "none") {
        const when = new Date();
        when.setDate(when.getDate() + parseInt(reminderDays, 10));
        when.setHours(9, 0, 0, 0);
        scheduleReminder(
          `Retomar ${lead.company}`,
          `Follow-up após ${reminderDays} dias (lead havia recusado).`,
          when.toISOString(),
        );
        toast.success(`Movido para "Não Quer" · lembrete em ${reminderDays} dias`);
      } else {
        toast.success('Movido para "Não Quer"');
      }
    } else if (outcome === "pediu_retorno") {
      if (!returnDate || !returnTime) { toast.error("Informe data e hora do retorno"); return; }
      const when = new Date(`${returnDate}T${returnTime}:00`);
      if (isNaN(when.getTime())) { toast.error("Data/hora inválida"); return; }
      addCallNote(lead.id, `${noteHeader} Pediu retorno em ${when.toLocaleString("pt-BR")}`);
      scheduleReminder(
        `Retornar para ${lead.company}`,
        `${lead.contact || lead.company} pediu retorno.`,
        when.toISOString(),
      );
      toast.success("Lembrete de retorno criado. Lead permanece na etapa.");
    } else if (outcome === "agendou") {
      addCallNote(lead.id, `${noteHeader} Agendou reunião`);
      onOpenChange(false);
      reset();
      onRequestSchedule();
      onDone();
      return;
    } else if (outcome === "numero_invalido") {
      addCallNote(lead.id, `${noteHeader} Número inválido`);
      updateLead(lead.id, { phoneInvalid: true });
      updateLeadStage(lead.id, "Sem contato");
      toast.success("Lead marcado como telefone inválido");
    } else if (outcome === "outro") {
      if (!freeText.trim()) { toast.error("Descreva o desfecho"); return; }
      addCallNote(lead.id, `${noteHeader} ${freeText.trim()}`);
      toast.success("Anotação registrada");
    }

    onOpenChange(false);
    reset();
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Como terminou essa tentativa?</DialogTitle>
          <DialogDescription>{stepLabel}</DialogDescription>
        </DialogHeader>

        <RadioGroup value={outcome} onValueChange={(v) => setOutcome(v as Outcome)} className="space-y-1.5">
          {OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 cursor-pointer hover:bg-accent/5">
              <RadioGroupItem value={o.value} id={`out-${o.value}`} />
              <span className="text-sm">{o.label}</span>
            </label>
          ))}
        </RadioGroup>

        {outcome === "sem_interesse" && (
          <div className="mt-3 space-y-2">
            <Label className="text-xs text-muted-foreground">Criar lembrete para retornar em:</Label>
            <div className="grid grid-cols-4 gap-1">
              {(["none", "30", "60", "90"] as const).map((d) => (
                <Button key={d} type="button" size="sm"
                  variant={reminderDays === d ? "default" : "outline"}
                  onClick={() => setReminderDays(d)}>
                  {d === "none" ? "Não" : `${d}d`}
                </Button>
              ))}
            </div>
          </div>
        )}

        {outcome === "pediu_retorno" && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Data</Label>
              <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Hora</Label>
              <Input type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} />
            </div>
          </div>
        )}

        {outcome === "outro" && (
          <div className="mt-3">
            <Label className="text-xs text-muted-foreground">Descreva o desfecho</Label>
            <Textarea rows={3} value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder="O que aconteceu?" />
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={submit} disabled={!outcome}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
