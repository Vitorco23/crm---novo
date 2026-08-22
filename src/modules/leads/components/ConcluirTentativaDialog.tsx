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
import { getStepForLead, type CadenceChannel } from "@/modules/leads/services/cadence";
import { recordActivity, type ActivityChannel } from "@/shared/services/activityLedger";

// Desfechos canônicos — o rótulo muda por canal, a semântica não.
type Outcome =
  | "sem_resposta"       // não atendeu / mensagem enviada sem resposta / interação feita
  | "caixa_postal"       // só ligação
  | "respondeu_interesse"
  | "sem_interesse"
  | "pediu_retorno"
  | "agendou"
  | "contato_invalido"
  | "outro";

interface OutcomeOption { value: Outcome; label: string }

const OPTIONS_BY_CHANNEL: Record<CadenceChannel, OutcomeOption[]> = {
  "Ligação": [
    { value: "sem_resposta", label: "Não atendeu" },
    { value: "caixa_postal", label: "Caixa postal" },
    { value: "sem_interesse", label: "Conversou mas não houve interesse" },
    { value: "pediu_retorno", label: "Pediu retorno" },
    { value: "agendou", label: "Agendou reunião" },
    { value: "contato_invalido", label: "Número inválido" },
    { value: "outro", label: "Outro" },
  ],
  "WhatsApp": [
    { value: "sem_resposta", label: "Mensagem enviada (sem resposta ainda)" },
    { value: "respondeu_interesse", label: "Respondeu com interesse" },
    { value: "sem_interesse", label: "Respondeu sem interesse" },
    { value: "pediu_retorno", label: "Pediu retorno" },
    { value: "agendou", label: "Agendou reunião" },
    { value: "contato_invalido", label: "Número não tem WhatsApp / inválido" },
    { value: "outro", label: "Outro" },
  ],
  "Instagram": [
    { value: "sem_resposta", label: "Interação feita (curtida/comentário)" },
    { value: "respondeu_interesse", label: "Respondeu Story / DM" },
    { value: "sem_interesse", label: "Sem retorno" },
    { value: "agendou", label: "Agendou reunião" },
    { value: "contato_invalido", label: "Perfil inativo ou inexistente" },
    { value: "outro", label: "Outro" },
  ],
  "E-mail": [
    { value: "sem_resposta", label: "E-mail enviado" },
    { value: "respondeu_interesse", label: "Respondeu com interesse" },
    { value: "sem_interesse", label: "Respondeu sem interesse" },
    { value: "contato_invalido", label: "E-mail inválido / bounce" },
    { value: "agendou", label: "Agendou reunião" },
    { value: "outro", label: "Outro" },
  ],
};

const CONTENT_LABEL: Record<CadenceChannel, string | null> = {
  "Ligação": null,
  "WhatsApp": "O que você enviou? (opcional)",
  "Instagram": "O que você fez/enviou? (opcional)",
  "E-mail": "Assunto/conteúdo enviado (opcional)",
};

const ACTIVITY_CHANNEL: Record<CadenceChannel, ActivityChannel> = {
  "Ligação": "call",
  "WhatsApp": "message",
  "Instagram": "message",
  "E-mail": "email",
};

const TITLE_BY_CHANNEL: Record<CadenceChannel, string> = {
  "Ligação": "Como terminou essa tentativa?",
  "WhatsApp": "Como terminou esse contato no WhatsApp?",
  "Instagram": "Como terminou essa interação no Instagram?",
  "E-mail": "Como terminou esse e-mail?",
};

