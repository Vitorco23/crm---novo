import {
  type Lead, type ICPStars, type PipelineName, type MeetingSource,
  addAttachment, removeAttachment, updateLead, setAttachmentAnalysis,
  addCallNote, removeCallNote, getMeetingsForLead,
  getPipelineForStage, getStagesForPipeline, moveLeadToStage,
  updateMeetingSource, updateMeetingDateTime,
} from "@/shared/services/store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { AgendaRepository } from "@/modules/agenda/services/AgendaRepository";
import { IntelligenceRepository } from "@/modules/intelligence/services/IntelligenceRepository";
import { parseISO } from "date-fns";
import {
  CalendarIcon, Loader2, Pencil, Copy, FileText, Building2,
  MapPin, Globe, MessageCircle, User as UserIcon, RefreshCw
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { computeLeadPriority, TIER_META, type LeadPriority } from "@/modules/intelligence/services/priorityEngine";
import { displayTemperature } from "@/modules/intelligence/services/leadInsights";
import { upsertOnboardingRevenue, findTransactionByClient, deleteTransaction } from "@/modules/financeiro/services/finance";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LeadPriorityStrip from "@/modules/leads/components/LeadPriorityStrip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import {
  Phone, Instagram, ExternalLink, Star, Paperclip, X, FileAudio,
  CalendarCheck, MessageSquarePlus, Trash2, Video, DollarSign, Briefcase, ArrowRightLeft, Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { analyzeCallNote } from "@/modules/laboratorio/services/callAnalysis";
import { CallAuditView } from "@/modules/laboratorio/components/CallAuditView";
import InteracoesTimeline from "@/modules/leads/components/InteracoesTimeline";
import LeadExecutiveSummary from "@/modules/leads/components/LeadExecutiveSummary";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { WhatsAppSendMenu } from "@/shared/components/WhatsAppSendMenu";



import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getScripts, getSelectedScript, setSelectedScript, logCall, type ScriptOption } from "@/modules/knowledge/services/scripts";
import { toast } from "sonner";
import ScheduleMeetingDialog from "@/modules/leads/components/ScheduleMeetingDialog";
import ConcluirTentativaDialog from "@/modules/leads/components/ConcluirTentativaDialog";
import CadenceEditor from "@/modules/leads/components/CadenceEditor";
import TaskFormDialog from "@/modules/leads/components/TaskFormDialog";
import { getStepForLead, executionMoment, getCadenceForNiche, processTemplate } from "@/modules/leads/services/cadence";
import { CheckCircle2, Clock, Target, ListTodo, Plus } from "lucide-react";
import { getTasksByLead, deleteTask, completeTask, reopenTask, PRIORITY_LABEL, PRIORITY_CLASSES, type LeadTask } from "@/modules/leads/services/leadTasks";
import { Checkbox } from "@/components/ui/checkbox";



