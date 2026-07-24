import {
  type Lead, type ICPStars, type PipelineName, type MeetingSource,
  addAttachment, removeAttachment, updateLead,
  addCallNote, removeCallNote, getMeetingsForLead,
  getPipelineForStage, getStagesForPipeline, moveLeadToStage,
  updateMeetingSource, updateMeetingDateTime,
} from "@/lib/store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { parseISO } from "date-fns";
import { CalendarIcon, Loader2, Pencil, Copy, FileText, Building2, Flame, Thermometer, Snowflake, MapPin, Globe, MessageCircle, User as UserIcon } from "lucide-react";
import { upsertOnboardingRevenue, findTransactionByClient, deleteTransaction } from "@/lib/finance";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import {
  Phone, Instagram, ExternalLink, Star, Paperclip, X, FileAudio,
  CalendarCheck, MessageSquarePlus, Trash2, Video, DollarSign, Briefcase, ArrowRightLeft,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useMemo, useRef, useState } from "react";
import { getScripts, getSelectedScript, setSelectedScript, logCall, type ScriptOption } from "@/lib/scripts";
import { toast } from "sonner";
import ScheduleMeetingDialog from "@/components/ScheduleMeetingDialog";
import ConcluirTentativaDialog from "@/components/ConcluirTentativaDialog";
import CadenceEditor from "@/components/CadenceEditor";
import TaskFormDialog from "@/components/TaskFormDialog";
import { getStepForLead, executionMoment, getCadenceForNiche } from "@/lib/cadence";
import { CheckCircle2, Clock, Target, ListTodo, Plus } from "lucide-react";
import { getTasksByLead, deleteTask, completeTask, reopenTask, PRIORITY_LABEL, PRIORITY_CLASSES, type LeadTask } from "@/lib/leadTasks";
import { Checkbox } from "@/components/ui/checkbox";
import AuditoriaIATab from "@/components/AuditoriaIATab";


function StarRating({
  value, onChange,
}: { value: ICPStars; onChange?: (v: ICPStars) => void }) {
  return (
    <div className="flex gap-1">
      {([1, 2, 3] as ICPStars[]).map((s) => (
        <button
          key={s} type="button"
          onClick={() => onChange?.(s)}
          className={onChange ? "cursor-pointer" : "cursor-default"}
        >
          <Star className={`h-5 w-5 ${s <= value ? "fill-accent text-accent" : "text-muted-foreground/30"}`} />
        </button>
      ))}
    </div>
  );
}

const browserTZ = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

function MeetingRow({ meeting, onChanged }: { meeting: ReturnType<typeof getMeetingsForLead>[number]; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(meeting.date);
  const [time, setTime] = useState(meeting.time);
  const [saving, setSaving] = useState(false);

  const dirty = date !== meeting.date || time !== meeting.time;

  const handleSave = async () => {
    if (!date || !time) { toast.error("Informe data e horário."); return; }
    setSaving(true);
    try {
      if (meeting.googleEventId) {
        const start = new Date(`${date}T${time}:00`);
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        const { data, error } = await supabase.functions.invoke("update-google-meeting", {
          body: { eventId: meeting.googleEventId, startISO: start.toISOString(), endISO: end.toISOString(), timeZone: browserTZ() },
        });
        if (error) throw error;
        if (data?.error) toast.warning("Falha ao atualizar Google Agenda", { description: data.details || data.error });
        else toast.success("Google Agenda atualizado");
      }
      updateMeetingDateTime(meeting.id, date, time);
      toast.success("Reunião reagendada");
      setEditing(false);
      onChanged();
    } catch (e) {
      console.error(e); toast.error("Erro ao reagendar reunião");
    } finally { setSaving(false); }
  };

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-foreground">
          {format(new Date(`${meeting.date}T${meeting.time}`), "dd/MM 'às' HH:mm", { locale: ptBR })}
        </p>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">{meeting.channel || "Reunião"}</Badge>
          <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded border border-accent/40 bg-accent/5 p-2">
      <div className="grid grid-cols-2 gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="justify-start text-left font-normal h-8 text-xs">
              <CalendarIcon className="h-3 w-3 mr-1 text-accent" />
              {format(parseISO(date), "dd/MM/yyyy", { locale: ptBR })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
            <Calendar mode="single" locale={ptBR} selected={parseISO(date)}
              onSelect={(d) => d && setDate(format(d, "yyyy-MM-dd"))} initialFocus className="pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-8 text-xs" />
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" className="h-7 text-xs flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
          onClick={handleSave} disabled={saving || !dirty}>
          {saving ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Salvando</> : "Salvar"}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
          setDate(meeting.date); setTime(meeting.time); setEditing(false);
        }} disabled={saving}>Cancelar</Button>
      </div>
    </div>
  );
}

