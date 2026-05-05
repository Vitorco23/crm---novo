import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  type Lead,
  type PipelineStage,
  type PipelineName,
  type ICPStars,
  getLeads,
  addLead,
  deleteLead,
  addAttachment,
  moveLeadToStage,
  getStagesForPipeline,
  addStage,
  removeStage,
  renameStage,
  reorderStages,
  dedupeLeads,
  isDuplicateLead,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Trash2, GripVertical, Phone, MapPin, Instagram, ExternalLink,
  Star, Upload, Paperclip, FileAudio, Pencil, Check, X as XIcon, Settings2, AlertCircle, Copy,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import LeadDetailDrawer from "@/components/LeadDetailDrawer";
import BulkActionsBar from "@/components/BulkActionsBar";
import ImportMappingDialog, { type LeadFieldKey } from "@/components/ImportMappingDialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter as FilterIcon, ChevronDown } from "lucide-react";

function timeInStage(stageChangedAt: string) {
  return formatDistanceToNow(new Date(stageChangedAt), { locale: ptBR, addSuffix: false });
}

function daysSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function StarRating({ value, onChange }: { value: ICPStars; onChange?: (v: ICPStars) => void }) {
  return (
    <div className="flex gap-0.5">
      {([1, 2, 3] as ICPStars[]).map((s) => (
        <button
          key={s}
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange?.(s); }}
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
  lead, onDragStart, onDelete, onRefresh, onClick, selected, onToggleSelect,
}: {
  lead: Lead;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  onClick: (lead: Lead) => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

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

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      onClick={() => onClick(lead)}
      className={`group rounded-md border p-3 shadow-sm cursor-pointer active:cursor-grabbing animate-slide-in hover:shadow-md transition-all ${
        selected ? "bg-accent/10 border-accent/50 ring-1 ring-accent/30" : "bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(lead.id)} className="h-3.5 w-3.5" />
          </div>
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
          <p className="font-semibold text-sm truncate text-card-foreground">{lead.company}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-accent">
            <Paperclip className="h-3.5 w-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(lead.id); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <input ref={fileRef} type="file" accept="audio/*,image/*,.pdf,.doc,.docx" className="hidden" onChange={handleFileUpload} />
      </div>

      {lead.contact && <p className="text-xs text-muted-foreground mt-1 truncate">{lead.contact}</p>}

      <div className="flex flex-wrap items-center gap-1 mt-1.5">
        {lead.niche && <Badge variant="secondary" className="text-[9px] px-1 py-0">{lead.niche}</Badge>}
        {lead.city && (
          <Badge variant="outline" className="text-[9px] px-1 py-0">
            <MapPin className="h-2 w-2 mr-0.5" />{lead.city}
          </Badge>
        )}
        <StarRating value={lead.icpStars} />
        {lead.runsAds && <Badge className="text-[9px] px-1 py-0 bg-accent text-accent-foreground">Ads ✓</Badge>}
      </div>

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

      {(lead.attachments.length > 0 || (lead.callNotes?.length ?? 0) > 0) && (
        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
          {lead.attachments.length > 0 && (
            <span className="flex items-center gap-0.5"><FileAudio className="h-2.5 w-2.5" /> {lead.attachments.length}</span>
          )}
          {(lead.callNotes?.length ?? 0) > 0 && (
            <span className="flex items-center gap-0.5">💬 {lead.callNotes!.length}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-2">
        <p className="text-[10px] text-muted-foreground/70">⏱ {timeInStage(lead.stageChangedAt)}</p>
        {daysSince(lead.stageChangedAt) >= 1 && (
          <span
            title="Sem movimentação há mais de 1 dia"
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium"
          >
            <AlertCircle className="h-2.5 w-2.5" /> Parado
          </span>
        )}
      </div>
    </div>
  );
}

function parseCSVText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 1) return { headers: [], rows: [] };
  const sep = lines[0].includes(";") ? ";" : ",";
  const splitLine = (line: string) => {
    // simple CSV split with quote support
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === sep && !inQuotes) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const vals = splitLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = vals[i] || ""));
    return obj;
  });
  return { headers, rows };
}

interface PipelineBoardProps {
  pipeline: PipelineName;
  title: string;
  subtitle?: string;
  showAddLead?: boolean;
  showImport?: boolean;
  extraActions?: React.ReactNode;
}

export default function PipelineBoard({ pipeline, title, subtitle, showAddLead = true, showImport = true, extraActions }: PipelineBoardProps) {
  const [stages, setStages] = useState<PipelineStage[]>(() => getStagesForPipeline(pipeline));
  const [leads, setLeads] = useState<Lead[]>(getLeads);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [newStageName, setNewStageName] = useState("");
  const [showAddStage, setShowAddStage] = useState(false);
  const [form, setForm] = useState({
    company: "", contact: "", phone: "", notes: "",
    niche: "", city: "", gmnLink: "", instagramLink: "",
    icpStars: 3 as ICPStars, runsAds: false,
  });
  const csvRef = useRef<HTMLInputElement>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [filterNiches, setFilterNiches] = useState<string[]>([]);
  const [filterCities, setFilterCities] = useState<string[]>([]);

  const refresh = useCallback(() => {
    setLeads(getLeads());
    setStages(getStagesForPipeline(pipeline));
  }, [pipeline]);

  const allPipelineLeads = leads.filter((l) => stages.includes(l.stage));
  // Niches available given selected cities
  const niches = Array.from(
    new Set(
      allPipelineLeads
        .filter((l) => filterCities.length === 0 || (l.city && filterCities.includes(l.city)))
        .map((l) => l.niche)
        .filter(Boolean)
    )
  ).sort();
  // Cities available given selected niches
  const cities = Array.from(
    new Set(
      allPipelineLeads
        .filter((l) => filterNiches.length === 0 || (l.niche && filterNiches.includes(l.niche)))
        .map((l) => l.city)
        .filter(Boolean)
    )
  ).sort();
  const pipelineLeads = allPipelineLeads.filter(
    (l) =>
      (filterNiches.length === 0 || (l.niche && filterNiches.includes(l.niche))) &&
      (filterCities.length === 0 || (l.city && filterCities.includes(l.city)))
  );

  const toggleFilterValue = (current: string[], value: string) =>
    current.includes(value) ? current.filter((v) => v !== value) : [...current, value];

  const startEditStage = (s: string) => { setEditingStage(s); setEditingValue(s); };
  const commitEditStage = () => {
    if (editingStage && editingValue.trim() && editingValue !== editingStage) {
      renameStage(pipeline, editingStage, editingValue.trim());
    }
    setEditingStage(null); setEditingValue("");
    refresh();
  };
  const handleAddStage = () => {
    if (newStageName.trim()) addStage(pipeline, newStageName.trim());
    setNewStageName(""); setShowAddStage(false);
    refresh();
  };
  const handleRemoveStage = (s: string) => {
    if (!confirm(`Remover etapa "${s}"? Os leads serão movidos para a primeira etapa.`)) return;
    removeStage(pipeline, s);
    refresh();
  };

  const handleAdd = () => {
    if (!form.company.trim()) return;
    addLead(form, stages[0]);
    setForm({ company: "", contact: "", phone: "", notes: "", niche: "", city: "", gmnLink: "", instagramLink: "", icpStars: 3, runsAds: false });
    setDialogOpen(false);
    refresh();
  };

  const handleDelete = (id: string) => {
    deleteLead(id);
    selectedIds.delete(id);
    setSelectedIds(new Set(selectedIds));
    refresh();
  };

  const handleCardClick = (lead: Lead) => { setSelectedLead(lead); setDrawerOpen(true); };

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkMove = (targetStage: PipelineStage) => {
    const count = selectedIds.size;
    selectedIds.forEach((id) => moveLeadToStage(id, targetStage));
    setSelectedIds(new Set());
    refresh();
    toast.success(`${count} leads movidos para "${targetStage}"`);
  };

  const handleBulkDelete = () => {
    const count = selectedIds.size;
    selectedIds.forEach((id) => deleteLead(id));
    setSelectedIds(new Set());
    refresh();
    toast.success(`${count} lead(s) excluído(s)`);
  };

  const handleSelectAllInStage = (stage: PipelineStage) => {
    const stageLeadIds = pipelineLeads.filter((l) => l.stage === stage).map((l) => l.id);
    const allSelected = stageLeadIds.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) stageLeadIds.forEach((id) => next.delete(id));
    else stageLeadIds.forEach((id) => next.add(id));
    setSelectedIds(next);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext || "")) {
      toast.error("Formato inválido. Use .csv ou .xlsx");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let headers: string[] = [];
        let rows: Record<string, string>[] = [];
        if (ext === "csv") {
          const parsed = parseCSVText(reader.result as string);
          headers = parsed.headers;
          rows = parsed.rows;
        } else {
          const data = new Uint8Array(reader.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
          if (aoa.length === 0) throw new Error("empty");
          headers = (aoa[0] as unknown[]).map((h) => String(h ?? "").trim()).filter(Boolean);
          rows = (aoa.slice(1) as unknown[][]).map((arr) => {
            const obj: Record<string, string> = {};
            headers.forEach((h, i) => { obj[h] = String(arr[i] ?? "").trim(); });
            return obj;
          });
        }
        if (headers.length === 0 || rows.length === 0) {
          toast.error("Arquivo vazio ou sem cabeçalho.");
          return;
        }
        setImportHeaders(headers);
        setImportRows(rows);
        setMappingOpen(true);
      } catch (err) {
        console.error(err);
        toast.error("Erro ao ler o arquivo. Verifique o formato.");
      }
    };
    reader.onerror = () => toast.error("Erro ao ler o arquivo.");
    if (ext === "csv") reader.readAsText(file); else reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleConfirmMapping = (mapping: Record<LeadFieldKey, string>) => {
    let count = 0;
    let skipped = 0;
    const existing = getLeads();
    const accepted: { phone: string; company: string; gmnLink: string }[] = existing.map((l) => ({
      phone: l.phone, company: l.company, gmnLink: l.gmnLink,
    }));
    importRows.forEach((row) => {
      const get = (k: LeadFieldKey) => {
        const col = mapping[k];
        if (!col || col === "__none__") return "";
        return (row[col] || "").trim();
      };
      const company = get("company");
      if (!company) return;
      const candidate = { company, phone: get("phone"), gmnLink: get("gmnLink") };
      if (isDuplicateLead(candidate, accepted)) {
        skipped++;
        return;
      }
      addLead(
        {
          company,
          contact: get("contact"),
          phone: candidate.phone,
          niche: get("niche"),
          city: get("city"),
          gmnLink: candidate.gmnLink,
          instagramLink: get("instagramLink"),
          notes: get("notes"),
          icpStars: 2 as ICPStars,
          runsAds: false,
        },
        stages[0]
      );
      accepted.push(candidate);
      count++;
    });
    setMappingOpen(false);
    setImportHeaders([]);
    setImportRows([]);
    refresh();
    if (skipped > 0) {
      toast.success(`${count} leads importados • ${skipped} duplicado(s) ignorado(s)`);
    } else {
      toast.success(`${count} leads importados!`);
    }
  };

  const handleDedupe = () => {
    const removed = dedupeLeads();
    refresh();
    if (removed === 0) toast.info("Nenhuma duplicata encontrada.");
    else toast.success(`${removed} duplicata(s) removida(s)`);
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.setData("application/x-lead", id);
  };

  const onStageDragStart = (e: React.DragEvent, stage: PipelineStage) => {
    e.dataTransfer.setData("application/x-stage", stage);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = (e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault();
    const draggedStage = e.dataTransfer.getData("application/x-stage");
    if (draggedStage) {
      if (draggedStage === stage) return;
      const current = [...stages];
      const from = current.indexOf(draggedStage);
      const to = current.indexOf(stage);
      if (from === -1 || to === -1) return;
      current.splice(from, 1);
      current.splice(to, 0, draggedStage);
      reorderStages(pipeline, current);
      refresh();
      return;
    }
    const id = e.dataTransfer.getData("text/plain");
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    const result = moveLeadToStage(id, stage);
    refresh();
    if (result.autoTransfer) {
      const labels: Record<string, string> = { cold_call: "Cold Call", oportunidades: "Oportunidades", onboarding: "Onboarding" };
      toast.success(`Lead transferido automaticamente para ${labels[result.autoTransfer] ?? result.autoTransfer}!`);
    }
  };

  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  const stageColors: Record<string, string> = {
    "Novo Lead": "bg-accent/20 border-accent/40",
    "Ganho": "bg-success/10 border-success/30",
    "Perdido": "bg-destructive/10 border-destructive/30",
    "Onboarding": "bg-accent/15 border-accent/30",
    "Escala": "bg-success/10 border-success/30",
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle || `${pipelineLeads.length} leads`}</p>
        </div>
        <div className="flex items-center gap-2">
          {extraActions}
          {showImport && (
            <>
              <input ref={csvRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileImport} />
              <Button size="sm" variant="outline" onClick={() => csvRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" /> Importar
              </Button>
              <Button size="sm" variant="outline" onClick={handleDedupe} title="Remove leads com telefone, nome ou link GMN duplicados">
                <Copy className="h-4 w-4 mr-1" /> Remover duplicatas
              </Button>
            </>
          )}
          {showAddLead && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <Plus className="h-4 w-4 mr-1" /> Novo Lead
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Adicionar Lead</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Empresa *</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
                    <div><Label>Contato</Label><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Nicho</Label><Input value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="Ex: Odontologia" /></div>
                    <div><Label>Cidade</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Ex: São Paulo" /></div>
                  </div>
                  <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+55 11 99999-9999" /></div>
                  <div><Label>Link Google Meu Negócio</Label><Input value={form.gmnLink} onChange={(e) => setForm({ ...form, gmnLink: e.target.value })} /></div>
                  <div><Label>Link Instagram</Label><Input value={form.instagramLink} onChange={(e) => setForm({ ...form, instagramLink: e.target.value })} /></div>
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
                  <div><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                  <Button onClick={handleAdd} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Adicionar</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {(niches.length > 0 || cities.length > 0) && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <FilterIcon className="h-3.5 w-3.5" /> Filtros:
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs justify-between min-w-[180px]">
                <span className="truncate">
                  {filterNiches.length === 0
                    ? "Todos os nichos"
                    : filterNiches.length === 1
                    ? filterNiches[0]
                    : `${filterNiches.length} nichos`}
                </span>
                <ChevronDown className="h-3 w-3 ml-2 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-2" align="start">
              <div className="max-h-[260px] overflow-y-auto space-y-1">
                {niches.length === 0 && <div className="text-xs text-muted-foreground px-1 py-1">Sem opções</div>}
                {niches.map((n) => (
                  <label key={n} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-accent cursor-pointer text-xs">
                    <Checkbox
                      checked={filterNiches.includes(n)}
                      onCheckedChange={() => setFilterNiches((prev) => toggleFilterValue(prev, n))}
                    />
                    <span className="truncate">{n}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs justify-between min-w-[180px]">
                <span className="truncate">
                  {filterCities.length === 0
                    ? "Todas as cidades"
                    : filterCities.length === 1
                    ? filterCities[0]
                    : `${filterCities.length} cidades`}
                </span>
                <ChevronDown className="h-3 w-3 ml-2 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-2" align="start">
              <div className="max-h-[260px] overflow-y-auto space-y-1">
                {cities.length === 0 && <div className="text-xs text-muted-foreground px-1 py-1">Sem opções</div>}
                {cities.map((c) => (
                  <label key={c} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-accent cursor-pointer text-xs">
                    <Checkbox
                      checked={filterCities.includes(c)}
                      onCheckedChange={() => setFilterCities((prev) => toggleFilterValue(prev, c))}
                    />
                    <span className="truncate">{c}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {(filterNiches.length > 0 || filterCities.length > 0) && (
            <>
              <Button size="sm" variant="ghost" className="h-8 text-xs"
                onClick={() => { setFilterNiches([]); setFilterCities([]); }}>
                <XIcon className="h-3 w-3 mr-1" /> Limpar
              </Button>
              <Badge variant="outline" className="text-[10px]">
                {pipelineLeads.length} de {allPipelineLeads.length} leads
              </Badge>
            </>
          )}
        </div>
      )}

      <BulkActionsBar
        count={selectedIds.size}
        stages={[...stages] as PipelineStage[]}
        onMoveToStage={handleBulkMove}
        onDelete={handleBulkDelete}
        onClear={() => setSelectedIds(new Set())}
      />

      <div className="flex-1 overflow-x-auto scrollbar-thin">
        <div className="flex gap-3 h-full min-w-max pb-2">
          {stages.map((stage) => {
            const stageLeads = pipelineLeads.filter((l) => l.stage === stage);
            return (
              <div
                key={stage}
                onDrop={(e) => onDrop(e, stage)}
                onDragOver={onDragOver}
                className={`w-56 shrink-0 flex flex-col rounded-lg border p-2 ${stageColors[stage] || "bg-muted/30 border-border"}`}
              >
                <div className="flex items-center justify-between mb-2 px-1 gap-1">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={stageLeads.length > 0 && stageLeads.every((l) => selectedIds.has(l.id))}
                        onCheckedChange={() => handleSelectAllInStage(stage)}
                        className="h-3.5 w-3.5"
                      />
                    </div>
                    {editingStage === stage ? (
                      <div className="flex items-center gap-0.5 flex-1 min-w-0">
                        <Input
                          autoFocus
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") commitEditStage(); if (e.key === "Escape") { setEditingStage(null); setEditingValue(""); } }}
                          className="h-6 text-xs px-1.5 py-0"
                        />
                        <button onClick={commitEditStage} className="text-accent hover:text-accent/70 shrink-0"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => { setEditingStage(null); setEditingValue(""); }} className="text-muted-foreground hover:text-destructive shrink-0"><XIcon className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <h3
                        draggable
                        onDragStart={(e) => onStageDragStart(e, stage)}
                        onDoubleClick={() => startEditStage(stage)}
                        title="Arraste para reordenar • Duplo clique para renomear"
                        className="text-xs font-semibold text-foreground uppercase tracking-wide truncate cursor-grab active:cursor-grabbing select-none"
                      >
                        {stage}
                      </h3>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {editingStage !== stage && (
                      <>
                        <button onClick={() => startEditStage(stage)} className="text-muted-foreground/60 hover:text-accent" title="Renomear">
                          <Pencil className="h-3 w-3" />
                        </button>
                        {stages.length > 1 && (
                          <button onClick={() => handleRemoveStage(stage)} className="text-muted-foreground/60 hover:text-destructive" title="Remover etapa">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </>
                    )}
                    <span className="text-[10px] font-medium bg-background/80 text-muted-foreground rounded-full px-1.5 py-0.5">
                      {stageLeads.length}
                    </span>
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin min-h-[100px]">
                  {stageLeads.map((lead) => (
                    <LeadCard
                      key={lead.id} lead={lead} onDragStart={onDragStart} onDelete={handleDelete}
                      onRefresh={refresh} onClick={handleCardClick} selected={selectedIds.has(lead.id)}
                      onToggleSelect={handleToggleSelect}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Add stage column */}
          <div className="w-56 shrink-0 flex flex-col rounded-lg border-2 border-dashed border-border/50 p-2 bg-muted/10">
            {showAddStage ? (
              <div className="flex items-center gap-1">
                <Input
                  autoFocus
                  placeholder="Nome da etapa"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddStage(); if (e.key === "Escape") { setShowAddStage(false); setNewStageName(""); } }}
                  className="h-7 text-xs"
                />
                <button onClick={handleAddStage} className="text-accent shrink-0"><Check className="h-4 w-4" /></button>
                <button onClick={() => { setShowAddStage(false); setNewStageName(""); }} className="text-muted-foreground shrink-0"><XIcon className="h-4 w-4" /></button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddStage(true)}
                className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-accent py-2 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Nova etapa
              </button>
            )}
          </div>
        </div>
      </div>

      <LeadDetailDrawer
        lead={selectedLead} open={drawerOpen} onOpenChange={setDrawerOpen}
        onRefresh={() => {
          refresh();
          if (selectedLead) {
            const updated = getLeads().find((l) => l.id === selectedLead.id);
            if (updated) setSelectedLead(updated);
          }
        }}
      />

      <ImportMappingDialog
        open={mappingOpen}
        onOpenChange={setMappingOpen}
        headers={importHeaders}
        rows={importRows}
        onConfirm={handleConfirmMapping}
      />
    </div>
  );
}