function nextAttemptStage(currentStage: string): string {
  const m = currentStage.match(/tentativa\s*(\d+)/i);
  if (/novo lead/i.test(currentStage)) return "Tentativa 1";
  if (!m) return "Tentativa 1";
  const n = parseInt(m[1], 10);
  if (n >= 9) return "Tentativas Concluídas";
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
  const [sentContent, setSentContent] = useState("");

  if (!lead) return null;
  const step = getStepForLead(lead);
  const channel: CadenceChannel = step?.channel || "Ligação";
  const options = OPTIONS_BY_CHANNEL[channel];
  const contentLabel = CONTENT_LABEL[channel];
  const stepLabel = step ? `T${step.attempt} · ${step.channel} · ${step.nextAction}` : lead.stage;
  const labelFor = (v: Outcome) => options.find((o) => o.value === v)?.label || v;

  const reset = () => {
    setOutcome(""); setReminderDays("none"); setReturnDate(""); setReturnTime("10:00");
    setFreeText(""); setSentContent("");
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
    const contentSuffix = sentContent.trim() ? ` — Conteúdo: ${sentContent.trim()}` : "";
    const note = (body: string) => addCallNote(lead.id, `${noteHeader} ${body}${contentSuffix}`);

    // Toda conclusão de tentativa conta como atividade no canal do passo.
    // O ledger deduplica contra a movimentação/nota gerada logo em seguida.
    recordActivity({ leadId: lead.id, channel: ACTIVITY_CHANNEL[channel], source: "attempt" });

    if (outcome === "sem_resposta" || outcome === "caixa_postal") {
      note(`${labelFor(outcome)} — avançando cadência`);
      const dest = nextAttemptStage(lead.stage);
      // "Sem contato" continua no pipeline cold_call → updateLeadStage é suficiente
      const coldStages = new Set(getStagesForPipeline("cold_call"));
      if (coldStages.has(dest)) updateLeadStage(lead.id, dest);
      else moveLeadToStage(lead.id, dest);
      toast.success(`Lead movido para ${dest}`);
    } else if (outcome === "respondeu_interesse") {
      note(labelFor(outcome));
      toast.success("Resposta registrada. Lead permanece na etapa.");
    } else if (outcome === "sem_interesse") {
      note(labelFor(outcome));
      const oppStages = new Set(getStagesForPipeline("oportunidades"));
      const lostStage = "Perdido";
      if (reminderDays !== "none") {
        const when = new Date();
        when.setDate(when.getDate() + parseInt(reminderDays, 10));
        when.setHours(9, 0, 0, 0);
        scheduleReminder(
          `Retomar ${lead.company}`,
          `Follow-up após ${reminderDays} dias (lead havia recusado).`,
          when.toISOString(),
        );
        toast.info(`Lembrete criado para daqui ${reminderDays} dias`);
      }
      // O movimento é feito pelo LostReasonDialog após o motivo ser informado.
      window.dispatchEvent(
        new CustomEvent("p21:trigger-lost-reason", { detail: { id: lead.id, stage: lostStage } }),
      );

    } else if (outcome === "pediu_retorno") {
      if (!returnDate || !returnTime) { toast.error("Informe data e hora do retorno"); return; }
      const when = new Date(`${returnDate}T${returnTime}:00`);
      if (isNaN(when.getTime())) { toast.error("Data/hora inválida"); return; }
      note(`Pediu retorno em ${when.toLocaleString("pt-BR")}`);
      scheduleReminder(
        `Retornar para ${lead.company}`,
        `${lead.contact || lead.company} pediu retorno.`,
        when.toISOString(),
      );
      toast.success("Lembrete de retorno criado. Lead permanece na etapa.");
    } else if (outcome === "agendou") {
      note("Agendou reunião");
      onOpenChange(false);
      reset();
      onRequestSchedule();
      onDone();
      return;
    } else if (outcome === "contato_invalido") {
      note(labelFor(outcome));
      if (channel === "Ligação" || channel === "WhatsApp") {
        updateLead(lead.id, { phoneInvalid: true });
        updateLeadStage(lead.id, "Tentativas Concluídas");
        toast.success("Lead marcado como telefone inválido e movido para Tentativas Concluídas");
      } else {
        updateLeadStage(lead.id, "Tentativas Concluídas");
        toast.success("Lead movido para Tentativas Concluídas");
      }
    } else if (outcome === "outro") {
      if (!freeText.trim()) { toast.error("Descreva o desfecho"); return; }
      note(freeText.trim());
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
          <DialogTitle>{TITLE_BY_CHANNEL[channel]}</DialogTitle>
          <DialogDescription>{stepLabel}</DialogDescription>
        </DialogHeader>

        <RadioGroup value={outcome} onValueChange={(v) => setOutcome(v as Outcome)} className="space-y-1.5">
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 cursor-pointer hover:bg-accent/5">
              <RadioGroupItem value={o.value} id={`out-${o.value}`} />
              <span className="text-sm">{o.label}</span>
            </label>
          ))}
        </RadioGroup>

        {contentLabel && (
          <div className="mt-3">
            <Label className="text-xs text-muted-foreground">{contentLabel}</Label>
            <Textarea rows={3} value={sentContent} onChange={(e) => setSentContent(e.target.value)}
              placeholder="Cole ou resuma o que foi enviado" />
          </div>
        )}

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