function StarRating({
  value, onChange,
}: { value: ICPStars; onChange?: (v: ICPStars) => void }) {
  return (
    <div className="flex gap-1">
      {([1, 2, 3, 4, 5] as ICPStars[]).map((s) => (
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

function MeetingRow({ lead, draft, meeting, onChanged }: { lead: Lead; draft: Lead; meeting: ReturnType<typeof getMeetingsForLead>[number]; onChanged: () => void }) {
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
        const data = await AgendaRepository.updateMeeting({
          eventId: meeting.googleEventId, startISO: start.toISOString(), endISO: end.toISOString(), timeZone: browserTZ(),
        });
        if (data?.error) toast.warning("Falha ao atualizar Google Agenda", { description: data.details || data.error });
        else toast.success("Google Agenda atualizado");
      }
      updateMeetingDateTime(meeting.id, date, time);
      
      // Update pending reminders to use the new meeting time
      const { refreshPendingRemindersForLead } = await import("@/modules/agenda/services/reminders");
      refreshPendingRemindersForLead({ ...lead, ...draft });

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

/** Badge de prioridade operacional (computeLeadPriority) com tooltip
 * explicando os motivos — mesmos `reasons` já computados/ordenados pelo
 * motor, nunca um recálculo paralelo. Sem motivos (lead fechado ou sem
 * sinal relevante), mostra só o badge sem tooltip. */
function PriorityBadgeWithReasons({
  priority, tierMeta, variant, className,
}: {
  priority: LeadPriority | null;
  tierMeta: { label: string; cls: string };
  variant?: "outline";
  className?: string;
}) {
  const badge = (
    <Badge variant={variant} className={`border ${tierMeta.cls} ${className || ""}`}>
      {tierMeta.label}
    </Badge>
  );
  if (!priority || priority.reasons.length === 0) return badge;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-[240px] text-xs">
          <p className="font-semibold mb-1">Por que esta prioridade:</p>
          <ul className="space-y-0.5">
            {priority.reasons.map((r) => (
              <li key={r.key}>• {r.label}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function mapsUrlFor(lead: Lead) {
  if (lead.gmnLink) return lead.gmnLink;
  const q = encodeURIComponent(`${lead.company} ${lead.city || ""}`.trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export default function LeadDetailDrawer({
  lead, open, onOpenChange, onRefresh, initialTab, initialAction,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
  initialTab?: "geral" | "interacoes" | "observacoes" | "anexos";
  initialAction?: "new-interaction" | "generate-script" | "run-diagnosis" | "schedule-meeting" | "upload-attachment" | "new-task";
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
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
  const [analyzingNoteId, setAnalyzingNoteId] = useState<string | null>(null);
  const [aiReadingId, setAiReadingId] = useState<string | null>(null);
  const [aiReadResults, setAiReadResults] = useState<Record<string, string>>({});
  const [autoNewInteraction, setAutoNewInteraction] = useState(false);
  const [autoRunDiagnosis, setAutoRunDiagnosis] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [icpSuggestion, setIcpSuggestion] = useState<{ leadId: string; stars: ICPStars; reasoning: string } | null>(null);
  const attachFilesRef = useRef<((files: File[], autoAnalyze?: boolean) => Promise<void>) | null>(null);


  useEffect(() => {
    setDraft(lead);
    setNewCallNote("");
    setScripts(getScripts());
    setCallScript(getSelectedScript());
    setTab(initialTab || "geral");
    setIcpSuggestion(null);
  }, [lead?.id, initialTab]);

  // Executa ação inicial após montar/abrir (vindo da Próxima Melhor Ação).
  useEffect(() => {
    if (!open || !lead || !initialAction) return;
    if (initialAction === "generate-script") {
      setScriptOpen(true);
    } else if (initialAction === "schedule-meeting") {
      setMeetingOpen(true);
    } else if (initialAction === "upload-attachment") {
      setTab("anexos");
      setTimeout(() => fileRef.current?.click(), 60);
    } else if (initialAction === "new-task") {
      setEditingTask(null);
      setTaskFormOpen(true);
    } else if (initialAction === "new-interaction") {
      setTab("interacoes");
      setAutoNewInteraction(true);
    } else if (initialAction === "run-diagnosis") {
      setTab("interacoes");
      setAutoRunDiagnosis(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id, initialAction]);


  useEffect(() => {
    const h = () => { setScripts(getScripts()); setCallScript(getSelectedScript()); };
    window.addEventListener("p21:scripts-changed", h);
    return () => window.removeEventListener("p21:scripts-changed", h);
  }, []);

  const callNotes = useMemo(() => [...(lead?.callNotes || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ), [lead?.callNotes]);

  // Colar (Ctrl+V) prints direto no modal — sem precisar salvar o arquivo antes.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || []);
      const files = items
        .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
        .map((it) => it.getAsFile())
        .filter((f): f is File => !!f);
      if (!files.length) return;
      e.preventDefault();
      void attachFilesRef.current?.(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  const runIcpSuggestion = async (showSuccessToast = true, throwOnError = false) => {
    if (!lead?.id) return false;
    try {
      const context = [
        lead.company && `Empresa: ${lead.company}`,
        lead.contact && `Decisor: ${lead.contact}`,
        lead.niche && `Nicho: ${lead.niche}`,
        lead.city && `Cidade: ${lead.city}`,
        lead.notes && `Notas: ${lead.notes}`,
        lead.website && `Site: ${lead.website}`,
        lead.instagramLink && `Instagram: ${lead.instagramLink}`,
      ].filter(Boolean).join("\n");
      
      const attachmentsContext = Object.values(aiReadResults).join("\n---\n");
      
      const result = await IntelligenceRepository.suggestICP({
        leadContext: context,
        currentICP: lead.icpStars,
        additionalInfo: (lead.notes || "") + (attachmentsContext ? `\nAnexos analisados:\n${attachmentsContext}` : ""),
        websiteContent: lead.website,
        instagramContent: lead.instagramLink
      });

      const stars = Math.max(1, Math.min(5, Math.round(Number(result.suggestedICP) || 0))) as ICPStars;

      if (stars !== lead.icpStars) {
        setIcpSuggestion({ leadId: lead.id, stars, reasoning: result.reasoning });
        return true;
      }
      setIcpSuggestion(null);
      return false;
    } catch (e) {
      console.error("Sugestão de ICP falhou:", e);
      if (showSuccessToast) toast.error("Não foi possível obter sugestão da IA agora.");
      if (throwOnError) throw e;
      return false;
    }
  };

  const applyIcpSuggestion = () => {
    if (!icpSuggestion || !lead?.id || icpSuggestion.leadId !== lead.id) return;
    const stars = icpSuggestion.stars;
    updateLead(lead.id, { icpStars: stars });
    setDraft((d) => (d ? { ...d, icpStars: stars } : d));
    setIcpSuggestion(null);
    onRefresh();
    toast.success(`ICP atualizado para ${stars} estrelas`);
  };

  useEffect(() => {
    if (open && lead?.id) {
      if (!lead.icpStars || lead.icpStars === 2) {
        runIcpSuggestion(false);
      }
    }
  }, [open, lead?.id]);

  if (!lead || !draft) return null;

  const pipeline = getPipelineForStage(lead.stage);
  const isOnboarding = pipeline === "onboarding";
  const isOportunidades = pipeline === "oportunidades";
  const isColdCall = pipeline === "cold_call";

  const step = isColdCall ? getStepForLead(lead) : null;
  const cadence = isColdCall ? getCadenceForNiche(lead.niche) : [];
  // Bug de auditoria (30/08): "prio" vinha de priorityLabel(icpStars) — uma
  // nota de FIT do lead (ICP, atribuída na criação), rotulada genericamente
  // como "Prioridade" ao lado da temperatura. E "temp" lia draft.temperature
  // direto (campo em inglês "hot"/"warm"/"cold", nunca igual às strings em
  // português comparadas logo abaixo — praticamente sempre caía em "Frio"
  // por default). Isso é o que produzia "MUITO ALTA" + "Frio" juntos sem
  // nenhuma relação real entre os dois números. Troca pra computeLeadPriority
  // (mesmo motor usado em Central de Decisão/Missão do Dia — considera
  // reunião marcada, follow-up vencido, diagnóstico da IA etc.) e o
  // temperature que ele já calcula corretamente via displayTemperature().
  const priority = computeLeadPriority(draft);
  const tierMeta = TIER_META[priority?.tier ?? "baixa"];
  const dispTemp = priority?.temperature ?? displayTemperature(draft);

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
      reader.readAsDataURL(file);
    });

  /** Anexa 1..n arquivos (upload, colar ou arrastar). NÃO consome IA — a leitura
   *  acontece apenas quando o usuário aciona "Atualizar Inteligência" ou "Ler com IA". */
  const attachFiles = async (files: File[], autoAnalyze = false) => {
    const valid = files.filter((f) => {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`Arquivo muito grande (máx 10MB): ${f.name || "print"}`);
        return false;
      }
      return true;
    });
    if (!valid.length) return;

    const created: { id: string; name: string; type: string; dataUrl: string }[] = [];
    for (const file of valid) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
        const name = file.name || `print-${stamp}.png`;
        const id = addAttachment(lead.id, { name, type: file.type || "image/png", dataUrl });
        if (id) created.push({ id, name, type: file.type || "image/png", dataUrl });
      } catch {
        toast.error("Não foi possível anexar o arquivo");
      }
    }
    if (!created.length) return;
    onRefresh();
    toast.success(created.length > 1 ? `${created.length} arquivos anexados!` : "Arquivo anexado!");
    setTab("anexos");

    void autoAnalyze; // leitura por IA é sempre manual/sob demanda (economia de tokens)
  };
  attachFilesRef.current = attachFiles;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    void attachFiles(files);
    e.target.value = "";
  };


  const handleReadAttachmentWithAI = async (att: { id: string; name: string; type: string; dataUrl: string }) => {
    if (att.type.startsWith("audio/")) {
      toast.info("Áudios não são analisados pela IA (use os resumos da Matteline).");
      return;
    }
    setAiReadingId(att.id);
    try {
      const leadContext = [
        lead.contact && `Contato: ${lead.contact}`,
        lead.company && `Empresa: ${lead.company}`,
        lead.niche && `Nicho: ${lead.niche}`,
        lead.city && `Cidade: ${lead.city}`,
        lead.stage && `Etapa: ${lead.stage}`,
      ].filter(Boolean).join("\n");
      const data = await IntelligenceRepository.analyzeAttachment({
        attachment: { name: att.name, type: att.type, dataUrl: att.dataUrl }, leadContext,
      });
      const content = String(data?.content ?? "");
      setAiReadResults((prev) => ({ ...prev, [att.id]: content }));
      // Persiste a leitura para que a IA do card (diagnóstico) também a use.
      if (content.trim()) setAttachmentAnalysis(lead.id, att.id, content);
      onRefresh();
      toast.success("Anexo analisado pela IA");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao analisar anexo", { description: (e as Error)?.message });
    } finally {
      setAiReadingId(null);
    }
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
    updateLead(lead.id, patch); 
    syncFinance(next); 
    
    // Se o nome do contato ou da empresa mudou, precisamos atualizar os lembretes pendentes
    if (patch.contact !== undefined || patch.company !== undefined) {
      import("@/modules/agenda/services/reminders").then(({ refreshPendingRemindersForLead }) => {
        refreshPendingRemindersForLead(next);
      });
    }
    
    onRefresh();
  };

  const handleAddCallNote = () => {
    if (!newCallNote.trim()) return;
    addCallNote(lead.id, newCallNote, callScript);
    logCall({ scriptUsed: callScript, source: "call_note", leadId: lead.id });
    setNewCallNote(""); onRefresh(); toast.success("Anotação adicionada!");
  };

  const handleRefreshAI = async () => {
    setAnalyzingNoteId("ai-global");
    try {
      const hadSuggestion = await runIcpSuggestion(false, true);
      if (hadSuggestion) {
        setTab("observacoes");
        toast.success("Sugestão de ICP disponível na aba Notas");
      } else {
        toast.success("Inteligência do lead atualizada");
      }
    } catch (e) {
      toast.error("Erro ao atualizar inteligência");
    } finally {
      setAnalyzingNoteId(null);
    }
  };

  const meetings = getMeetingsForLead(lead.id);

  const copyScript = async () => {
    if (!step) return;
    const processed = processTemplate(step.script, lead, user?.user_metadata?.full_name || user?.email);
    try { await navigator.clipboard.writeText(processed); toast.success("Script copiado"); }
    catch { toast.error("Falha ao copiar"); }
  };

  const whats = draft.whatsapp || draft.phone;
  const leadTags = draft.tags || [];
  const whatsUrl = whats ? `https://wa.me/${whats.replace(/\D/g, "")}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Painel grande e denso (80vw x 85vh) — igual a Sheet, glass prejudica
          legibilidade aqui. Override explícito do .glass herdado de
          DialogContent (que é intencional para dialogs pequenos de
          confirmação): fundo sólido e sem blur, em claro e escuro. */}
      <DialogContent className="max-w-[80vw] w-[80vw] h-[85vh] p-0 gap-0 flex flex-col overflow-hidden !bg-background !backdrop-blur-none">
        {/* Cabeçalho Fixo e Compacto */}
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border/60 shrink-0 sticky top-0 bg-background z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Input
                value={draft.company}
                onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                onBlur={() => commitOnBlur({ company: draft.company.trim() || lead.company })}
                className="text-lg font-bold border-0 px-0 h-auto focus-visible:ring-0 shadow-none bg-transparent"
              />
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                <span>{lead.stage}</span>
                <span>•</span>
                <span>⏱ {formatDistanceToNow(new Date(lead.stageChangedAt), { locale: ptBR, addSuffix: true })}</span>
                <PriorityBadgeWithReasons priority={priority} tierMeta={tierMeta} className="ml-1" />
                <span className={dispTemp.cls}>{dispTemp.emoji}</span>
                <span>{dispTemp.label}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
               {isColdCall && step && (
                <Badge variant="outline" className="text-[10px] hidden sm:flex">
                  D{step.day} · {step.attempt === 0 ? "Novo" : `T${step.attempt}`}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-3">
            {draft.phone && (
              <a href={`tel:${draft.phone}`} className="inline-flex items-center justify-center h-7 w-7 rounded border border-border bg-card hover:bg-accent/10"><Phone className="h-3.5 w-3.5" /></a>
            )}
            {whatsUrl && (
              <a href={whatsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-7 w-7 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-500"><MessageCircle className="h-3.5 w-3.5" /></a>
            )}
            <a href={mapsUrlFor(draft)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-7 w-7 rounded border border-border bg-card hover:bg-accent/10 text-muted-foreground hover:text-foreground" title="Abrir Google Meu Negócio">
              <MapPin className="h-3.5 w-3.5" />
            </a>
            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setMeetingOpen(true)}><CalendarCheck className="h-3.5 w-3.5 mr-1" /> Agendar</Button>
            {isColdCall && step && (
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={copyScript}><Copy className="h-3.5 w-3.5 mr-1" /> Script</Button>
            )}
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-7 px-2 ml-auto text-accent" 
              onClick={handleRefreshAI}
              disabled={analyzingNoteId === "ai-global"}
            >
              {analyzingNoteId === "ai-global" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              IA
            </Button>
          </div>
          {meetings.length > 0 && (
             <div className="mt-2 text-xs">
                {meetings.map((m) => (
                  <div key={m.id} className="text-muted-foreground">
                    📅 {format(new Date(`${m.date}T${m.time}`), "dd/MM HH:mm", { locale: ptBR })}
                  </div>
                ))}
             </div>
          )}
        </DialogHeader>


        {/* Tabs Barra Fixa */}
        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-5 mt-2 self-start sticky top-0 bg-background z-20 w-[calc(100%-2.5rem)]">
            <TabsTrigger value="geral" className="text-xs">📋 Info</TabsTrigger>
            <TabsTrigger value="interacoes" className="text-xs">💬 Interações</TabsTrigger>
            <TabsTrigger value="observacoes" className="text-xs">
              📝 Notas
              {icpSuggestion && icpSuggestion.leadId === lead.id && (
                <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-accent inline-block" />
              )}
            </TabsTrigger>
            <TabsTrigger value="anexos" className="text-xs">📎 Anexos</TabsTrigger>
            
            <div className="ml-auto flex items-center gap-2 pr-2">
              {lead.googleRating !== undefined && (
                <div className="flex items-center gap-1" title={`${lead.googleRating} estrelas`}>
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  <span className="text-[10px] font-bold">{lead.googleRating.toFixed(1)}</span>
                </div>
              )}
            </div>
          </TabsList>



          {/* GERAL - Reorganizado por Níveis */}
          <TabsContent value="geral" className="flex-1 overflow-y-auto px-5 py-4 mt-0 space-y-6">

            {/* SPRINT 2 — Resumo executivo do lead */}
            <section className="rounded-lg border border-accent/30 bg-accent/5 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-accent">Resumo executivo</p>
                    <PriorityBadgeWithReasons priority={priority} tierMeta={tierMeta} variant="outline" className="text-[10px]" />
                    <Badge variant="outline" className="text-[10px]">{dispTemp.emoji} {dispTemp.label}</Badge>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Próxima ação</p>
                    <p className="mt-1 text-base font-semibold text-foreground">{step?.nextAction || "Revisar o lead e definir o próximo contato"}</p>
                  </div>
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <div><p className="font-semibold text-muted-foreground">Motivo</p><p className="line-clamp-2 text-foreground/80">{step?.objective || draft.notes || "Sem motivo registrado."}</p></div>
                    {/* Bug de auditoria (30/08): antes só olhava callNotes, então
                        leads com Interaction registrada mas sem callNote (ex.:
                        WhatsApp, reunião) mostravam "Sem contato registrado"
                        mesmo com histórico. Mesmo critério de LastContactLabel
                        em LeadExecutiveSummary.tsx: interactions OU callNotes. */}
                    <div><p className="font-semibold text-muted-foreground">Última interação</p><p className="text-foreground/80">{(callNotes.length || (lead.interactions?.length ?? 0)) ? "Interação registrada — veja a aba Interações." : "Sem contato registrado."}</p></div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {draft.phone && <Button asChild size="sm" className="h-8 gap-1 bg-accent px-2 text-[10px] text-accent-foreground hover:bg-accent/90"><a href={`tel:${draft.phone}`} aria-label="Ligar agora"><Phone className="h-3.5 w-3.5" /> Ligar</a></Button>}
                  {whatsUrl && (
                    <WhatsAppSendMenu
                      lead={draft}
                      meeting={meetings[0]}
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 text-[10px] border-emerald-500/30 text-emerald-500"
                      label=""
                    />
                  )}
                  <Button asChild size="sm" variant="outline" className="h-8 px-2 text-[10px]"><a href={mapsUrlFor(draft)} target="_blank" rel="noopener noreferrer" aria-label="Abrir Google Maps"><MapPin className="h-3.5 w-3.5" /></a></Button>
                  {draft.instagramLink && <Button asChild size="sm" variant="outline" className="h-8 px-2 text-[10px] border-pink-500/30 text-pink-500"><a href={draft.instagramLink} target="_blank" rel="noopener noreferrer" aria-label="Abrir Instagram"><Instagram className="h-3.5 w-3.5" /></a></Button>}
                  {isColdCall && step && <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-[10px]" onClick={() => setScriptOpen(true)}><FileText className="h-3.5 w-3.5" /> Script</Button>}
                </div>
              </div>
              {isColdCall && step && <Button size="sm" className="h-8 w-full gap-1 bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setConcluirOpen(true)}><CheckCircle2 className="h-3.5 w-3.5" /> Concluir próxima ação</Button>}
            </section>

            {/* NÍVEL 1 - Essencial: Mover e Marcar */}
            <div className="grid grid-cols-2 gap-3">
               <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-tighter">Etapa Atual</Label>
                  <Select value={lead.stage} onValueChange={(toStage) => {
                      if (toStage === lead.stage) return;
                      const isLost = toStage.toLowerCase().includes("não quer") || toStage.toLowerCase().includes("nao quer") || toStage === "Perdido";
                      if (isLost) {
                        window.dispatchEvent(new CustomEvent("p21:trigger-lost-reason", { detail: { id: lead.id, stage: toStage } }));
                        onOpenChange(false);
                        return;
                      }
                      moveLeadToStage(lead.id, toStage);
                      onRefresh();
                      onOpenChange(false);
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["cold_call", "oportunidades", "onboarding"] as PipelineName[]).map((p) => (
                        <SelectGroup key={p}>
                          <SelectLabel className="text-[9px] uppercase text-accent">{p}</SelectLabel>
                          {getStagesForPipeline(p).map((s) => (<SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
               </div>
               <div className="flex items-end">
                  <Button size="sm" onClick={() => setMeetingOpen(true)} className="h-8 w-full text-xs bg-accent">
                    <CalendarCheck className="h-3.5 w-3.5 mr-1" /> Reunião
                  </Button>
               </div>
            </div>

            {/* CONTATO */}
            <section className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1">Contato</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <div className="space-y-1">
                   <Label htmlFor="lead-contact" className="text-[10px] text-muted-foreground">Decisor / Contato</Label>
                   <Input id="lead-contact" size={1} className="h-8 text-xs" value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} onBlur={() => commitOnBlur({ contact: draft.contact })} />
                </div>
                <div className="space-y-1">
                   <Label htmlFor="lead-phone" className="text-[10px] text-muted-foreground">Telefone</Label>
                   <Input id="lead-phone" type="tel" size={1} className="h-8 text-xs" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} onBlur={() => commitOnBlur({ phone: draft.phone })} />
                </div>
                <div className="space-y-1">
                   <Label htmlFor="lead-whatsapp" className="text-[10px] text-muted-foreground">WhatsApp</Label>
                   <Input id="lead-whatsapp" type="tel" size={1} className="h-8 text-xs" value={draft.whatsapp || ""} placeholder={draft.phone} onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })} onBlur={() => commitOnBlur({ whatsapp: draft.whatsapp })} />
                </div>
                <div className="space-y-1">
                   <Label htmlFor="lead-instagram" className="text-[10px] text-muted-foreground">Instagram</Label>
                   <Input id="lead-instagram" size={1} className="h-8 text-xs" value={draft.instagramLink} onChange={(e) => setDraft({ ...draft, instagramLink: e.target.value })} onBlur={() => commitOnBlur({ instagramLink: draft.instagramLink })} />
                </div>
              </div>
            </section>

            {/* EMPRESA */}
            <section className="space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1 flex items-center gap-1.5">
                <Building2 className="h-3 w-3" /> Empresa
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <div className="space-y-1">
                  <Label htmlFor="lead-niche" className="text-[10px] text-muted-foreground">Nicho</Label>
                  <Input id="lead-niche" className="h-8 text-xs" value={draft.niche} onChange={(e) => setDraft({ ...draft, niche: e.target.value })} onBlur={() => commitOnBlur({ niche: draft.niche })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lead-city" className="text-[10px] text-muted-foreground">Cidade</Label>
                  <Input id="lead-city" className="h-8 text-xs" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} onBlur={() => commitOnBlur({ city: draft.city })} />
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-muted/20">
                  <span className="text-xs">Prioridade ICP</span>
                  <StarRating value={draft.icpStars} onChange={(v) => { persist({ icpStars: v }); onRefresh(); }} />
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-muted/20">
                  <span className="text-xs">Faz Anúncios?</span>
                  <Switch checked={draft.runsAds} onCheckedChange={(v) => { persist({ runsAds: v }); onRefresh(); }} />
                </div>
              </div>
              <div className="space-y-1.5 p-2 rounded bg-muted/20">
                <Label className="text-[10px] text-muted-foreground uppercase">Tag de Origem</Label>
                <div className="flex flex-wrap gap-1.5">
                  {["GMN", "LUPUS", "INBOUND"].map(tag => (
                    <Badge
                      key={tag}
                      variant={leadTags.includes(tag) ? "default" : "outline"}
                      className={`text-[10px] cursor-pointer transition-all ${leadTags.includes(tag) ? "bg-accent hover:bg-accent/90 border-transparent" : "hover:border-accent/40"}`}
                      onClick={() => {
                        const newTags = leadTags.includes(tag)
                          ? leadTags.filter(t => t !== tag)
                          : [...leadTags, tag];
                        persist({ tags: newTags });
                        onRefresh();
                      }}
                    >
                      {tag}
                    </Badge>
                  ))}
                  <Input
                    placeholder="Nova tag..."
                    className="h-5 w-20 text-[10px] py-0 px-1 inline-flex bg-transparent border-dashed"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim().toUpperCase();
                        if (val && !leadTags.includes(val)) {
                          persist({ tags: [...leadTags, val] });
                          onRefresh();
                          e.currentTarget.value = "";
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </section>

            {/* LINKS */}
            <section className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1 flex items-center gap-1.5">
                <Globe className="h-3 w-3" /> Links e Localização
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <div className="space-y-1">
                  <Label htmlFor="lead-website" className="text-[10px] text-muted-foreground">Website</Label>
                  <Input id="lead-website" className="h-8 text-xs" value={draft.website ?? ""} onChange={(e) => setDraft({ ...draft, website: e.target.value })} onBlur={() => commitOnBlur({ website: draft.website })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lead-gmn" className="text-[10px] text-muted-foreground">Google Maps</Label>
                  <Input id="lead-gmn" className="h-8 text-xs" value={draft.gmnLink} onChange={(e) => setDraft({ ...draft, gmnLink: e.target.value })} onBlur={() => commitOnBlur({ gmnLink: draft.gmnLink })} />
                </div>
              </div>
            </section>

            {/* NEGÓCIO */}
            {(isOnboarding || isOportunidades) && (
              <section className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1">Negócio</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="lead-contract-value" className="text-[10px] text-muted-foreground uppercase">Valor Contrato</Label>
                    <Input id="lead-contract-value" type="number" className="h-8 text-xs" value={draft.contractValue ?? ""} onChange={(e) => setDraft({ ...draft, contractValue: e.target.value === "" ? undefined : Number(e.target.value) })} onBlur={() => commitOnBlur({ contractValue: draft.contractValue })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lead-service-type" className="text-[10px] text-muted-foreground uppercase">Serviço</Label>
                    <Input id="lead-service-type" className="h-8 text-xs" value={draft.serviceType ?? ""} onChange={(e) => setDraft({ ...draft, serviceType: e.target.value })} onBlur={() => commitOnBlur({ serviceType: draft.serviceType })} />
                  </div>
                </div>
              </section>
            )}
          </TabsContent>


          {/* INTERAÇÕES COMERCIAIS */}
          <TabsContent value="interacoes" className="flex-1 overflow-y-auto px-5 py-4 mt-0 space-y-6">
            <div className="rounded-lg border border-accent/20 bg-accent/5 p-4 mb-2">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5" /> Memória e Inteligência
                </h4>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-7 text-[10px] text-accent hover:bg-accent/10"
                  onClick={() => { setTab("interacoes"); setAutoRunDiagnosis(true); }}
                >
                  <RefreshCw className="h-3 w-3 mr-1.5" /> Atualizar IA
                </Button>
              </div>
              <LeadExecutiveSummary lead={lead} />
            </div>

            <InteracoesTimeline
              lead={lead}
              onRefresh={onRefresh}
              autoOpenNewInteraction={autoNewInteraction}
              onAutoNewInteractionConsumed={() => setAutoNewInteraction(false)}
              autoRunDiagnosis={autoRunDiagnosis}
              onAutoRunDiagnosisConsumed={() => setAutoRunDiagnosis(false)}
            />
          </TabsContent>


          {/* OBSERVAÇÕES - Reorganizado */}
          <TabsContent value="observacoes" className="flex-1 overflow-y-auto px-5 py-4 mt-0 space-y-4">
            {icpSuggestion && icpSuggestion.leadId === lead.id && (
              <section className="rounded-lg border border-accent/40 bg-accent/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-accent font-bold flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" /> Sugestão de ICP da IA
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>Atual: {draft.icpStars}★</span>
                    <span>→</span>
                    <span className="text-accent font-bold">Sugerido: {icpSuggestion.stars}★</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{icpSuggestion.reasoning}</p>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs bg-accent text-accent-foreground" onClick={applyIcpSuggestion}>
                    Aplicar {icpSuggestion.stars}★
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setIcpSuggestion(null)}>
                    Dispensar
                  </Button>
                </div>
              </section>
            )}

            <div className="space-y-2">
              <Label htmlFor="lead-notes" className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Notas Permanentes
              </Label>
              <Textarea
                id="lead-notes"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                onBlur={() => commitOnBlur({ notes: draft.notes })}
                rows={6}
                className="text-sm bg-muted/10 border-border/40"
                placeholder="Prefere contato após as 16h, decisão depende do sócio..."
              />
            </div>

            <Accordion type="multiple" defaultValue={["tasks"]} className="w-full">
              <AccordionItem value="tasks" className="border-border/40">
                <AccordionTrigger className="py-2 text-xs font-semibold uppercase text-muted-foreground hover:no-underline">
                  <span className="flex items-center gap-1.5"><ListTodo className="h-3.5 w-3.5" /> Tarefas do Lead</span>
                </AccordionTrigger>
                <AccordionContent className="pt-2 pb-4 space-y-2">
                  {(() => {
                    void tasksVer;
                    const tasks = getTasksByLead(lead.id);
                    return (
                      <div className="space-y-2">
                        <div className="flex justify-end">
                           <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditingTask(null); setTaskFormOpen(true); }}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Nova Tarefa
                          </Button>
                        </div>
                        {tasks.length === 0 && <p className="text-[10px] text-muted-foreground text-center py-4 italic">Nenhuma tarefa pendente.</p>}
                        {tasks.map((t) => (
                          <div key={t.id} className="rounded border border-border/40 bg-muted/20 p-2 flex items-center gap-2">
                            <Checkbox checked={t.status === "concluida"} onCheckedChange={(v) => { if (v) completeTask(t.id); else reopenTask(t.id); setTasksVer((x) => x + 1); }} />
                            <div className="flex-1 min-w-0">
                               <p className={`text-xs font-medium truncate ${t.status === "concluida" ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
                            </div>
                            <Badge variant="outline" className={`text-[9px] ${PRIORITY_CLASSES[t.priority]}`}>{PRIORITY_LABEL[t.priority]}</Badge>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </AccordionContent>
              </AccordionItem>

              {isColdCall && (
                <AccordionItem value="cadence" className="border-border/40">
                  <AccordionTrigger className="py-2 text-xs font-semibold uppercase text-muted-foreground hover:no-underline">
                    <span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> Cadência do Nicho</span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2 pb-4">
                    <div className="rounded border border-border/40 bg-muted/10 p-1">
                      <CadenceEditor niche={lead.niche} currentAttempt={step?.attempt} onChanged={onRefresh} />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          </TabsContent>


          {/* ANEXOS - Reorganizado em Grid Compacto */}
          <TabsContent
            value="anexos"
            className="flex-1 overflow-y-auto px-5 py-4 mt-0"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const files = Array.from(e.dataTransfer.files || []);
              if (files.length) void attachFiles(files);
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5" /> Arquivos ({lead.attachments.length})
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => fileRef.current?.click()}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
              </Button>
              <input ref={fileRef} type="file" multiple accept="audio/*,image/*,.pdf,.doc,.docx" className="hidden" onChange={handleFileUpload} />
            </div>

            <div className={`mb-4 rounded border border-dashed p-3 text-[10px] text-center transition-colors ${dragOver ? "border-accent bg-accent/5" : "border-border/40 text-muted-foreground"}`}>
              Arraste arquivos ou cole (Ctrl+V) prints aqui.
            </div>

            {lead.attachments.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {lead.attachments.map((att) => {
                  const isImg = att.type.startsWith("image/");
                  return (
                    <div key={att.id} className="rounded border border-border/40 bg-muted/10 overflow-hidden flex flex-col">
                      {isImg && (
                        <div className="aspect-video w-full bg-black/20 flex items-center justify-center overflow-hidden">
                           <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="p-2 space-y-1 flex-1">
                        <div className="flex items-start justify-between gap-1">
                           <p className="text-[11px] font-medium truncate flex-1" title={att.name}>{att.name}</p>
                           <button onClick={() => { removeAttachment(lead.id, att.id); onRefresh(); }} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                        </div>
                        <p className="text-[9px] text-muted-foreground uppercase">{format(new Date(att.createdAt), "dd/MM HH:mm", { locale: ptBR })}</p>
                        
                        <div className="flex gap-1 pt-2">
                           <Button size="sm" variant="outline" asChild className="h-6 text-[10px] flex-1"><a href={att.dataUrl} target="_blank" rel="noopener noreferrer">Ver</a></Button>
                           {!att.type.startsWith("audio/") && (
                             <Button size="sm" variant="secondary" className="h-6 text-[10px] flex-1" disabled={aiReadingId === att.id} onClick={() => handleReadAttachmentWithAI(att)}>
                               {aiReadingId === att.id ? "..." : (att.aiAnalysis ? "Reler" : "IA")}
                             </Button>
                           )}
                        </div>

                        {att.aiAnalysis && (
                          <div className="mt-2 text-[10px] text-muted-foreground line-clamp-3 italic border-t border-border/20 pt-1">
                            {att.aiAnalysis}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-xs italic">Nenhum anexo.</div>
            )}
          </TabsContent>

        </Tabs>

      </DialogContent>

      {/* Script viewer secundário */}
      <Dialog open={scriptOpen} onOpenChange={setScriptOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Script — {step ? `D${step.day} · ${step.attempt === 0 ? "Novo Lead" : `Tentativa ${step.attempt}`} · ${step.channel}` : ""}</DialogTitle>
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
