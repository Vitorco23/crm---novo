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
  type InteractionType,
  addCallNote,
  updateLead,
  updateLeadStage,
  moveLeadToStage,
  getStagesForPipeline,
} from "@/shared/services/store";
import { upsertReminders, type Reminder } from "@/modules/agenda/services/reminders";
import { getStepForLead, type CadenceChannel } from "@/modules/leads/services/cadence";
import { recordActivity, type ActivityChannel, type CadenceOutcome, type TalkedTo } from "@/shared/services/activityLedger";
import { findCorrelatedCallfaceInteraction } from "@/shared/services/commercialActivity";

// Desfechos canônicos — o rótulo muda por canal, a semântica não.
// Sprint 2A: este é o mesmo vocabulário gravado como dado estruturado no
// ledger (`CadenceOutcome`) — nunca mais inferido do texto da nota.
type Outcome = CadenceOutcome;

interface OutcomeOption { value: Outcome; label: string }

/** Outcomes do canal Ligação que, por si só, já provam que houve conversa —
 * ver definição aprovada do Sprint 2A. Não ambíguo, não pergunta de novo. */
const LIGACAO_CONNECTED_OUTCOMES = new Set<Outcome>(["sem_interesse", "pediu_retorno", "agendou"]);

const TALKED_TO_OPTIONS: { value: TalkedTo; label: string }[] = [
  { value: "decisor", label: "Decisor" },
  { value: "intermediario", label: "Intermediário / recepção" },
  { value: "nao_identificado", label: "Não identificado" },
];

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

/** `CadenceChannel` e `InteractionType` usam os mesmos rótulos — mapeamento
 * direto, sem conversão. Sprint 2A: antes disso, `addCallNote` gravava
 * sempre "Ligação" aqui, não importa o canal real do passo. */
const INTERACTION_TYPE: Record<CadenceChannel, InteractionType> = {
  "Ligação": "Ligação",
  "WhatsApp": "WhatsApp",
  "Instagram": "Instagram",
  "E-mail": "E-mail",
};

/** Outcomes ambíguos: a tentativa pode ou não ter de fato ocorrido — nunca
 * inferido, sempre uma confirmação estruturada explícita do vendedor. */
const AMBIGUOUS_ATTEMPT_OUTCOMES = new Set<Outcome>(["contato_invalido", "outro"]);

/** Outcomes onde a tentativa em si é inequívoca (só falta saber se conectou). */
const UNAMBIGUOUS_ATTEMPT_OUTCOMES = new Set<Outcome>([
  "sem_resposta", "caixa_postal", "respondeu_interesse", "sem_interesse", "pediu_retorno", "agendou",
]);

const TITLE_BY_CHANNEL: Record<CadenceChannel, string> = {
  "Ligação": "Como terminou essa tentativa?",
  "WhatsApp": "Como terminou esse contato no WhatsApp?",
  "Instagram": "Como terminou essa interação no Instagram?",
  "E-mail": "Como terminou esse e-mail?",
};

function terminalColdCallStage(): string {
  const stages = getStagesForPipeline("cold_call");
  return stages.find((stage) => /conclu|encerr|final/i.test(stage)) || stages[stages.length - 1] || "Tentativas Concluídas";
}

