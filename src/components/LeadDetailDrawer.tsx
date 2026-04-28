import {
  type Lead, type ICPStars,
  addAttachment, removeAttachment, updateLead,
  addCallNote, removeCallNote, getMeetingsForLead,
} from "@/lib/store";
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
  Phone, MapPin, Instagram, ExternalLink, Star, Paperclip, X, FileAudio,
  CalendarCheck, Pencil, Check, MessageSquarePlus, Trash2, Video,
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Lead | null>(lead);
  const [newCallNote, setNewCallNote] = useState("");

  useEffect(() => {
    setDraft(lead);
    setEditing(false);
    setNewCallNote("");
  }, [lead?.id]);

  if (!lead || !draft) return null;

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

  const handleSave = () => {
    updateLead(lead.id, {
      company: draft.company.trim() || lead.company,
      contact: draft.contact,
      phone: draft.phone,
      niche: draft.niche,
      city: draft.city,
      gmnLink: draft.gmnLink,
      instagramLink: draft.instagramLink,
      icpStars: draft.icpStars,
      runsAds: draft.runsAds,
      notes: draft.notes,
    });
    setEditing(false);
    onRefresh();
    toast.success("Lead atualizado!");
  };

  const handleCancel = () => {
    setDraft(lead);
    setEditing(false);
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
          <div className="flex items-start justify-between gap-2">
            {editing ? (
              <Input
                value={draft.company}
                onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                className="text-base font-semibold"
              />
            ) : (
              <SheetTitle className="text-lg">{lead.company}</SheetTitle>
            )}
            {!editing ? (
              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3 mr-1" /> Editar
              </Button>
            ) : (
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleCancel}>
                  <X className="h-3 w-3" />
                </Button>
                <Button size="sm" className="h-7 text-xs bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleSave}>
                  <Check className="h-3 w-3 mr-1" /> Salvar
                </Button>
              </div>
            )}
          </div>
          <SheetDescription className="text-xs">
            Etapa: <span className="font-medium text-foreground">{lead.stage}</span> · ⏱{" "}
            {formatDistanceToNow(new Date(lead.stageChangedAt), { locale: ptBR, addSuffix: true })}
          </SheetDescription>
        </SheetHeader>

        <Button
          onClick={() => setMeetingOpen(true)}
          className="w-full bg-accent text-accent-foreground hover:bg-accent/90 mb-4"
          size="sm"
        >
          <CalendarCheck className="h-4 w-4 mr-1.5" /> Marcar Reunião
        </Button>

        <div className="space-y-5 pr-1">
          {/* ICP */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Prioridade ICP</Label>
            <div className="flex items-center gap-2">
              <StarRating
                value={editing ? draft.icpStars : lead.icpStars}
                onChange={editing ? (v) => setDraft({ ...draft, icpStars: v }) : undefined}
              />
              <span className="text-sm text-foreground">
                {(editing ? draft.icpStars : lead.icpStars) === 1 ? "Baixa" :
                 (editing ? draft.icpStars : lead.icpStars) === 2 ? "Média" : "Alta"}
              </span>
            </div>
          </div>

          {/* Anúncios */}
          <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
            <Label className="text-sm">Faz Anúncios?</Label>
            {editing ? (
              <Switch
                checked={draft.runsAds}
                onCheckedChange={(v) => setDraft({ ...draft, runsAds: v })}
              />
            ) : (
              <Badge className={lead.runsAds ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}>
                {lead.runsAds ? "Sim ✓" : "Não"}
              </Badge>
            )}
          </div>

          {/* Grid: Contato, Nicho, Cidade, Telefone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Contato</Label>
              {editing ? (
                <Input value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} />
              ) : (
                <p className="text-sm text-foreground mt-1">{lead.contact || "—"}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Nicho</Label>
              {editing ? (
                <Input value={draft.niche} onChange={(e) => setDraft({ ...draft, niche: e.target.value })} />
              ) : (
                lead.niche
                  ? <Badge variant="secondary" className="text-xs mt-1.5 block w-fit">{lead.niche}</Badge>
                  : <p className="text-sm text-muted-foreground mt-1">—</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Cidade</Label>
              {editing ? (
                <Input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
              ) : (
                <div className="flex items-center gap-1 text-sm text-foreground mt-1">
                  {lead.city ? <><MapPin className="h-3 w-3" /> {lead.city}</> : "—"}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Telefone</Label>
              {editing ? (
                <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              ) : lead.phone ? (
                <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline mt-1">
                  <Phone className="h-3 w-3" /> {lead.phone}
                </a>
              ) : <p className="text-sm text-muted-foreground mt-1">—</p>}
            </div>
          </div>

          {/* Links */}
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Google Meu Negócio
              </Label>
              {editing ? (
                <Input value={draft.gmnLink} onChange={(e) => setDraft({ ...draft, gmnLink: e.target.value })} placeholder="https://..." />
              ) : lead.gmnLink ? (
                <a href={lead.gmnLink} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-accent hover:underline truncate block mt-1">{lead.gmnLink}</a>
              ) : <p className="text-sm text-muted-foreground mt-1">—</p>}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Instagram className="h-3 w-3" /> Instagram
              </Label>
              {editing ? (
                <Input value={draft.instagramLink} onChange={(e) => setDraft({ ...draft, instagramLink: e.target.value })} placeholder="https://instagram.com/..." />
              ) : lead.instagramLink ? (
                <a href={lead.instagramLink} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-accent hover:underline truncate block mt-1">{lead.instagramLink}</a>
              ) : <p className="text-sm text-muted-foreground mt-1">—</p>}
            </div>
          </div>

          {/* Observações fixas */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Observações gerais</Label>
            {editing ? (
              <Textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                rows={3}
              />
            ) : (
              <p className="text-sm text-foreground bg-muted/50 rounded-md p-2 min-h-[2.5rem] whitespace-pre-wrap">
                {lead.notes || <span className="text-muted-foreground/60">Sem observações</span>}
              </p>
            )}
          </div>

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
