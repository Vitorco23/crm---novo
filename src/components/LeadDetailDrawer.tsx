import { type Lead, type ICPStars, addAttachment, removeAttachment, updateLead } from "@/lib/store";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Phone, MapPin, Instagram, ExternalLink, Star, Paperclip, X, FileAudio, DollarSign,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRef, useState } from "react";
import { toast } from "sonner";

function StarRating({ value }: { value: ICPStars }) {
  return (
    <div className="flex gap-1">
      {([1, 2, 3] as ICPStars[]).map((s) => (
        <Star key={s} className={`h-4 w-4 ${s <= value ? "fill-accent text-accent" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

export default function LeadDetailDrawer({
  lead, open, onOpenChange, onRefresh, showFinancialFields = false,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
  showFinancialFields?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingFinancials, setEditingFinancials] = useState(false);
  const [financials, setFinancials] = useState({ setupValue: 0, monthlyFee: 0, adBudget: 0, contractStart: "", contractRenewal: "" });

  if (!lead) return null;

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

  const handleSaveFinancials = () => {
    updateLead(lead.id, financials);
    onRefresh();
    setEditingFinancials(false);
    toast.success("Dados financeiros salvos!");
  };

  const openFinancialEdit = () => {
    setFinancials({
      setupValue: lead.setupValue || 0,
      monthlyFee: lead.monthlyFee || 0,
      adBudget: lead.adBudget || 0,
      contractStart: lead.contractStart || "",
      contractRenewal: lead.contractRenewal || "",
    });
    setEditingFinancials(true);
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
          <div>
            <p className="text-xs text-muted-foreground mb-1">Prioridade ICP</p>
            <div className="flex items-center gap-2">
              <StarRating value={lead.icpStars} />
              <span className="text-sm text-foreground">
                {lead.icpStars === 1 ? "Baixa" : lead.icpStars === 2 ? "Média" : "Alta"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {lead.contact && <div><p className="text-xs text-muted-foreground">Contato</p><p className="text-sm text-foreground">{lead.contact}</p></div>}
            {lead.niche && <div><p className="text-xs text-muted-foreground">Nicho</p><Badge variant="secondary" className="text-xs mt-0.5">{lead.niche}</Badge></div>}
            {lead.city && (
              <div><p className="text-xs text-muted-foreground">Cidade</p>
                <div className="flex items-center gap-1 text-sm text-foreground"><MapPin className="h-3 w-3" /> {lead.city}</div>
              </div>
            )}
            <div><p className="text-xs text-muted-foreground">Anúncios</p>
              <Badge className={`text-xs mt-0.5 ${lead.runsAds ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                {lead.runsAds ? "Sim ✓" : "Não"}
              </Badge>
            </div>
          </div>

          {lead.phone && (
            <div><p className="text-xs text-muted-foreground mb-1">Telefone</p>
              <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
                <Phone className="h-3.5 w-3.5" /> {lead.phone}
              </a>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {lead.gmnLink && (
              <a href={lead.gmnLink} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
                <ExternalLink className="h-3.5 w-3.5" /> Google Meu Negócio
              </a>
            )}
            {lead.instagramLink && (
              <a href={lead.instagramLink} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
                <Instagram className="h-3.5 w-3.5" /> Instagram
              </a>
            )}
          </div>

          {lead.notes && (
            <div><p className="text-xs text-muted-foreground mb-1">Observações</p>
              <p className="text-sm text-foreground bg-muted/50 rounded-md p-2">{lead.notes}</p>
            </div>
          )}

          {/* Financial fields for Operação */}
          {showFinancialFields && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Dados Financeiros</p>
                {!editingFinancials && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openFinancialEdit}>Editar</Button>}
              </div>
              {editingFinancials ? (
                <div className="space-y-2">
                  <div><Label className="text-xs">Valor do Setup (R$)</Label><Input type="number" value={financials.setupValue} onChange={(e) => setFinancials({ ...financials, setupValue: +e.target.value })} /></div>
                  <div><Label className="text-xs">Mensalidade / Fee (R$)</Label><Input type="number" value={financials.monthlyFee} onChange={(e) => setFinancials({ ...financials, monthlyFee: +e.target.value })} /></div>
                  <div><Label className="text-xs">Verba Gerenciada (R$)</Label><Input type="number" value={financials.adBudget} onChange={(e) => setFinancials({ ...financials, adBudget: +e.target.value })} /></div>
                  <div><Label className="text-xs">Data Início</Label><Input type="date" value={financials.contractStart} onChange={(e) => setFinancials({ ...financials, contractStart: e.target.value })} /></div>
                  <div><Label className="text-xs">Data Renovação</Label><Input type="date" value={financials.contractRenewal} onChange={(e) => setFinancials({ ...financials, contractRenewal: e.target.value })} /></div>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 text-xs" onClick={handleSaveFinancials}>Salvar</Button>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => setEditingFinancials(false)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-xs text-muted-foreground">Setup</p><p className="text-foreground">R$ {(lead.setupValue || 0).toLocaleString("pt-BR")}</p></div>
                  <div><p className="text-xs text-muted-foreground">Fee Mensal</p><p className="text-foreground">R$ {(lead.monthlyFee || 0).toLocaleString("pt-BR")}</p></div>
                  <div><p className="text-xs text-muted-foreground">Verba Ads</p><p className="text-foreground">R$ {(lead.adBudget || 0).toLocaleString("pt-BR")}</p></div>
                  <div><p className="text-xs text-muted-foreground">Início</p><p className="text-foreground">{lead.contractStart || "—"}</p></div>
                </div>
              )}
            </div>
          )}

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><FileAudio className="h-3 w-3" /> Arquivos ({lead.attachments.length})</p>
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
    </Sheet>
  );
}
