import { type Lead, type ICPStars, addAttachment, removeAttachment } from "@/lib/store";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Phone, MapPin, Instagram, ExternalLink, Star, Paperclip, X, FileAudio,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRef } from "react";
import { toast } from "sonner";

function StarRating({ value }: { value: ICPStars }) {
  return (
    <div className="flex gap-1">
      {([1, 2, 3] as ICPStars[]).map((s) => (
        <Star
          key={s}
          className={`h-4 w-4 ${s <= value ? "fill-accent text-accent" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

export default function LeadDetailDrawer({
  lead,
  open,
  onOpenChange,
  onRefresh,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  if (!lead) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 10MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      addAttachment(lead.id, {
        name: file.name,
        type: file.type,
        dataUrl: reader.result as string,
      });
      onRefresh();
      toast.success("Arquivo anexado!");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg">{lead.company}</SheetTitle>
          <SheetDescription className="text-xs">
            Etapa: <span className="font-medium text-foreground">{lead.stage}</span> · ⏱{" "}
            {formatDistanceToNow(new Date(lead.stageChangedAt), { locale: ptBR, addSuffix: true })}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 pr-1">
          {/* ICP Stars */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Prioridade ICP</p>
            <div className="flex items-center gap-2">
              <StarRating value={lead.icpStars} />
              <span className="text-sm text-foreground">
                {lead.icpStars === 1 ? "Baixa" : lead.icpStars === 2 ? "Média" : "Alta"}
              </span>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            {lead.contact && (
              <div>
                <p className="text-xs text-muted-foreground">Contato</p>
                <p className="text-sm text-foreground">{lead.contact}</p>
              </div>
            )}
            {lead.niche && (
              <div>
                <p className="text-xs text-muted-foreground">Nicho</p>
                <Badge variant="secondary" className="text-xs mt-0.5">{lead.niche}</Badge>
              </div>
            )}
            {lead.city && (
              <div>
                <p className="text-xs text-muted-foreground">Cidade</p>
                <div className="flex items-center gap-1 text-sm text-foreground">
                  <MapPin className="h-3 w-3" /> {lead.city}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Anúncios</p>
              <Badge className={`text-xs mt-0.5 ${lead.runsAds ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                {lead.runsAds ? "Sim ✓" : "Não"}
              </Badge>
            </div>
          </div>

          {/* Phone */}
          {lead.phone && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Telefone</p>
              <a
                href={`tel:${lead.phone}`}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
              >
                <Phone className="h-3.5 w-3.5" /> {lead.phone}
              </a>
            </div>
          )}

          {/* Links */}
          <div className="flex flex-wrap gap-2">
            {lead.gmnLink && (
              <a
                href={lead.gmnLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Google Meu Negócio
              </a>
            )}
            {lead.instagramLink && (
              <a
                href={lead.instagramLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
              >
                <Instagram className="h-3.5 w-3.5" /> Instagram
              </a>
            )}
          </div>

          {/* Notes */}
          {lead.notes && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Observações</p>
              <p className="text-sm text-foreground bg-muted/50 rounded-md p-2">{lead.notes}</p>
            </div>
          )}

          {/* Attachments */}
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
                      <a href={att.dataUrl} download={att.name} className="text-sm text-accent hover:underline truncate flex-1">
                        {att.name}
                      </a>
                    )}
                    <button
                      onClick={() => { removeAttachment(lead.id, att.id); onRefresh(); }}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
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
    </Sheet>
  );
}
