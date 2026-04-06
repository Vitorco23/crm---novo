import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  PIPELINE_STAGES,
  type Lead,
  type PipelineStage,
  type ICPStars,
  getLeads,
  saveLeads,
  addLead,
  deleteLead,
  trackMovement,
  addAttachment,
  removeAttachment,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Trash2, GripVertical, Phone, MapPin, Instagram, ExternalLink,
  Star, Upload, Paperclip, Play, X, FileAudio,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

function timeInStage(stageChangedAt: string) {
  return formatDistanceToNow(new Date(stageChangedAt), { locale: ptBR, addSuffix: false });
}

function StarRating({ value, onChange }: { value: ICPStars; onChange?: (v: ICPStars) => void }) {
  return (
    <div className="flex gap-0.5">
      {([1, 2, 3] as ICPStars[]).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange?.(s)}
          className={`transition-colors ${onChange ? "cursor-pointer" : "cursor-default"}`}
        >
          <Star
            className={`h-3.5 w-3.5 ${s <= value ? "fill-accent text-accent" : "text-muted-foreground/30"}`}
          />
        </button>
      ))}
    </div>
  );
}

function LeadCard({
  lead,
  onDragStart,
  onDelete,
  onRefresh,
}: {
  lead: Lead;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showAttachments, setShowAttachments] = useState(false);

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
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      className="group rounded-md border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing animate-slide-in hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
          <p className="font-semibold text-sm truncate text-card-foreground">{lead.company}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fileRef.current?.click()}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-accent"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(lead.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <input ref={fileRef} type="file" accept="audio/*,image/*,.pdf,.doc,.docx" className="hidden" onChange={handleFileUpload} />
      </div>

      {lead.contact && <p className="text-xs text-muted-foreground mt-1 truncate">{lead.contact}</p>}

      <div className="flex flex-wrap items-center gap-1 mt-1.5">
        {lead.niche && (
          <Badge variant="secondary" className="text-[9px] px-1 py-0">{lead.niche}</Badge>
        )}
        {lead.city && (
          <Badge variant="outline" className="text-[9px] px-1 py-0">
            <MapPin className="h-2 w-2 mr-0.5" />{lead.city}
          </Badge>
        )}
        <StarRating value={lead.icpStars} />
        {lead.runsAds && (
          <Badge className="text-[9px] px-1 py-0 bg-accent text-accent-foreground">Ads ✓</Badge>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1 mt-2">
        {lead.phone && (
          <a href={`tel:${lead.phone}`} onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
            <Phone className="h-2.5 w-2.5" /> Ligar
          </a>
        )}
        {lead.gmnLink && (
          <a href={lead.gmnLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
            <ExternalLink className="h-2.5 w-2.5" /> GMN
          </a>
        )}
        {lead.instagramLink && (
          <a href={lead.instagramLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
            <Instagram className="h-2.5 w-2.5" /> Insta
          </a>
        )}
      </div>

      {/* Attachments */}
      {lead.attachments.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowAttachments(!showAttachments)}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            <FileAudio className="h-2.5 w-2.5" /> {lead.attachments.length} arquivo(s)
          </button>
          {showAttachments && (
            <div className="mt-1 space-y-1">
              {lead.attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-1 text-[10px] bg-muted/50 rounded px-1.5 py-1">
                  {att.type.startsWith("audio/") ? (
                    <audio src={att.dataUrl} controls className="h-6 w-full max-w-[140px]" />
                  ) : (
                    <a href={att.dataUrl} download={att.name} className="text-accent hover:underline truncate flex-1">
                      {att.name}
                    </a>
                  )}
                  <button
                    onClick={() => { removeAttachment(lead.id, att.id); onRefresh(); }}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/70 mt-2">⏱ {timeInStage(lead.stageChangedAt)}</p>
    </div>
  );
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = vals[i] || ""));
    return obj;
  });
}

