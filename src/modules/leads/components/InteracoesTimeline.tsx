import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Phone, Users, MessageCircle, Mail, FileText, MapPin, Handshake,
  Video, Sparkles, Plus, Pencil, Trash2, ExternalLink, Loader2, CalendarCheck,
  Calendar as CalendarIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import {
  type Lead, type Interaction, type InteractionType, type CallNote,
  addInteraction, updateInteraction, removeInteraction, removeCallNote,
  addCallNote, getLeads,
  getMeetingsForLead, getDiagnosisHistory, type DiagnosisVersion,
} from "@/shared/services/store";
import { analyzeCallNote } from "@/modules/laboratorio/services/callAnalysis";
import { CallAuditView } from "@/modules/laboratorio/components/CallAuditView";
import AutoDiagnosisCard from "@/modules/intelligence/components/AutoDiagnosisCard";
import LeadExecutiveSummary from "@/modules/leads/components/LeadExecutiveSummary";
import LeadTrail from "@/modules/leads/components/LeadTrail";
import { LeadIntelligenceRepository } from "@/modules/leads/services/LeadIntelligenceRepository";
import { highlightsFor, isCriticalEvent } from "@/modules/intelligence/services/timelineHighlights";
import IntelligenceUpdateBlock from "@/modules/intelligence/components/IntelligenceUpdateBlock";
import DiagnosisHistoryBlock from "@/modules/intelligence/components/DiagnosisHistoryBlock";
import { refreshLeadIntelligence } from "@/modules/intelligence/services/intelligenceSync";

import { ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

const INTERACTION_TYPES: InteractionType[] = [
  "Ligação",
  "Reunião Comercial",
  "Reunião de Diagnóstico",
  "Reunião de Apresentação",
  "Follow-up",
  "WhatsApp",
  "E-mail",
  "Envio de Proposta",
  "Visita Presencial",
  "Outro",
];

function iconFor(type: string) {
  const t = type.toLowerCase();
  if (t.includes("whatsapp")) return MessageCircle;
  if (t.includes("e-mail") || t.includes("email")) return Mail;
  if (t.includes("proposta")) return FileText;
  if (t.includes("visita")) return MapPin;
  if (t.includes("follow")) return Handshake;
  if (t.includes("reunião") || t.includes("reuniao")) return Users;
  if (t.includes("ligação") || t.includes("ligacao") || t.includes("call")) return Phone;
  return Sparkles;
}

function colorFor(type: string) {
  const t = type.toLowerCase();
  if (t.includes("whatsapp")) return "text-emerald-500 bg-emerald-500/10 border-emerald-500/30";
  if (t.includes("e-mail") || t.includes("email")) return "text-sky-500 bg-sky-500/10 border-sky-500/30";
  if (t.includes("proposta")) return "text-violet-500 bg-violet-500/10 border-violet-500/30";
  if (t.includes("visita")) return "text-amber-500 bg-amber-500/10 border-amber-500/30";
  if (t.includes("follow")) return "text-orange-500 bg-orange-500/10 border-orange-500/30";
  if (t.includes("reunião") || t.includes("reuniao")) return "text-accent bg-accent/10 border-accent/30";
  if (t.includes("ligação") || t.includes("ligacao")) return "text-primary bg-primary/15 border-primary/30";
  return "text-muted-foreground bg-muted/40 border-border";
}

/** Renderiza sellerNotes como pares "Rótulo: Valor", com links clicáveis
 *  em novas abas. Linhas cujo valor seja "[object Object]" (dados legados
 *  de agendamentos malformatados) são ocultadas para não poluir a UI. */
function SellerNotesView({ notes }: { notes: string }) {
  const lines = notes.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const isUrl = (v: string) => /^https?:\/\//i.test(v);
  const items = lines
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return { key: "", value: line };
      return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    })
    .filter((it) => it.value && it.value !== "[object Object]");
  if (items.length === 0) return null;
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
      {items.map((it, idx) => (
        <div key={idx} className="contents">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/80 pt-0.5">
            {it.key || "—"}
          </dt>
          <dd className="text-foreground/90 break-words">
            {isUrl(it.value) ? (
              <a
                href={it.value}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline break-all"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span>{it.value}</span>
              </a>
            ) : (
              <span className="whitespace-pre-wrap">{it.value}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Item unificado da timeline (interação nova, callNote legado, ou reunião agendada).
type TimelineItem =
  | { kind: "interaction"; at: string; data: Interaction }
  | { kind: "callNote"; at: string; data: CallNote }
  | { kind: "meeting"; at: string; data: ReturnType<typeof getMeetingsForLead>[number] }
  | { kind: "ai"; at: string; data: DiagnosisVersion };

function InteractionForm({
  open, onOpenChange, leadId, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  editing: Interaction | null;
  onSaved: () => void;
}) {
  const nowLocal = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const [type, setType] = useState<InteractionType>(editing?.type ?? "Ligação");
  const [customType, setCustomType] = useState(
    editing && !INTERACTION_TYPES.includes(editing.type) ? editing.type : ""
  );
  const [date, setDate] = useState(editing ? toLocalInput(editing.date) : nowLocal());
  const [title, setTitle] = useState(editing?.title ?? "");
  const [summary, setSummary] = useState(editing?.summary ?? "");
  const [sellerNotes, setSellerNotes] = useState(editing?.sellerNotes ?? "");

  const reset = () => {
    setType("Ligação"); setCustomType(""); setTitle(""); setSummary(""); setSellerNotes("");
    setDate(nowLocal());
  };


  const handleSave = () => {
    const finalType = type === "Outro" && customType.trim() ? customType.trim() : type;
    if (!title.trim()) { toast.error("Informe um título para a interação."); return; }
    if (!summary.trim()) { toast.error("Informe um resumo da interação."); return; }
    const isoDate = new Date(date).toISOString();
    if (editing) {
      updateInteraction(leadId, editing.id, { type: finalType, date: isoDate, title, summary, sellerNotes });
      toast.success("Interação atualizada");
    } else {
      addInteraction(leadId, { type: finalType, date: isoDate, title, summary, sellerNotes });
      toast.success("Interação registrada");
    }
    onSaved(); onOpenChange(false); reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Interação" : "Nova Interação Comercial"}</DialogTitle>
          <DialogDescription className="text-xs">
            Cada interação alimenta a timeline do lead e serve como contexto para a IA.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as InteractionType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERACTION_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                </SelectContent>
              </Select>
              {type === "Outro" && (
                <Input className="mt-2" placeholder="Especifique o tipo"
                  value={customType} onChange={(e) => setCustomType(e.target.value)} />
              )}
            </div>
            <div>
              <Label className="text-xs">Data e hora</Label>
              <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Primeira Ligação · Reunião de Diagnóstico · Follow-up Financeiro" />
          </div>
          <div>
            <Label className="text-xs">Resumo</Label>
            <Textarea rows={5} value={summary} onChange={(e) => setSummary(e.target.value)}
              placeholder="Resumo da conversa. Pode ser o gerado pela Matteline/IA ou escrito manualmente. Essa é a principal fonte para a IA Comercial." />
          </div>
          <div>
            <Label className="text-xs">Anotações do vendedor (opcional)</Label>
            <Textarea rows={3} value={sellerNotes} onChange={(e) => setSellerNotes(e.target.value)}
              placeholder="Ex: cliente parecia com pressa · sócio participará da próxima reunião · demonstrou interesse na consultoria." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleSave}>
            {editing ? "Salvar alterações" : "Registrar interação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InteracoesTimeline({
  lead, onRefresh,
  autoOpenNewInteraction, onAutoNewInteractionConsumed,
  autoRunDiagnosis, onAutoRunDiagnosisConsumed,
}: {
  lead: Lead;
  onRefresh: () => void;
  autoOpenNewInteraction?: boolean;
  onAutoNewInteractionConsumed?: () => void;
  autoRunDiagnosis?: boolean;
  onAutoRunDiagnosisConsumed?: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Interaction | null>(null);
  const [analyzingNoteId, setAnalyzingNoteId] = useState<string | null>(null);
  const [refreshingIntel, setRefreshingIntel] = useState(false);
  const [intelNoChange, setIntelNoChange] = useState(false);
  // Cards compactos por padrão — o vendedor expande apenas o que precisar.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const meetings = getMeetingsForLead(lead.id);
  const trail = useMemo(() => LeadIntelligenceRepository.trail(lead, meetings), [lead, meetings]);

  const items = useMemo<TimelineItem[]>(() => {
    const rows: TimelineItem[] = [];
    for (const i of lead.interactions || []) rows.push({ kind: "interaction", at: i.date, data: i });
    for (const n of lead.callNotes || []) rows.push({ kind: "callNote", at: n.createdAt, data: n });
    for (const m of meetings) rows.push({ kind: "meeting", at: `${m.date}T${m.time}:00`, data: m });
    for (const v of getDiagnosisHistory(lead)) rows.push({ kind: "ai", at: v.at, data: v });
    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [lead.interactions, lead.callNotes, lead.diagnosisHistory, meetings]);

  const analyzeNote = async (n: CallNote, mode: "quick" | "full") => {
    setAnalyzingNoteId(n.id);
    try {
      await analyzeCallNote(lead, n, mode);
      onRefresh();
      toast.success(mode === "quick" ? "Análise rápida gerada" : "Diagnóstico completo gerado");
    } catch (e) {
      toast.error("Falha ao analisar", { description: String((e as Error)?.message || e).slice(0, 260) });
    } finally { setAnalyzingNoteId(null); }
  };

  // Ação inicial vinda da Próxima Melhor Ação
  useEffect(() => {
    if (autoOpenNewInteraction) {
      setEditing(null);
      setFormOpen(true);
      onAutoNewInteractionConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenNewInteraction]);

  // "Atualizar Inteligência" (Diagnóstico Completo): recalcula TODO o estado
  // comercial do lead — briefing, temperatura, probabilidade, NBA, memória,
  // timeline, versionamento e prioridade.
  const runIntelligenceRefresh = async () => {
    if (refreshingIntel) return;
    setRefreshingIntel(true);
    setIntelNoChange(false);
    try {
      const res = await refreshLeadIntelligence(lead.id);
      if (!res.ok) {
        toast.error("Falha ao atualizar a inteligência", { description: res.error });
        return;
      }
      if (res.changed) {
        toast.success(`Inteligência atualizada (v${res.version?.version ?? 1})`, {
          description: res.changes[0] || "Estado comercial recalculado.",
        });
      } else {
        setIntelNoChange(true);
        toast.info("Nenhuma alteração relevante identificada desde a última análise.");
      }
      onRefresh();
    } finally {
      setRefreshingIntel(false);
    }
  };

  useEffect(() => {
    if (!autoRunDiagnosis) return;
    runIntelligenceRefresh();
    onAutoRunDiagnosisConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunDiagnosis]);



  return (
    <div className="space-y-4">
      {/* O que mudou — fonte única da verdade da IA */}
      <IntelligenceUpdateBlock lead={lead} running={refreshingIntel} noChange={intelNoChange} />

      {/* Diagnóstico Atual (versão mais recente) */}
      <AutoDiagnosisCard lead={lead} />

      {/* Briefing Comercial — sempre derivado do diagnóstico mais recente */}
      <LeadExecutiveSummary lead={lead} />

      {/* Histórico versionado da inteligência */}
      <DiagnosisHistoryBlock lead={lead} />

      {/* Linha do Tempo Comercial — panorama rápido em ícones */}
      {trail.length > 0 && (
        <div className="rounded-md border border-border/50 bg-card/40 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Linha do Tempo Comercial</p>
          <LeadTrail items={trail} />
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Timeline de Interações</p>
          <p className="text-xs text-muted-foreground">
            {items.length} evento(s) — clique para expandir os detalhes.
          </p>
        </div>
        <Button
          size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90"
          onClick={() => { setEditing(null); setFormOpen(true); }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Nova Interação
        </Button>
      </div>


      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
          <Sparkles className="h-6 w-6 mx-auto text-muted-foreground/60 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma interação registrada ainda.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Registre a primeira ligação, reunião ou follow-up para começar a timeline.
          </p>
        </div>
      ) : (
        <ol className="relative border-l border-border/60 ml-3 space-y-5">
          {items.map((it, idx) => {
            const isLatest = idx === 0;

            if (it.kind === "meeting") {
              const m = it.data;
              const Icon = Users;
              return (
                <li key={`m-${m.id}`} className="ml-4">
                  <span className="absolute -left-[9px] mt-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-accent" />
                  <div className={`rounded-md border p-3 ${colorFor("Reunião")} ${isLatest ? "ring-2 ring-accent/40 shadow-md" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold">Reunião agendada</span>
                        <Badge variant="outline" className="text-[10px]">{m.channel || "Reunião"}</Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        <CalendarCheck className="h-3 w-3 inline mr-0.5" />
                        {format(new Date(`${m.date}T${m.time}:00`), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    {m.title && <p className="text-sm font-medium mt-1">{m.title}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.meetLink && (
                        <a href={m.meetLink} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-accent/15 text-accent hover:bg-accent/25">
                          <Video className="h-2.5 w-2.5" /> Abrir Meet
                        </a>
                      )}
                      {m.googleEventUrl && (
                        <a href={m.googleEventUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground">
                          <ExternalLink className="h-2.5 w-2.5" /> Google Agenda
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              );
            }

            if (it.kind === "ai") {
              const v = it.data;
              return (
                <li key={`ai-${v.id}`} className="ml-4">
                  <span className="absolute -left-[9px] mt-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-accent" />
                  <div className={`rounded-md border border-accent/30 bg-accent/5 p-3 ${isLatest ? "ring-2 ring-accent/40 shadow-md" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-accent" />
                        <span className="text-xs font-semibold">IA atualizou o lead</span>
                        <Badge variant="outline" className="text-[10px]">v{v.version}</Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {format(new Date(v.at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    {v.changes.length > 0 ? (
                      <ul className="mt-1.5 space-y-0.5">
                        {v.changes.map((c, i) => (
                          <li key={i} className="text-xs text-foreground/90">• {c}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">Primeira análise completa registrada.</p>
                    )}
                  </div>
                </li>
              );
            }

            if (it.kind === "callNote") {
              const n = it.data;
              const isAnalyzing = analyzingNoteId === n.id;
              const analysis = n.analysis;
              const key = `c-${n.id}`;
              const isOpen = expanded.has(key);
              const oneLiner = (n.text || "").replace(/\s+/g, " ").trim().slice(0, 120);
              const hlCall = highlightsFor(n.text);
              const criticalCall = isCriticalEvent(hlCall);
              return (
                <li key={key} className="ml-4 group">
                  <span className={`absolute -left-[9px] mt-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background ${criticalCall ? "bg-rose-500" : "bg-primary"}`} />
                  <div className={`rounded-md border ${colorFor("Ligação")} ${isLatest ? "ring-2 ring-accent/40 shadow-md" : ""} ${criticalCall ? "ring-2 ring-rose-500/40 shadow-md" : ""}`}>
                    <button
                      onClick={() => toggle(key)}
                      className="w-full text-left p-3 flex items-start gap-2"
                      aria-expanded={isOpen}
                    >
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            <span className="text-xs font-semibold">Ligação</span>
                            {n.scriptUsed && <Badge variant="outline" className="text-[10px]">{n.scriptUsed}</Badge>}
                          </div>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {format(new Date(n.createdAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        {hlCall.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {hlCall.map((h) => (
                              <Badge key={h.key} variant="outline" className={`text-[10px] ${h.cls}`}>{h.label}</Badge>
                            ))}
                          </div>
                        )}
                        {!isOpen && oneLiner && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{oneLiner}</p>
                        )}
                      </div>

                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3">
                        <p className="text-sm whitespace-pre-wrap">{n.text}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                            onClick={() => analyzeNote(n, "quick")} disabled={isAnalyzing}>
                            {isAnalyzing ? (<><Loader2 className="h-3 w-3 animate-spin" /> Analisando…</>) : (<><Sparkles className="h-3 w-3" /> 🤖 Analisar Última</>)}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 border-primary/40 text-primary hover:bg-primary/10"
                            onClick={() => analyzeNote(n, "full")} disabled={isAnalyzing}>
                            {isAnalyzing ? (<><Loader2 className="h-3 w-3 animate-spin" /> Analisando…</>) : (<>🧠 Diagnóstico Completo</>)}
                          </Button>
                          <button onClick={() => { removeCallNote(lead.id, n.id); onRefresh(); }}
                            className="ml-auto text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        {analysis && (
                          <div className="mt-2 rounded-md border border-border/40 bg-background/60 p-3">
                            {analysis.data ? (<CallAuditView data={analysis.data} lead={lead} onRunDiagnosis={() => analyzeNote(n, "full")} />)
                              : analysis.markdown ? (
                                <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1">
                                  <ReactMarkdown>{analysis.markdown}</ReactMarkdown>
                                </div>
                              ) : null}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            }

            const i = it.data;
            const Icon = iconFor(i.type);
            const key = `i-${i.id}`;
            const isOpen = expanded.has(key);
            const oneLiner = (i.summary || i.title || "").replace(/\s+/g, " ").trim().slice(0, 140);
            const hl = highlightsFor(`${i.title} ${i.summary} ${i.sellerNotes || ""}`);
            const critical = isCriticalEvent(hl);
            return (
              <li key={key} className="ml-4 group">
                <span className={`absolute -left-[9px] mt-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background ${critical ? "bg-rose-500" : "bg-foreground/70"}`} />
                <div className={`rounded-md border ${colorFor(i.type)} ${isLatest ? "ring-2 ring-accent/40 shadow-md" : ""} ${critical ? "ring-2 ring-rose-500/40 shadow-md" : ""}`}>
                  <button
                    onClick={() => toggle(key)}
                    className="w-full text-left p-3 flex items-start gap-2"
                    aria-expanded={isOpen}
                  >
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="text-xs font-semibold truncate">{i.type}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          <CalendarIcon className="h-3 w-3 inline mr-0.5" />
                          {format(parseISO(i.date), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      {hl.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {hl.map((h) => (
                            <Badge key={h.key} variant="outline" className={`text-[10px] ${h.cls}`}>{h.label}</Badge>
                          ))}
                        </div>
                      )}
                      {!isOpen && oneLiner && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{oneLiner}</p>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3">
                      <p className="text-sm font-medium">{i.title}</p>
                      {i.summary && (
                        <p className="text-sm whitespace-pre-wrap mt-1 text-foreground/90">{i.summary}</p>
                      )}
                      {i.sellerNotes && (
                        <div className="mt-2 rounded bg-background/50 border border-border/40 p-2">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Anotações do vendedor</p>
                          <SellerNotesView notes={i.sellerNotes} />
                        </div>
                      )}
                      {i.classification && (
                        <div className="mt-2 rounded bg-accent/5 border border-accent/20 p-2">
                          <p className="text-[10px] uppercase tracking-wider text-accent font-semibold flex items-center gap-1 mb-1">
                            <BrainCircuit className="h-3 w-3" /> Classificação Estruturada IA
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
                            <div className="flex items-center gap-1">
                              <ShieldCheck className={`h-3 w-3 ${i.classification.decision_maker_identified ? "text-emerald-500" : "text-muted-foreground/40"}`} />
                              <span>Decisor: {i.classification.decision_maker_identified ? "Identificado" : "N/D"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Zap className={`h-3 w-3 ${i.classification.connected ? "text-amber-500" : "text-muted-foreground/40"}`} />
                              <span>Conexão: {i.classification.connected ? "Sim" : "Não"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <UserIcon className={`h-3 w-3 ${i.classification.decision_maker_contacted ? "text-emerald-500" : "text-muted-foreground/40"}`} />
                              <span>Falaram: {i.classification.decision_maker_contacted ? "Sim" : "Não"}</span>
                            </div>
                          </div>
                          <div className="mt-1.5 text-[10px] text-accent/80 font-medium">
                            Status: {i.classification.access_status.replace(/_/g, " ")}
                          </div>
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <button onClick={() => { setEditing(i); setFormOpen(true); }}
                          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                          <Pencil className="h-3 w-3" /> Editar
                        </button>
                        <button onClick={() => { removeInteraction(lead.id, i.id); onRefresh(); toast.success("Interação removida"); }}
                          className="text-[11px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1">
                          <Trash2 className="h-3 w-3" /> Remover
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <InteractionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        leadId={lead.id}
        editing={editing}
        onSaved={onRefresh}
      />
    </div>
  );
}