function nextAttemptStage(currentStage: string): string {
  const m = currentStage.match(/tentativa\s*(\d+)/i);
  if (/novo lead/i.test(currentStage)) return "Tentativa 1";
  if (!m) return "Tentativa 1";
  const n = parseInt(m[1], 10);
  if (n >= 9) return terminalColdCallStage();
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
  // Sprint 2A — captura estruturada, nunca inferida do texto livre.
  const [attemptPerformed, setAttemptPerformed] = useState(false); // contato_invalido / outro
  const [connectedOutro, setConnectedOutro] = useState(false); // só quando "outro" + attemptPerformed
  const [talkedTo, setTalkedTo] = useState<TalkedTo | "">("");

  if (!lead) return null;
  const step = getStepForLead(lead);
  const channel: CadenceChannel = step?.channel || "Ligação";
  const options = OPTIONS_BY_CHANNEL[channel];
  const contentLabel = CONTENT_LABEL[channel];
  const stepLabel = step ? `T${step.attempt} · ${step.channel} · ${step.nextAction}` : lead.stage;
  const labelFor = (v: Outcome) => options.find((o) => o.value === v)?.label || v;

  // Este outcome, neste canal, já prova conexão por si só (ver definição
  // aprovada do Sprint 2A) — só pergunta "com quem falou" nesses casos.
  const asksTalkedTo = channel === "Ligação" && outcome !== "" && LIGACAO_CONNECTED_OUTCOMES.has(outcome as Outcome);

  const reset = () => {
    setOutcome(""); setReminderDays("none"); setReturnDate(""); setReturnTime("10:00");
    setFreeText(""); setSentContent("");
    setAttemptPerformed(false); setConnectedOutro(false); setTalkedTo("");
  };

  /** Grava o evento estruturado de atividade — nunca antes das validações do
   * formulário terem passado (Sprint 2A, correção do bug de ordenação).
   * Canal Ligação: procura uma Interaction CallFace do mesmo lead a
   * correlacionar explicitamente (10min, nunca reutilizada) — só assim o
   * dedupe em `commercialActivity` deixa de contar a mesma ligação duas
   * vezes. Sem correlação encontrada, grava normalmente, sem vínculo. */
  const recordCadence = (extra: { attemptPerformed?: boolean; connected?: boolean } = {}) => {
    if (!outcome) return;
    const at = new Date().toISOString();
    const relatedExternalKey =
      channel === "Ligação" ? findCorrelatedCallfaceInteraction(lead.interactions, at) : undefined;
    recordActivity({
      leadId: lead.id,
      channel: ACTIVITY_CHANNEL[channel],
      source: "cadence_attempt",
      outcome,
      at,
      relatedExternalKey,
      talkedTo: channel === "Ligação" && extra.connected ? (talkedTo || "nao_identificado") : undefined,
      ...extra,
    });
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
    const note = (body: string) => addCallNote(lead.id, `${noteHeader} ${body}${contentSuffix}`, undefined, INTERACTION_TYPE[channel]);

    if (outcome === "sem_resposta" || outcome === "caixa_postal") {
      note(`${labelFor(outcome)} — avançando cadência`);
      recordCadence({ attemptPerformed: true, connected: false });
      const dest = nextAttemptStage(lead.stage);
      // "Sem contato" continua no pipeline cold_call → updateLeadStage é suficiente
      const coldStages = new Set(getStagesForPipeline("cold_call"));
      if (coldStages.has(dest)) updateLeadStage(lead.id, dest);
      else moveLeadToStage(lead.id, dest);
      toast.success(`Lead movido para ${dest}`);
    } else if (outcome === "respondeu_interesse") {
      note(labelFor(outcome));
      recordCadence({ attemptPerformed: true, connected: true });
      toast.success("Resposta registrada. Lead permanece na etapa.");
    } else if (outcome === "sem_interesse") {
      note(labelFor(outcome));
      recordCadence({ attemptPerformed: true, connected: true });
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
      // Validação primeiro — nenhuma atividade é gravada antes de o formulário
      // estar completo (Sprint 2A, correção do bug de ordenação).
      if (!returnDate || !returnTime) { toast.error("Informe data e hora do retorno"); return; }
      const when = new Date(`${returnDate}T${returnTime}:00`);
      if (isNaN(when.getTime())) { toast.error("Data/hora inválida"); return; }
      note(`Pediu retorno em ${when.toLocaleString("pt-BR")}`);
      recordCadence({ attemptPerformed: true, connected: true });
      scheduleReminder(
        `Retornar para ${lead.company}`,
        `${lead.contact || lead.company} pediu retorno.`,
        when.toISOString(),
      );
      toast.success("Lembrete de retorno criado. Lead permanece na etapa.");
    } else if (outcome === "agendou") {
      note("Agendou reunião");
      recordCadence({ attemptPerformed: true, connected: true });
      onOpenChange(false);
      reset();
      onRequestSchedule();
      onDone();
      return;
    } else if (outcome === "contato_invalido") {
      note(labelFor(outcome));
      // Ambíguo por definição — só conta como tentativa se o vendedor
      // confirmou explicitamente que chegou a discar/contatar antes de
      // identificar o contato como inválido.
      recordCadence({ attemptPerformed, connected: false });
      if (channel === "Ligação" || channel === "WhatsApp") {
        updateLead(lead.id, { phoneInvalid: true });
        updateLeadStage(lead.id, terminalColdCallStage());
        toast.success("Lead marcado como contato inválido e encerrado na cadência");
      } else {
        updateLeadStage(lead.id, terminalColdCallStage());
        toast.success("Lead encerrado na cadência");
      }
    } else if (outcome === "outro") {
      // Validação primeiro — mesma correção do bug de ordenação.
      if (!freeText.trim()) { toast.error("Descreva o desfecho"); return; }
      note(freeText.trim());
      // Nunca inferido do texto livre: o vendedor confirma explicitamente se
      // houve tentativa real e, se houve, se houve conversa.
      recordCadence({ attemptPerformed, connected: attemptPerformed && connectedOutro });
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

        {outcome === "contato_invalido" && (
          <div className="mt-3 space-y-2">
            <Label className="text-xs text-muted-foreground">Chegou a discar/contatar antes de identificar como inválido?</Label>
            <div className="grid grid-cols-2 gap-1">
              <Button type="button" size="sm" variant={attemptPerformed ? "default" : "outline"}
                onClick={() => setAttemptPerformed(true)}>Sim, tentei</Button>
              <Button type="button" size="sm" variant={!attemptPerformed ? "default" : "outline"}
                onClick={() => setAttemptPerformed(false)}>Não, já era inválido</Button>
            </div>
          </div>
        )}

        {outcome === "outro" && (
          <div className="mt-3 space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Descreva o desfecho</Label>
              <Textarea rows={3} value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder="O que aconteceu?" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Isso envolveu uma tentativa real de contato?</Label>
              <div className="grid grid-cols-2 gap-1">
                <Button type="button" size="sm" variant={attemptPerformed ? "default" : "outline"}
                  onClick={() => setAttemptPerformed(true)}>Sim</Button>
                <Button type="button" size="sm" variant={!attemptPerformed ? "default" : "outline"}
                  onClick={() => { setAttemptPerformed(false); setConnectedOutro(false); }}>Não</Button>
              </div>
            </div>
            {attemptPerformed && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Houve conversa (conexão)?</Label>
                <div className="grid grid-cols-2 gap-1">
                  <Button type="button" size="sm" variant={connectedOutro ? "default" : "outline"}
                    onClick={() => setConnectedOutro(true)}>Sim</Button>
                  <Button type="button" size="sm" variant={!connectedOutro ? "default" : "outline"}
                    onClick={() => setConnectedOutro(false)}>Não</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {(asksTalkedTo || (outcome === "outro" && attemptPerformed && connectedOutro && channel === "Ligação")) && (
          <div className="mt-3">
            <Label className="text-xs text-muted-foreground">Com quem você falou?</Label>
            <RadioGroup value={talkedTo} onValueChange={(v) => setTalkedTo(v as TalkedTo)} className="mt-1 space-y-1">
              {TALKED_TO_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 cursor-pointer hover:bg-accent/5">
                  <RadioGroupItem value={o.value} id={`talked-${o.value}`} />
                  <span className="text-sm">{o.label}</span>
                </label>
              ))}
            </RadioGroup>
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