function mapCSVRow(row: Record<string, string>) {
  const find = (...keys: string[]) => {
    for (const k of keys) {
      const match = Object.keys(row).find((rk) => rk.includes(k));
      if (match && row[match]) return row[match];
    }
    return "";
  };
  return {
    company: find("empresa", "company", "nome"),
    contact: find("contato", "contact"),
    phone: find("telefone", "phone", "tel"),
    niche: find("nicho", "niche"),
    city: find("cidade", "city"),
    gmnLink: find("gmn", "google"),
    instagramLink: find("instagram", "insta"),
    icpStars: 2 as ICPStars,
    runsAds: ["sim", "yes", "true", "1"].includes(find("anuncio", "anúncio", "ads", "ad").toLowerCase()),
    notes: find("observ", "notes", "nota"),
  };
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>(getLeads);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    company: "", contact: "", phone: "", notes: "",
    niche: "", city: "", gmnLink: "", instagramLink: "",
    icpStars: 3 as ICPStars, runsAds: false,
  });
  const csvRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => setLeads(getLeads()), []);

  const handleAdd = () => {
    if (!form.company.trim()) return;
    addLead(form);
    setForm({
      company: "", contact: "", phone: "", notes: "",
      niche: "", city: "", gmnLink: "", instagramLink: "",
      icpStars: 3, runsAds: false,
    });
    setDialogOpen(false);
    refresh();
  };

  const handleDelete = (id: string) => {
    deleteLead(id);
    refresh();
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext || "")) {
      toast.error("Formato inválido. Use arquivos .csv ou .xlsx");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        let rows: Record<string, string>[];
        if (ext === "csv") {
          rows = parseCSV(reader.result as string);
        } else {
          const data = new Uint8Array(reader.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
          rows = json.map((row) => {
            const normalized: Record<string, string> = {};
            Object.entries(row).forEach(([k, v]) => {
              normalized[k.trim().toLowerCase()] = String(v).trim();
            });
            return normalized;
          });
        }
        let count = 0;
        rows.forEach((row) => {
          const mapped = mapCSVRow(row);
          if (mapped.company) { addLead(mapped); count++; }
        });
        refresh();
        toast.success(`${count} leads importados com sucesso!`);
      } catch {
        toast.error("Erro ao ler o arquivo. Verifique o formato.");
      }
    };
    if (ext === "csv") reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };

  const onDrop = (e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    trackMovement(id, stage);
    const updated = leads.map((l) =>
      l.id === id ? { ...l, stage, stageChangedAt: new Date().toISOString() } : l
    );
    saveLeads(updated);
    refresh();
  };

  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  const stageColors: Record<string, string> = {
    "Novo Lead": "bg-accent/20 border-accent/40",
    "Ganho": "bg-success/10 border-success/30",
    "Perdido": "bg-destructive/10 border-destructive/30",
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Pipeline de Leads</h1>
          <p className="text-sm text-muted-foreground">{leads.length} leads no total</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={csvRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileImport} />
          <Button size="sm" variant="outline" onClick={() => csvRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> Importar
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Plus className="h-4 w-4 mr-1" /> Novo Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Adicionar Lead</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Empresa *</Label>
                    <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                  </div>
                  <div>
                    <Label>Contato</Label>
                    <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nicho</Label>
                    <Input value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="Ex: Odontologia" />
                  </div>
                  <div>
                    <Label>Cidade</Label>
                    <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Ex: São Paulo" />
                  </div>
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+55 11 99999-9999" />
                </div>
                <div>
                  <Label>Link Google Meu Negócio</Label>
                  <Input value={form.gmnLink} onChange={(e) => setForm({ ...form, gmnLink: e.target.value })} placeholder="https://g.co/..." />
                </div>
                <div>
                  <Label>Link Instagram</Label>
                  <Input value={form.instagramLink} onChange={(e) => setForm({ ...form, instagramLink: e.target.value })} placeholder="https://instagram.com/..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Prioridade ICP</Label>
                    <div className="flex items-center gap-1 mt-1.5">
                      <StarRating value={form.icpStars} onChange={(v) => setForm({ ...form, icpStars: v })} />
                      <span className="text-xs text-muted-foreground ml-1">
                        {form.icpStars === 1 ? "Baixa" : form.icpStars === 2 ? "Média" : "Alta"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch checked={form.runsAds} onCheckedChange={(v) => setForm({ ...form, runsAds: v })} />
                    <Label className="text-sm">Faz Anúncios?</Label>
                  </div>
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <Button onClick={handleAdd} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  Adicionar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto scrollbar-thin">
        <div className="flex gap-3 h-full min-w-max pb-2">
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = leads.filter((l) => l.stage === stage);
            return (
              <div
                key={stage}
                onDrop={(e) => onDrop(e, stage)}
                onDragOver={onDragOver}
                className={`w-56 shrink-0 flex flex-col rounded-lg border p-2 ${stageColors[stage] || "bg-muted/30 border-border"}`}
              >
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide truncate">
                    {stage}
                  </h3>
                  <span className="text-[10px] font-medium bg-background/80 text-muted-foreground rounded-full px-1.5 py-0.5">
                    {stageLeads.length}
                  </span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin min-h-[100px]">
                  {stageLeads.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} onDragStart={onDragStart} onDelete={handleDelete} onRefresh={refresh} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