function priorityLabel(icp: ICPStars) {
  return icp === 3 ? { label: "Alta", cls: "bg-accent/20 text-accent border-accent/40" }
    : icp === 2 ? { label: "Média", cls: "bg-primary/20 text-primary-foreground border-primary/40" }
    : { label: "Baixa", cls: "bg-muted text-muted-foreground border-border" };
}

function mapsUrlFor(lead: Lead) {
  if (lead.gmnLink) return lead.gmnLink;
  const q = encodeURIComponent(`${lead.company} ${lead.city || ""}`.trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export default function LeadDetailDrawer({
  lead, open, onOpenChange, onRefresh,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [alignmentOpen, setAlignmentOpen] = useState(false);
  const [concluirOpen, setConcluirOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [draft, setDraft] = useState<Lead | null>(lead);
  const [newCallNote, setNewCallNote] = useState("");
  const [scripts, setScripts] = useState<string[]>(() => getScripts());
  const [callScript, setCallScript] = useState<ScriptOption>(() => getSelectedScript());
  const [tab, setTab] = useState("geral");
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<LeadTask | null>(null);
  const [tasksVer, setTasksVer] = useState(0);

  useEffect(() => {
    setDraft(lead);
    setNewCallNote("");
    setScripts(getScripts());
    setCallScript(getSelectedScript());
    setTab("geral");
  }, [lead?.id]);

  useEffect(() => {
    const h = () => { setScripts(getScripts()); setCallScript(getSelectedScript()); };
    window.addEventListener("p21:scripts-changed", h);
    return () => window.removeEventListener("p21:scripts-changed", h);
  }, []);

  const callNotes = useMemo(() => [...(lead?.callNotes || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ), [lead?.callNotes]);

  if (!lead || !draft) return null;
  const pipeline = getPipelineForStage(lead.stage);
  const isOnboarding = pipeline === "onboarding";
  const isOportunidades = pipeline === "oportunidades";
  const isColdCall = pipeline === "cold_call";

  const step = isColdCall ? getStepForLead(lead) : null;
  const cadence = isColdCall ? getCadenceForNiche(lead.niche) : [];
  const prio = priorityLabel(draft.icpStars);
  const temp = draft.temperature ?? "Frio";
  const tempIcon = temp === "Quente" ? Flame : temp === "Morno" ? Thermometer : Snowflake;
  const TempIcon = tempIcon;
  const tempCls = temp === "Quente" ? "text-orange-500" : temp === "Morno" ? "text-yellow-500" : "text-sky-400";

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      addAttachment(lead.id, { name: file.name, type: file.type, dataUrl: reader.result as string });
      onRefresh(); toast.success("Arquivo anexado!");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const persist = (patch: Partial<Lead>) => {
    const next = { ...draft, ...patch };
    setDraft(next); updateLead(lead.id, patch);
  };

  const syncFinance = (next: Lead) => {
    if (!isOnboarding) return;
    if ((next.contractValue ?? 0) > 0) {
      upsertOnboardingRevenue({
        clientId: lead.id, clientName: (next.company || lead.company).trim(),
        amount: next.contractValue!, serviceType: next.serviceType,
      });
    } else {
      const existing = findTransactionByClient(lead.id);
      if (existing) deleteTransaction(existing.id);
    }
  };

  const commitOnBlur = (patch: Partial<Lead>) => {
    const next = { ...draft, ...patch };
    updateLead(lead.id, patch); syncFinance(next); onRefresh();
  };

  const handleAddCallNote = () => {
    if (!newCallNote.trim()) return;
    addCallNote(lead.id, newCallNote, callScript);
    logCall({ scriptUsed: callScript, source: "call_note", leadId: lead.id });
    setNewCallNote(""); onRefresh(); toast.success("Anotação adicionada!");
  };

  const meetings = getMeetingsForLead(lead.id);

  const copyScript = async () => {
    if (!step) return;
    try { await navigator.clipboard.writeText(step.script); toast.success("Script copiado"); }
    catch { toast.error("Falha ao copiar"); }
  };

  const whats = draft.whatsapp || draft.phone;
  const whatsUrl = whats ? `https://wa.me/${whats.replace(/\D/g, "")}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[80vw] w-[80vw] h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/60 shrink-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[280px]">
              <Input
                value={draft.company}
                onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                onBlur={() => commitOnBlur({ company: draft.company.trim() || lead.company })}
                className="text-xl font-semibold border-0 px-0 h-auto focus-visible:ring-0 shadow-none bg-transparent"
                aria-label="Empresa"
              />
              <DialogDescription className="text-xs mt-1">
                {lead.stage} · ⏱ {formatDistanceToNow(new Date(lead.stageChangedAt), { locale: ptBR, addSuffix: true })}
              </DialogDescription>
              <DialogTitle className="sr-only">{lead.company}</DialogTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={`border ${prio.cls}`}>{prio.label}</Badge>
              <Select value={temp} onValueChange={(v) => persist({ temperature: v as Lead["temperature"] })}>
                <SelectTrigger className="h-7 w-[110px] text-xs">
                  <TempIcon className={`h-3 w-3 mr-1 ${tempCls}`} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Quente">🔥 Quente</SelectItem>
                  <SelectItem value="Morno">🌡 Morno</SelectItem>
                  <SelectItem value="Frio">❄ Frio</SelectItem>
                </SelectContent>
              </Select>
              {isColdCall && step && (
                <Badge variant="outline" className="text-[11px]">
                  {lead.niche ? `Cadência ${lead.niche}` : "Cadência Padrão"} · D{step.day} · Tentativa {step.attempt}
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-3 self-start">
            <TabsTrigger value="geral">📋 Geral</TabsTrigger>
            <TabsTrigger value="historico">📞 Histórico</TabsTrigger>
            <TabsTrigger value="tarefas">✅ Tarefas</TabsTrigger>
            <TabsTrigger value="anexos">📎 Anexos</TabsTrigger>
            <TabsTrigger value="auditoria">🤖 Auditoria IA</TabsTrigger>
            {isColdCall && <TabsTrigger value="cadencia">📜 Cadência</TabsTrigger>}
          </TabsList>


          {/* GERAL */}
          <TabsContent value="geral" className="flex-1 overflow-y-auto px-6 py-4 mt-0 space-y-5">
            {/* Próxima Ação */}
            {isColdCall && step && (
              <section className="rounded-lg border border-accent/40 bg-accent/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs uppercase tracking-wide text-accent font-semibold flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5" /> Próxima Ação
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {executionMoment(lead)}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                  <div><div className="text-[10px] uppercase text-muted-foreground">Canal</div><div className="font-medium">{step.channel}</div></div>
                  <div><div className="text-[10px] uppercase text-muted-foreground">Objetivo</div><div className="font-medium">{step.objective}</div></div>
                  <div><div className="text-[10px] uppercase text-muted-foreground">Tempo estimado</div><div className="font-medium">{step.estimatedMinutes} min</div></div>
                  <div><div className="text-[10px] uppercase text-muted-foreground">Ação</div><div className="font-medium text-accent">{step.nextAction}</div></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setScriptOpen(true)}>
                    <FileText className="h-3.5 w-3.5 mr-1" /> Visualizar Script
                  </Button>
                  <Button size="sm" variant="outline" onClick={copyScript}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copiar Script
                  </Button>
                  <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setConcluirOpen(true)}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Concluir Tentativa
                  </Button>
                </div>
              </section>
            )}

            {/* Mover / Marcar reunião */}
            <section className="grid md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5">
                  <ArrowRightLeft className="h-3 w-3" /> Mover lead para...
                </Label>
                <Select
                  value={lead.stage}
                  onValueChange={(toStage) => {
                    if (toStage === lead.stage) return;
                    const result = moveLeadToStage(lead.id, toStage);
                    const labels: Record<PipelineName, string> = { cold_call: "Cold Call", oportunidades: "Oportunidades", onboarding: "Onboarding" };
                    if (result.missingContractValue) toast.warning("Lead movido para Ganho sem valor de contrato definido");
                    if (result.autoTransfer) toast.success(`Lead transferido para ${labels[result.autoTransfer]}!`);
                    else toast.success("Lead movido!");
                    onRefresh();
                    const isAlinhamentoStage = toStage === "Reunião Realizada" && getPipelineForStage(toStage) === "oportunidades";
                    const alreadyHasAlinhamento = getMeetingsForLead(lead.id).some((m) => (m.title || "").toLowerCase().startsWith("reunião de alinhamento"));
                    if (isAlinhamentoStage && !alreadyHasAlinhamento) setAlignmentOpen(true);
                    else onOpenChange(false);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-80">
                    {(["cold_call", "oportunidades", "onboarding"] as PipelineName[]).map((p) => {
                      const label = p === "cold_call" ? "Cold Call" : p === "oportunidades" ? "Oportunidades" : "Onboarding";
                      const stages = getStagesForPipeline(p);
                      if (stages.length === 0) return null;
                      return (
                        <SelectGroup key={p}>
                          <SelectLabel className="text-[10px] uppercase tracking-wider text-accent">{label}</SelectLabel>
                          {stages.map((s) => (<SelectItem key={`${p}-${s}`} value={s}>{s}</SelectItem>))}
                        </SelectGroup>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {!isOnboarding && (
                <div className="flex items-end">
                  <Button onClick={() => setMeetingOpen(true)} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                    <CalendarCheck className="h-4 w-4 mr-1.5" /> Marcar Reunião
                  </Button>
                </div>
              )}
            </section>

            {/* Onboarding contract */}
            {isOnboarding && (
              <section className="rounded-md border border-accent/30 bg-accent/5 p-3 space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-accent">
                  <DollarSign className="h-3.5 w-3.5" /> Contrato Fechado
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
                    <Input type="number" min="0" step="0.01" inputMode="decimal"
                      value={draft.contractValue ?? ""}
                      onChange={(e) => setDraft({ ...draft, contractValue: e.target.value === "" ? undefined : Number(e.target.value) })}
                      onBlur={() => commitOnBlur({ contractValue: draft.contractValue })}
                      placeholder="0,00" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><Briefcase className="h-3 w-3" /> Tipo de Serviço</Label>
                    <Input value={draft.serviceType ?? ""}
                      onChange={(e) => setDraft({ ...draft, serviceType: e.target.value })}
                      onBlur={() => commitOnBlur({ serviceType: draft.serviceType })}
                      placeholder="Ex: Tráfego pago" />
                  </div>
                </div>
              </section>
            )}

            {/* Oportunidades contract */}
            {isOportunidades && (() => {
              const PRESETS = ["Gestão Recorrente", "Implementação Comercial"];
              const current = draft.serviceType ?? "";
              const selectValue = current === "" ? "" : (PRESETS.includes(current) ? current : "Outro");
              return (
                <section className="rounded-md border border-accent/30 bg-accent/5 p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-accent flex items-center gap-1 mb-1.5"><DollarSign className="h-3.5 w-3.5" /> Valor do Contrato (R$)</Label>
                      <Input type="number" min="0" step="0.01" inputMode="decimal"
                        value={draft.contractValue ?? ""}
                        onChange={(e) => setDraft({ ...draft, contractValue: e.target.value === "" ? undefined : Number(e.target.value) })}
                        onBlur={() => commitOnBlur({ contractValue: draft.contractValue })}
                        placeholder="0,00" />
                    </div>
                    <div>
                      <Label className="text-xs text-accent flex items-center gap-1 mb-1.5"><Briefcase className="h-3.5 w-3.5" /> Tipo de Serviço</Label>
                      <Select value={selectValue || undefined}
                        onValueChange={(v) => { const next = v === "Outro" ? "" : v; setDraft({ ...draft, serviceType: next }); commitOnBlur({ serviceType: next }); }}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Gestão Recorrente">Gestão Recorrente</SelectItem>
                          <SelectItem value="Implementação Comercial">Implementação Comercial</SelectItem>
                          <SelectItem value="Outro">Outro (especificar)</SelectItem>
                        </SelectContent>
                      </Select>
                      {selectValue === "Outro" && (
                        <Input className="mt-2" placeholder="Especifique"
                          value={draft.serviceType ?? ""}
                          onChange={(e) => setDraft({ ...draft, serviceType: e.target.value })}
                          onBlur={() => commitOnBlur({ serviceType: draft.serviceType })} />
                      )}
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* Contatos */}
            <section>
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1"><UserIcon className="h-3 w-3" /> Contatos</h3>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Decisor</Label>
                  <Input value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} onBlur={() => commitOnBlur({ contact: draft.contact })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Telefone</Label>
                  <div className="flex gap-1.5">
                    <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} onBlur={() => commitOnBlur({ phone: draft.phone })} />
                    {draft.phone && (
                      <Button size="icon" variant="outline" asChild className="shrink-0 h-9 w-9">
                        <a href={`tel:${draft.phone.replace(/[^\d+]/g, "")}`} aria-label="Ligar"><Phone className="h-3.5 w-3.5" /></a>
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><MessageCircle className="h-3 w-3" /> WhatsApp</Label>
                  <div className="flex gap-1.5">
                    <Input value={draft.whatsapp ?? ""} placeholder={draft.phone || "Mesmo do telefone"}
                      onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })}
                      onBlur={() => commitOnBlur({ whatsapp: draft.whatsapp })} />
                    {whats && (
                      <Button size="icon" variant="outline" asChild className="shrink-0 h-9 w-9">
                        <a href={whatsUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp"><ExternalLink className="h-3.5 w-3.5" /></a>
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><Instagram className="h-3 w-3" /> Instagram</Label>
                  <div className="flex gap-1.5">
                    <Input value={draft.instagramLink} onChange={(e) => setDraft({ ...draft, instagramLink: e.target.value })} onBlur={() => commitOnBlur({ instagramLink: draft.instagramLink })} placeholder="https://instagram.com/..." />
                    {draft.instagramLink && (
                      <Button size="icon" variant="outline" asChild className="shrink-0 h-9 w-9">
                        <a href={draft.instagramLink} target="_blank" rel="noopener noreferrer" aria-label="Abrir Instagram"><ExternalLink className="h-3.5 w-3.5" /></a>
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3" /> Site</Label>
                  <div className="flex gap-1.5">
                    <Input value={draft.website ?? ""} placeholder="https://..."
                      onChange={(e) => setDraft({ ...draft, website: e.target.value })}
                      onBlur={() => commitOnBlur({ website: draft.website })} />
                    {draft.website && (
                      <Button size="icon" variant="outline" asChild className="shrink-0 h-9 w-9">
                        <a href={draft.website} target="_blank" rel="noopener noreferrer" aria-label="Abrir site"><ExternalLink className="h-3.5 w-3.5" /></a>
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Google Maps</Label>
                  <div className="flex gap-1.5">
                    <Input value={draft.gmnLink} onChange={(e) => setDraft({ ...draft, gmnLink: e.target.value })} onBlur={() => commitOnBlur({ gmnLink: draft.gmnLink })} placeholder="Link ou busca automática" />
                    <Button size="icon" variant="outline" asChild className="shrink-0 h-9 w-9">
                      <a href={mapsUrlFor(draft)} target="_blank" rel="noopener noreferrer" aria-label="Abrir no Maps"><ExternalLink className="h-3.5 w-3.5" /></a>
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {/* Empresa */}
            <section>
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1"><Building2 className="h-3 w-3" /> Empresa</h3>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Nicho</Label>
                  <Input value={draft.niche} onChange={(e) => setDraft({ ...draft, niche: e.target.value })} onBlur={() => commitOnBlur({ niche: draft.niche })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Cidade</Label>
                  <Input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} onBlur={() => commitOnBlur({ city: draft.city })} />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Prioridade ICP</Label>
                  <StarRating value={draft.icpStars} onChange={(v) => { persist({ icpStars: v }); onRefresh(); }} />
                </div>
                <div className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2">
                  <Label className="text-sm">Faz Anúncios?</Label>
                  <Switch checked={draft.runsAds} onCheckedChange={(v) => { persist({ runsAds: v }); onRefresh(); }} />
                </div>
              </div>
            </section>

            {/* Observações */}
            <section>
              <Label className="text-xs text-muted-foreground mb-1 block">Observações permanentes sobre a empresa</Label>
              <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} onBlur={() => commitOnBlur({ notes: draft.notes })} rows={4}
                placeholder="Ex: Possui duas unidades. Atua em alto padrão. Expansão prevista para setembro." />
            </section>
          </TabsContent>

          {/* HISTÓRICO */}
          <TabsContent value="historico" className="flex-1 overflow-y-auto px-6 py-4 mt-0 space-y-5">
            {meetings.length > 0 && (
              <section>
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                  <CalendarCheck className="h-3 w-3" /> Reuniões agendadas ({meetings.length})
                </Label>
                <div className="space-y-2">
                  {meetings.map((m) => (
                    <div key={m.id} className="bg-muted/40 rounded-md p-3 border border-border/40 text-sm">
                      <MeetingRow meeting={m} onChanged={onRefresh} />
                      <div className="flex items-center gap-2 mt-2">
                        <Label className="text-[10px] text-muted-foreground shrink-0">Canal de origem:</Label>
                        <Select value={m.source || "Ligação"}
                          onValueChange={(v) => { updateMeetingSource(m.id, v as MeetingSource); toast.success("Canal atualizado"); onRefresh(); }}>
                          <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Ligação">Ligação</SelectItem>
                            <SelectItem value="Disparo">Disparo</SelectItem>
                            <SelectItem value="Instagram">Instagram</SelectItem>
                            <SelectItem value="Email">Email</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {m.meetLink && (
                          <a href={m.meetLink} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-accent/15 text-accent hover:bg-accent/25 transition-colors">
                            <Video className="h-2.5 w-2.5" /> Abrir Meet
                          </a>
                        )}
                        {m.googleEventUrl && (
                          <a href={m.googleEventUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            <ExternalLink className="h-2.5 w-2.5" /> Google Agenda
                          </a>
                        )}
                        {m.attendeeEmail && (<span className="text-[10px] text-muted-foreground">→ {m.attendeeEmail}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <MessageSquarePlus className="h-3 w-3" /> Histórico das Ligações ({callNotes.length})
                </Label>
              </div>
              <div className="space-y-2 rounded-md border border-border/60 p-3 bg-muted/20">
                <Textarea placeholder="Como foi a ligação? Tentativa, resultado, o que o lead disse, próximos passos..."
                  value={newCallNote} onChange={(e) => setNewCallNote(e.target.value)} rows={3} className="text-sm" />
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-[10px] text-muted-foreground">Script utilizado</Label>
                    <Select value={callScript} onValueChange={(v) => { const s = v as ScriptOption; setCallScript(s); setSelectedScript(s); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {scripts.map((s) => (<SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" onClick={handleAddCallNote} disabled={!newCallNote.trim()}
                    className="bg-accent/90 text-accent-foreground hover:bg-accent h-8 text-xs">
                    <MessageSquarePlus className="h-3 w-3 mr-1" /> Registrar
                  </Button>
                </div>
              </div>
              {callNotes.length > 0 ? (
                <div className="space-y-1.5 mt-3">
                  {callNotes.map((n) => {
                    const d = new Date(n.createdAt);
                    return (
                      <div key={n.id} className="group bg-muted/40 rounded-md p-3 border border-border/40">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground">{format(d, "dd/MM", { locale: ptBR })}</span>
                            <span>·</span>
                            <span>{format(d, "HH:mm", { locale: ptBR })}</span>
                            {n.scriptUsed && (<Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{n.scriptUsed}</Badge>)}
                          </div>
                          <button onClick={() => { removeCallNote(lead.id, n.id); onRefresh(); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{n.text}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/60 text-center py-6">Nenhuma ligação registrada</p>
              )}
            </section>
          </TabsContent>

          {/* TAREFAS */}
          <TabsContent value="tarefas" className="flex-1 overflow-y-auto px-6 py-4 mt-0 space-y-3">
            {(() => {
              void tasksVer;
              const tasks = getTasksByLead(lead.id);
              const pending = tasks.filter((t) => t.status === "pendente");
              const done = tasks.filter((t) => t.status === "concluida");
              const renderTask = (t: LeadTask) => {
                const isDone = t.status === "concluida";
                const due = new Date(t.dueAt);
                const overdue = !isDone && due.getTime() < Date.now();
                return (
                  <div key={t.id} className={`rounded-md border p-3 flex items-start gap-3 ${overdue ? "border-destructive/40 bg-destructive/5" : "border-border/40 bg-muted/20"}`}>
                    <Checkbox
                      checked={isDone}
                      onCheckedChange={(v) => {
                        if (v) completeTask(t.id); else reopenTask(t.id);
                        setTasksVer((x) => x + 1);
                        toast.success(v ? "Tarefa concluída" : "Tarefa reaberta");
                      }}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${PRIORITY_CLASSES[t.priority]}`}>
                          {PRIORITY_LABEL[t.priority]}
                        </Badge>
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{t.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                        <span className={overdue ? "text-destructive font-medium" : ""}>
                          <Clock className="h-3 w-3 inline mr-0.5" />
                          {format(due, "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </span>
                        <span>· {t.durationMin}min</span>
                        {t.googleEventLink && (
                          <a href={t.googleEventLink} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">
                            <ExternalLink className="h-2.5 w-2.5" /> Google Agenda
                          </a>
                        )}
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
                          onClick={() => { setEditingTask(t); setTaskFormOpen(true); }}>
                          <Pencil className="h-3 w-3 mr-1" /> Editar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-destructive hover:text-destructive"
                          onClick={async () => {
                            if (t.googleEventId) {
                              try { await supabase.functions.invoke("delete-task-event", { body: { eventId: t.googleEventId } }); } catch {}
                            }
                            deleteTask(t.id);
                            setTasksVer((x) => x + 1);
                            toast.success("Tarefa excluída");
                          }}>
                          <Trash2 className="h-3 w-3 mr-1" /> Excluir
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              };
              return (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <ListTodo className="h-3 w-3" /> {pending.length} pendente(s) · {done.length} concluída(s)
                    </p>
                    <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90"
                      onClick={() => { setEditingTask(null); setTaskFormOpen(true); }}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Nova Tarefa
                    </Button>
                  </div>
                  {tasks.length === 0 && (
                    <p className="text-xs text-muted-foreground/60 text-center py-10">
                      Nenhuma tarefa criada. Adicione a próxima ação, prazo e prioridade — se quiser, sincronize com o Google Agenda.
                    </p>
                  )}
                  {pending.length > 0 && <div className="space-y-2">{pending.map(renderTask)}</div>}
                  {done.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Concluídas</p>
                      {done.map(renderTask)}
                    </div>
                  )}
                </>
              );
            })()}
          </TabsContent>

          {/* ANEXOS */}
          <TabsContent value="anexos" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <FileAudio className="h-3 w-3" /> Arquivos ({lead.attachments.length})
              </p>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Paperclip className="h-3 w-3 mr-1" /> Anexar arquivo
              </Button>
              <input ref={fileRef} type="file" accept="audio/*,image/*,.pdf,.doc,.docx" className="hidden" onChange={handleFileUpload} />
            </div>
            {lead.attachments.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-2">
                {lead.attachments.map((att) => {
                  const d = new Date(att.createdAt);
                  const isAudio = att.type.startsWith("audio/");
                  const isImg = att.type.startsWith("image/");
                  return (
                    <div key={att.id} className="rounded-md border border-border/40 bg-muted/30 p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{att.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {att.type || "arquivo"} · {format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        <button onClick={() => { removeAttachment(lead.id, att.id); onRefresh(); }}
                          className="text-muted-foreground hover:text-destructive shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {isAudio && <audio src={att.dataUrl} controls className="h-8 w-full" />}
                      {isImg && <img src={att.dataUrl} alt={att.name} className="max-h-40 rounded object-cover w-full" />}
                      <div className="flex gap-1.5 mt-2">
                        <Button size="sm" variant="outline" asChild className="h-7 text-xs flex-1">
                          <a href={att.dataUrl} target="_blank" rel="noopener noreferrer">Visualizar</a>
                        </Button>
                        <Button size="sm" variant="outline" asChild className="h-7 text-xs flex-1">
                          <a href={att.dataUrl} download={att.name}>Baixar</a>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60 text-center py-10">Nenhum arquivo anexado</p>
            )}
          </TabsContent>

          {/* AUDITORIA IA */}
          <TabsContent value="auditoria" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
            <AuditoriaIATab leadCompany={lead.company} />
          </TabsContent>

          {/* CADÊNCIA */}
          {isColdCall && (
            <TabsContent value="cadencia" className="flex-1 overflow-y-auto px-6 py-4 mt-0 space-y-3">
              <CadenceEditor niche={lead.niche} currentAttempt={step?.attempt} onChanged={onRefresh} />
            </TabsContent>
          )}
        </Tabs>

      </DialogContent>

      {/* Script viewer secundário */}
      <Dialog open={scriptOpen} onOpenChange={setScriptOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Script — {step ? `D${step.day} · Tentativa ${step.attempt} · ${step.channel}` : ""}</DialogTitle>
            <DialogDescription className="text-xs">{step?.objective}</DialogDescription>
          </DialogHeader>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed rounded bg-muted/40 border border-border/60 p-4 max-h-[60vh] overflow-y-auto">{step?.script}</pre>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={copyScript}><Copy className="h-3.5 w-3.5 mr-1" /> Copiar</Button>
            <Button size="sm" onClick={() => setScriptOpen(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ScheduleMeetingDialog
        lead={lead}
        open={meetingOpen}
        onOpenChange={setMeetingOpen}
        onScheduled={() => { onRefresh(); onOpenChange(false); }}
      />

      <ScheduleMeetingDialog
        lead={lead}
        open={alignmentOpen}
        onOpenChange={setAlignmentOpen}
        onScheduled={() => { setAlignmentOpen(false); onRefresh(); onOpenChange(false); }}
        kind="alinhamento"
      />

      <ConcluirTentativaDialog
        lead={lead}
        open={concluirOpen}
        onOpenChange={setConcluirOpen}
        onDone={onRefresh}
        onRequestSchedule={() => setMeetingOpen(true)}
      />

      <TaskFormDialog
        open={taskFormOpen}
        onOpenChange={(o) => { setTaskFormOpen(o); if (!o) setEditingTask(null); }}
        leadId={lead.id}
        leadName={lead.company}
        editing={editingTask}
        onSaved={() => setTasksVer((x) => x + 1)}
      />
    </Dialog>
  );
}
