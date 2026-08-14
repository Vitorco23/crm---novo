import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Phone, Users, MessageCircle, Mail, FileText, MapPin, Handshake,
  Video, Sparkles, Plus, Pencil, Trash2, ExternalLink, Loader2, CalendarCheck,
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import {
  type Lead, type Interaction, type InteractionType, type CallNote,
  addInteraction, updateInteraction, removeInteraction, removeCallNote,
  getDiagnosisHistory, type DiagnosisVersion,
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getMeetingsForLead } from "@/shared/services/store";

const INTERACTION_TYPES: InteractionType[] = [
  "Ligação", "Reunião Comercial", "Reunião de Diagnóstico", "Reunião de Apresentação",
  "Follow-up", "WhatsApp", "E-mail", "Envio de Proposta", "Visita Presencial", "Outro",
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
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/80 pt-0.5">{it.key || "—"}</dt>
          <dd className="text-foreground/90 break-words">
            {isUrl(it.value) ? (
              <a href={it.value} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline break-all">
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span>{it.value}</span>
              </a>
            ) : <span className="whitespace-pre-wrap">{it.value}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type TimelineItem =
  | { kind: "interaction"; at: string; data: Interaction }
  | { kind: "callNote"; at: string; data: CallNote }
  | { kind: "meeting"; at: string; data: ReturnType<typeof getMeetingsForLead>[number] }
  | { kind: "ai"; at: string; data: DiagnosisVersion };

function InteractionForm({ open, onOpenChange, leadId, editing, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; leadId: string; editing: Interaction | null; onSaved: () => void }) {
  const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const toLocalInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const [type, setType] = useState<InteractionType>(editing?.type ?? "Ligação");
  const [customType, setCustomType] = useState(editing && !INTERACTION_TYPES.includes(editing.type) ? editing.type : "");
  const [date, setDate] = useState(editing ? toLocalInput(editing.date) : nowLocal());
  const [title, setTitle] = useState(editing?.title ?? "");
  const [summary, setSummary] = useState(editing?.summary ?? "");
  const [sellerNotes, setSellerNotes] = useState(editing?.sellerNotes ?? "");
  const reset = () => { setType("Ligação"); setCustomType(""); setTitle(""); setSummary(""); setSellerNotes(""); setDate(nowLocal()); };
  const handleSave = () => {
    const finalType = type === "Outro" && customType.trim() ? customType.trim() : type;
    if (!title.trim()) { toast.error("Informe um título."); return; }
    if (!summary.trim()) { toast.error("Informe um resumo."); return; }
    const isoDate = new Date(date).toISOString();
    if (editing) updateInteraction(leadId, editing.id, { type: finalType, date: isoDate, title, summary, sellerNotes });
    else addInteraction(leadId, { type: finalType, date: isoDate, title, summary, sellerNotes });
    onSaved(); onOpenChange(false); reset();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Editar" : "Nova Interação"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as InteractionType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{INTERACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Data</Label><Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label className="text-xs">Resumo</Label><Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
          <div><Label className="text-xs">Notas</Label><Textarea rows={2} value={sellerNotes} onChange={(e) => setSellerNotes(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button className="bg-accent" onClick={handleSave}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InteracoesTimeline({ lead, onRefresh, autoOpenNewInteraction, onAutoNewInteractionConsumed, autoRunDiagnosis, onAutoRunDiagnosisConsumed }: { lead: Lead; onRefresh: () => void; autoOpenNewInteraction?: boolean; onAutoNewInteractionConsumed?: () => void; autoRunDiagnosis?: boolean; onAutoRunDiagnosisConsumed?: () => void }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Interaction | null>(null);
  const [analyzingNoteId, setAnalyzingNoteId] = useState<string | null>(null);
  const [refreshingIntel, setRefreshingIntel] = useState(false);
  const [intelNoChange, setIntelNoChange] = useState(false);
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
    try { await analyzeCallNote(lead, n, mode); onRefresh(); toast.success("Análise concluída"); }
    catch (e) { toast.error("Falha ao analisar"); } finally { setAnalyzingNoteId(null); }
  };

  const runIntelligenceRefresh = async () => {
    if (refreshingIntel) return;
    setRefreshingIntel(true);
    try {
      const res = await refreshLeadIntelligence(lead.id);
      if (res.ok) { onRefresh(); toast.success("Inteligência atualizada"); }
    } finally { setRefreshingIntel(false); }
  };

  useEffect(() => { if (autoOpenNewInteraction) { setEditing(null); setFormOpen(true); onAutoNewInteractionConsumed?.(); } }, [autoOpenNewInteraction]);
  useEffect(() => { if (autoRunDiagnosis) { runIntelligenceRefresh(); onAutoRunDiagnosisConsumed?.(); } }, [autoRunDiagnosis]);

  return (
    <div className="space-y-4">
      {/* Bloco de IA Oculto - Informações consolidadas no Resumo Executivo da aba Interações */}
      <div className="hidden">
        <IntelligenceUpdateBlock lead={lead} running={refreshingIntel} noChange={intelNoChange} />
        <AutoDiagnosisCard lead={lead} />
        <DiagnosisHistoryBlock lead={lead} />
      </div>
      {trail.length > 0 && (
        <div className="rounded border border-border/50 bg-card/40 p-2">
          <p className="text-[10px] uppercase text-muted-foreground mb-1.5">Trail</p>
          <LeadTrail items={trail} />
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <span className="text-xs font-bold uppercase text-muted-foreground">Timeline</span>
        <Button size="sm" className="h-7 text-xs bg-accent text-accent-foreground" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-3.5 w-3.5 mr-1" /> Registrar</Button>
      </div>

      {items.length === 0 ? (
        <div className="py-10 text-center text-xs text-muted-foreground italic">Nenhuma interação registrada.</div>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {items.map((it, idx) => {
            const isLatest = idx === 0;
            const itemId = `item-${idx}`;
            if (it.kind === "meeting") {
              const m = it.data;
              return (
                <AccordionItem key={`m-${m.id}`} value={itemId} className="border-none">
                  <div className="flex gap-2">
                    <span className="mt-2 flex h-3 w-3 items-center justify-center rounded-full bg-accent" />
                    <div className="flex-1 rounded border p-2 bg-accent/5">
                      <AccordionTrigger className="py-0 hover:no-underline border-none">
                        <div className="flex items-center justify-between w-full text-[11px] pr-2">
                           <span className="font-bold flex items-center gap-1"><Users className="h-3 w-3" /> Reunião</span>
                           <span className="text-muted-foreground">{format(new Date(`${m.date}T${m.time}:00`), "dd/MM HH:mm")}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-2 pb-0 text-[11px]">
                        <p>{m.title || "Reunião agendada"}</p>
                        {m.meetLink && <a href={m.meetLink} target="_blank" className="text-accent underline mt-1 block">Google Meet</a>}
                      </AccordionContent>
                    </div>
                  </div>
                </AccordionItem>
              );
            }
            if (it.kind === "ai") {
              const v = it.data;
              return (
                <div key={`ai-${v.id}`} className="flex gap-2">
                   <span className="mt-2 flex h-3 w-3 items-center justify-center rounded-full bg-foreground/20" />
                   <div className="flex-1 rounded border p-2 bg-muted/20 text-[10px]">
                      <p className="font-bold flex items-center gap-1 mb-0.5"><Sparkles className="h-2.5 w-2.5" /> IA v{v.version}</p>
                      <p className="text-muted-foreground mb-1">{format(new Date(v.at), "dd/MM HH:mm")}</p>
                      <div className="space-y-0.5">{v.changes.slice(0, 3).map((c, i) => <p key={i}>• {c}</p>)}</div>
                   </div>
                </div>
              );
            }
            const isCall = it.kind === "callNote";
            const data = it.data as any;
            return (
              <AccordionItem key={`i-${data.id}`} value={itemId} className="border-none">
                  <div className="flex gap-2">
                    <span className={`mt-2 flex h-3 w-3 items-center justify-center rounded-full ${isCall ? "bg-primary" : "bg-foreground/50"}`} />
                    <div className="flex-1 rounded border p-2 bg-card">
                      <AccordionTrigger className="py-0 hover:no-underline border-none">
                         <div className="flex items-center justify-between w-full text-[11px] pr-2">
                            <span className="font-bold flex items-center gap-1">{isCall ? <Phone className="h-3 w-3" /> : iconFor(data.type).name} {isCall ? "Ligação" : data.type}</span>
                            <span className="text-muted-foreground">{format(new Date(isCall ? data.createdAt : data.date), "dd/MM HH:mm")}</span>
                         </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-2 text-[11px]">
                         <p className="whitespace-pre-wrap">{isCall ? data.text : data.summary}</p>
                         {isCall && (
                           <div className="mt-2 flex gap-1.5">
                              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[9px]" onClick={() => analyzeNote(data, "full")}>Diagnóstico</Button>
                              <button onClick={() => { removeCallNote(lead.id, data.id); onRefresh(); }} className="ml-auto text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                           </div>
                         )}
                         {!isCall && (
                           <div className="mt-2 flex gap-1.5">
                              <button onClick={() => { setEditing(data); setFormOpen(true); }} className="text-[9px] text-muted-foreground hover:text-foreground">Editar</button>
                              <button onClick={() => { removeInteraction(lead.id, data.id); onRefresh(); }} className="text-[9px] text-muted-foreground hover:text-destructive">Remover</button>
                           </div>
                         )}
                      </AccordionContent>
                    </div>
                  </div>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <InteractionForm open={formOpen} onOpenChange={setFormOpen} leadId={lead.id} editing={editing} onSaved={onRefresh} />
    </div>
  );
}
