import {
  type Lead, type ICPStars,
  addAttachment, removeAttachment, updateLead,
  addCallNote, removeCallNote, getMeetingsForLead,
  getPipelineForStage,
} from "@/lib/store";
import { upsertOnboardingRevenue, findTransactionByClient, deleteTransaction } from "@/lib/finance";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Phone, Instagram, ExternalLink, Star, Paperclip, X, FileAudio,
  CalendarCheck, MessageSquarePlus, Trash2, Video, DollarSign, Briefcase,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import ScheduleMeetingDialog from "@/components/ScheduleMeetingDialog";

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
  const [draft, setDraft] = useState<Lead | null>(lead);
  const [newCallNote, setNewCallNote] = useState("");

  useEffect(() => {
    setDraft(lead);
    setNewCallNote("");
  }, [lead?.id]);

  if (!lead || !draft) return null;
  const pipeline = getPipelineForStage(lead.stage);
  const isOnboarding = pipeline === "onboarding";
  const isOportunidades = pipeline === "oportunidades";

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      addAttachment(lead.id, { name: file.name, type: file.type, dataUrl: reader.result as string });
      onRefresh();
      toast.success("Arquivo anexado!");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Persist a partial change immediately and refresh dependent lists.
  const persist = (patch: Partial<Lead>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    updateLead(lead.id, patch);
  };

  // Sync finance auto-revenue when contract value/service type changes (onboarding).
  const syncFinance = (next: Lead) => {
    if (!isOnboarding) return;
    if ((next.contractValue ?? 0) > 0) {
      upsertOnboardingRevenue({
        clientId: lead.id,
        clientName: (next.company || lead.company).trim(),
        amount: next.contractValue!,
        serviceType: next.serviceType,
      });
    } else {
      const existing = findTransactionByClient(lead.id);
      if (existing) deleteTransaction(existing.id);
    }
  };

  // Commit on blur for text inputs (avoids re-render spam) and refresh lists.
  const commitOnBlur = (patch: Partial<Lead>) => {
    const next = { ...draft, ...patch };
    updateLead(lead.id, patch);
    syncFinance(next);
    onRefresh();
  };

  const handleAddCallNote = () => {
    if (!newCallNote.trim()) return;
    addCallNote(lead.id, newCallNote);
    setNewCallNote("");
    onRefresh();
    toast.success("Anotação adicionada!");
  };

  const callNotes = [...(lead.callNotes || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <Input
            value={draft.company}
            onChange={(e) => setDraft({ ...draft, company: e.target.value })}
            onBlur={() => commitOnBlur({ company: draft.company.trim() || lead.company })}
            className="text-base font-semibold"
            aria-label="Empresa"
          />
          <SheetDescription className="text-xs">
            Etapa: <span className="font-medium text-foreground">{lead.stage}</span> · ⏱{" "}
            {formatDistanceToNow(new Date(lead.stageChangedAt), { locale: ptBR, addSuffix: true })}
          </SheetDescription>
          <SheetTitle className="sr-only">{lead.company}</SheetTitle>
        </SheetHeader>

        {!isOnboarding && (
          <Button
            onClick={() => setMeetingOpen(true)}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90 mb-4"
            size="sm"
          >
            <CalendarCheck className="h-4 w-4 mr-1.5" /> Marcar Reunião
          </Button>
        )}

        {isOnboarding && (
          <div className="rounded-md border border-accent/30 bg-accent/5 p-3 mb-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-accent">
              <DollarSign className="h-3.5 w-3.5" /> Contrato Fechado
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
                <Input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={draft.contractValue ?? ""}
                  onChange={(e) => setDraft({ ...draft, contractValue: e.target.value === "" ? undefined : Number(e.target.value) })}
                  onBlur={() => commitOnBlur({ contractValue: draft.contractValue })}
                  placeholder="0,00"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Briefcase className="h-3 w-3" /> Tipo de Serviço
                </Label>
                <Input
                  value={draft.serviceType ?? ""}
                  onChange={(e) => setDraft({ ...draft, serviceType: e.target.value })}
                  onBlur={() => commitOnBlur({ serviceType: draft.serviceType })}
                  placeholder="Ex: Tráfego pago"
                />
              </div>
            </div>
            {typeof draft.contractValue === "number" && draft.contractValue > 0 && (
              <p className="text-[10px] text-muted-foreground">✓ Receita registrada no Financeiro</p>
            )}
          </div>
        )}

        {isOportunidades && (() => {
          const PRESETS = ["Gestão Recorrente", "Implementação Comercial"];
          const current = draft.serviceType ?? "";
          const selectValue = current === "" ? "" : (PRESETS.includes(current) ? current : "Outro");
          return (
            <div className="rounded-md border border-accent/30 bg-accent/5 p-3 mb-4 space-y-3">
              <div>
                <Label className="text-xs text-accent flex items-center gap-1 mb-1.5">
                  <DollarSign className="h-3.5 w-3.5" /> Valor do Contrato (R$)
                </Label>
                <Input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={draft.contractValue ?? ""}
                  onChange={(e) => setDraft({ ...draft, contractValue: e.target.value === "" ? undefined : Number(e.target.value) })}
                  onBlur={() => commitOnBlur({ contractValue: draft.contractValue })}
                  placeholder="0,00"
                />
              </div>
              <div>
                <Label className="text-xs text-accent flex items-center gap-1 mb-1.5">
                  <Briefcase className="h-3.5 w-3.5" /> Tipo de Serviço
                </Label>
                <Select
                  value={selectValue || undefined}
                  onValueChange={(v) => {
                    const next = v === "Outro" ? "" : v;
                    setDraft({ ...draft, serviceType: next });
                    commitOnBlur({ serviceType: next });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Gestão Recorrente">Gestão Recorrente</SelectItem>
                    <SelectItem value="Implementação Comercial">Implementação Comercial</SelectItem>
                    <SelectItem value="Outro">Outro (especificar)</SelectItem>
                  </SelectContent>
                </Select>
                {selectValue === "Outro" && (
                  <Input
                    className="mt-2"
                    placeholder="Especifique o tipo de serviço"
                    value={draft.serviceType ?? ""}
                    onChange={(e) => setDraft({ ...draft, serviceType: e.target.value })}
                    onBlur={() => commitOnBlur({ serviceType: draft.serviceType })}
                  />
                )}
              </div>
            </div>
          );
        })()}

        <div className="space-y-5 pr-1">
          {/* ICP */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Prioridade ICP</Label>
            <div className="flex items-center gap-2">
              <StarRating
                value={draft.icpStars}
                onChange={(v) => { persist({ icpStars: v }); onRefresh(); }}
              />
              <span className="text-sm text-foreground">
                {draft.icpStars === 1 ? "Baixa" : draft.icpStars === 2 ? "Média" : "Alta"}
              </span>
            </div>
          </div>

          {/* Anúncios */}
          <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
            <Label className="text-sm">Faz Anúncios?</Label>
            <Switch
              checked={draft.runsAds}
              onCheckedChange={(v) => { persist({ runsAds: v }); onRefresh(); }}
            />
          </div>

          {/* Grid: Contato, Nicho, Cidade, Telefone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Contato</Label>
              <Input
                value={draft.contact}
                onChange={(e) => setDraft({ ...draft, contact: e.target.value })}
                onBlur={() => commitOnBlur({ contact: draft.contact })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Nicho</Label>
              <Input
                value={draft.niche}
                onChange={(e) => setDraft({ ...draft, niche: e.target.value })}
                onBlur={() => commitOnBlur({ niche: draft.niche })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Cidade</Label>
              <Input
                value={draft.city}
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                onBlur={() => commitOnBlur({ city: draft.city })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" /> Telefone
              </Label>
              <Input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                onBlur={() => commitOnBlur({ phone: draft.phone })}
              />
            </div>
          </div>

          {/* Links */}
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Google Meu Negócio
              </Label>
              <Input
                value={draft.gmnLink}
                onChange={(e) => setDraft({ ...draft, gmnLink: e.target.value })}
                onBlur={() => commitOnBlur({ gmnLink: draft.gmnLink })}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Instagram className="h-3 w-3" /> Instagram
              </Label>
              <Input
                value={draft.instagramLink}
                onChange={(e) => setDraft({ ...draft, instagramLink: e.target.value })}
                onBlur={() => commitOnBlur({ instagramLink: draft.instagramLink })}
                placeholder="https://instagram.com/..."
              />
            </div>
          </div>

          {/* Observações fixas */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Observações gerais</Label>
            <Textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              onBlur={() => commitOnBlur({ notes: draft.notes })}
              rows={3}
            />
          </div>

          {/* Reuniões agendadas */}
          {(() => {
            const meetings = getMeetingsForLead(lead.id);
            if (meetings.length === 0) return null;
            return (
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                  <CalendarCheck className="h-3 w-3" /> Reuniões agendadas ({meetings.length})
                </Label>
                <div className="space-y-2">
                  {meetings.slice(0, 3).map((m) => (
                    <div key={m.id} className="bg-muted/40 rounded-md p-2 border border-border/40 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-foreground">
                          {format(new Date(`${m.date}T${m.time}`), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </p>
                        <Badge variant="outline" className="text-[10px]">{m.channel || "Reunião"}</Badge>
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
                        {m.attendeeEmail && (
                          <span className="text-[10px] text-muted-foreground">→ {m.attendeeEmail}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Anotações de chamada (timeline) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <MessageSquarePlus className="h-3 w-3" /> Anotações de Contato ({callNotes.length})
              </Label>
            </div>
            <div className="space-y-2">
              <Textarea
                placeholder="Como foi a ligação? O que o lead disse? Próximos passos..."
                value={newCallNote}
                onChange={(e) => setNewCallNote(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <Button
                size="sm"
                onClick={handleAddCallNote}
                disabled={!newCallNote.trim()}
                className="w-full bg-accent/90 text-accent-foreground hover:bg-accent h-8 text-xs"
              >
                <MessageSquarePlus className="h-3 w-3 mr-1" /> Adicionar anotação
              </Button>
            </div>
            {callNotes.length > 0 && (
              <div className="space-y-1.5 mt-3">
                {callNotes.map((n) => (
                  <div key={n.id} className="group bg-muted/40 rounded-md p-2 border border-border/40">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-foreground whitespace-pre-wrap flex-1">{n.text}</p>
                      <button
                        onClick={() => { removeCallNote(lead.id, n.id); onRefresh(); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      {format(new Date(n.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Anexos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <FileAudio className="h-3 w-3" /> Arquivos ({lead.attachments.length})
              </p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => fileRef.current?.click()}>
                <Paperclip className="h-3 w-3 mr-1" /> Anexar
              </Button>
              <input ref={fileRef} type="file" accept="audio/*,image/*,.pdf,.doc,.docx" className="hidden" onChange={handleFileUpload} />
            </div>
            {lead.attachments.length > 0 ? (
              <div className="space-y-2">
                {lead.attachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2">
                    {att.type.startsWith("audio/") ? (
                      <audio src={att.dataUrl} controls className="h-8 w-full flex-1" />
                    ) : (
                      <a href={att.dataUrl} download={att.name} className="text-sm text-accent hover:underline truncate flex-1">{att.name}</a>
                    )}
                    <button onClick={() => { removeAttachment(lead.id, att.id); onRefresh(); }}
                      className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60 text-center py-3">Nenhum arquivo anexado</p>
            )}
          </div>
        </div>
      </SheetContent>

      <ScheduleMeetingDialog
        lead={lead}
        open={meetingOpen}
        onOpenChange={setMeetingOpen}
        onScheduled={() => { onRefresh(); onOpenChange(false); }}
      />
    </Sheet>
  );
}
