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
  getMeetingsForLead,
} from "@/lib/store";
import { analyzeCallNote } from "@/lib/callAnalysis";
import { CallAuditView } from "@/components/CallAuditView";

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

// Item unificado da timeline (interação nova, callNote legado, ou reunião agendada).
type TimelineItem =
  | { kind: "interaction"; at: string; data: Interaction }
  | { kind: "callNote"; at: string; data: CallNote }
  | { kind: "meeting"; at: string; data: ReturnType<typeof getMeetingsForLead>[number] };

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

  const meetings = getMeetingsForLead(lead.id);

  const items = useMemo<TimelineItem[]>(() => {
    const rows: TimelineItem[] = [];
    for (const i of lead.interactions || []) rows.push({ kind: "interaction", at: i.date, data: i });
    for (const n of lead.callNotes || []) rows.push({ kind: "callNote", at: n.createdAt, data: n });
    for (const m of meetings) rows.push({ kind: "meeting", at: `${m.date}T${m.time}:00`, data: m });
    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [lead.interactions, lead.callNotes, meetings]);

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

  useEffect(() => {
    if (!autoRunDiagnosis) return;
    const latest = [...(lead.callNotes || [])]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    if (latest) {
      analyzeNote(latest, "full");
    } else {
      // Sem ligações registradas: cria uma nota sintética para viabilizar o
      // diagnóstico completo do card (informações, interações, observações e anexos).
      const interCount = (lead.interactions || []).length;
      const meetCount = meetings.length;
      const attCount = (lead.attachments || []).length;
      const syntheticSummary = [
        `Solicitação de diagnóstico geral do lead (sem ligação registrada até o momento).`,
        `Contexto atual: etapa "${lead.stage}", ${interCount} interação(ões) comercial(is), ${meetCount} reunião(ões), ${attCount} anexo(s).`,
        lead.notes ? `Observações do vendedor: ${lead.notes.slice(0, 800)}` : null,
      ].filter(Boolean).join("\n");
      addCallNote(lead.id, syntheticSummary, "Diagnóstico Geral");
      const refreshed = getLeads().find((l) => l.id === lead.id);
      const created = [...(refreshed?.callNotes || [])]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      onRefresh();
      if (created) analyzeNote(created, "full");
    }
    onAutoRunDiagnosisConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunDiagnosis]);



  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Timeline de Interações Comerciais</p>
          <p className="text-xs text-muted-foreground">
            {items.length} evento(s) — ligações, reuniões e demais contatos comerciais em ordem cronológica.
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
        <ol className="relative border-l border-border/60 ml-3 space-y-4">
          {items.map((it) => {
            if (it.kind === "meeting") {
              const m = it.data;
              const Icon = Users;
              return (
                <li key={`m-${m.id}`} className="ml-4">
                  <span className="absolute -left-[9px] mt-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-accent" />
                  <div className={`rounded-md border p-3 ${colorFor("Reunião")}`}>
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

            if (it.kind === "callNote") {
              const n = it.data;
              const isAnalyzing = analyzingNoteId === n.id;
              const analysis = n.analysis;
              return (
                <li key={`c-${n.id}`} className="ml-4 group">
                  <span className="absolute -left-[9px] mt-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-primary" />
                  <div className={`rounded-md border p-3 ${colorFor("Ligação")}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold">Ligação</span>
                        {n.scriptUsed && <Badge variant="outline" className="text-[10px]">{n.scriptUsed}</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(n.createdAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </span>
                        <button onClick={() => { removeCallNote(lead.id, n.id); onRefresh(); }}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
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
                </li>
              );
            }

            const i = it.data;
            const Icon = iconFor(i.type);
            return (
              <li key={`i-${i.id}`} className="ml-4 group">
                <span className="absolute -left-[9px] mt-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-foreground/70" />
                <div className={`rounded-md border p-3 ${colorFor(i.type)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-xs font-semibold truncate">{i.type}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-muted-foreground">
                        <CalendarIcon className="h-3 w-3 inline mr-0.5" />
                        {format(parseISO(i.date), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </span>
                      <button onClick={() => { setEditing(i); setFormOpen(true); }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button onClick={() => { removeInteraction(lead.id, i.id); onRefresh(); toast.success("Interação removida"); }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-medium mt-1">{i.title}</p>
                  {i.summary && (
                    <p className="text-sm whitespace-pre-wrap mt-1 text-foreground/90">{i.summary}</p>
                  )}
                  {i.sellerNotes && (
                    <div className="mt-2 rounded bg-background/50 border border-border/40 p-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Anotações do vendedor</p>
                      <p className="text-xs whitespace-pre-wrap">{i.sellerNotes}</p>
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
