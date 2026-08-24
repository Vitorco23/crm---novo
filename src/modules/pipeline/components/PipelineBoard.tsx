import { memo, useState, useCallback, useRef, useMemo, useEffect, useDeferredValue } from "react";
import { getAvailableOptions, getCorrelatedOptions } from "@/modules/pipeline/services/correlatedFilters";
import { uload, usave } from "@/shared/services/userStorage";
import * as XLSX from "xlsx";
import {
  type Lead,
  type PipelineStage,
  type PipelineName,
  type ICPStars,
  getLeads,
  addLead,
  addLeadsBatch,
  deleteLead,
  deleteLeadsBatch,
  addAttachment,
  moveLeadToStage,
  moveLeadsToStageBatch,
  getStagesForPipeline,
  addStage,
  removeStage,
  renameStage,
  reorderStages,
  dedupeLeads,
  getMeetingsForLead,
  getPipelineForStage,
} from "@/shared/services/store";
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
  Star, Upload, Paperclip, FileAudio, Pencil, Check, X as XIcon, Settings2, AlertCircle, Copy, Search, LayoutGrid, List as ListIcon, Download, ArrowRight,
  MoreVertical, Sparkles, MessageSquare, PhoneCall
} from "lucide-react";
import { computeLeadTemperature, lastInteractionLabel, nextActionLabel } from "@/modules/cold-call/services/coldCallMetrics";
import { getStepForLead, executionMoment } from "@/modules/leads/services/cadence";
import { LeadIntelligenceRepository } from "@/modules/leads/services/LeadIntelligenceRepository";
import { Sparkles as SparklesIcon } from "lucide-react";
import { leadMatchesQuery } from "@/modules/pipeline/services/leadSearch";

import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import LeadDetailDrawer from "@/modules/leads/components/LeadDetailDrawer";
import { consumePendingOpenLead, OPEN_LEAD_EVENT, PENDING_OPEN_LEAD_KEY, type LeadTabHint, type LeadActionHint, type PendingOpenLead } from "@/modules/leads/services/openLead";
import ScheduleMeetingDialog from "@/modules/leads/components/ScheduleMeetingDialog";
import PipelineListView from "@/modules/pipeline/components/PipelineListView";
import BulkActionsBar from "@/modules/pipeline/components/BulkActionsBar";
import BulkEditDialog from "@/modules/pipeline/components/BulkEditDialog";
import ExportLeadsDialog from "@/modules/pipeline/components/ExportLeadsDialog";
import ImportMappingDialog, { type LeadFieldKey } from "@/modules/pipeline/components/ImportMappingDialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter as FilterIcon, ChevronDown } from "lucide-react";
import LostReasonDialog from "./LostReasonDialog";
import { addInteraction } from "@/shared/services/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";



export const LOST_REASON_EVENT = "p21:trigger-lost-reason";

function timeInStage(stageChangedAt: string) {
  return formatDistanceToNow(new Date(stageChangedAt), { locale: ptBR, addSuffix: false });
}

function daysSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function mapsUrlFor(lead: Lead) {
  if (lead.gmnLink) return lead.gmnLink;
  const q = encodeURIComponent(`${lead.company} ${lead.city || ""}`.trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function StarRating({ value, onChange }: { value: ICPStars; onChange?: (v: ICPStars) => void }) {
  return (
    <div className="flex gap-0.5">
      {([1, 2, 3, 4, 5] as ICPStars[]).map((s) => (
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

const LeadCard = memo(function LeadCard({
  lead, pipeline, onDragStart, onDelete, onRefresh, onClick, selected, onToggleSelect,
}: {
  lead: Lead;
  pipeline: PipelineName;
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

  const temp = LeadIntelligenceRepository.temperature(lead);
  const summary = LeadIntelligenceRepository.executiveSummary(lead);

  return (
    <TooltipProvider>
      <div
        draggable
        onDragStart={(e) => onDragStart(e, lead.id)}
        onClick={() => onClick(lead)}
        className="group rounded-lg border border-border/60 p-2.5 bg-card shadow-sm cursor-pointer hover:border-accent/50 hover:shadow transition-all space-y-2 relative [content-visibility:auto] [contain-intrinsic-size:120px]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(lead.id)} onClick={(e) => e.stopPropagation()} className="h-3.5 w-3.5" />
            <div className="min-w-0">
              <p className="font-bold text-xs truncate text-foreground">{lead.company}</p>
              {lead.contact && <p className="text-[10px] text-muted-foreground truncate">{lead.contact} {lead.phone && <span className="text-[9px] opacity-60">· {lead.phone}</span>}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} className="text-muted-foreground hover:text-accent p-0.5">
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent><p className="text-[10px]">Anexar arquivo</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={(e) => { e.stopPropagation(); onDelete(lead.id); }} className="text-muted-foreground hover:text-destructive p-0.5">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent><p className="text-[10px]">Excluir lead</p></TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 min-w-0">
            {lead.niche && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 font-normal max-w-[60px] truncate block">{lead.niche}</Badge>
                </TooltipTrigger>
                <TooltipContent><p className="text-[10px]">{lead.niche}</p></TooltipContent>
              </Tooltip>
            )}
            <StarRating value={lead.icpStars} />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {lead.tags && lead.tags.length > 0 && lead.tags.slice(0, 2).map((t) => (
              <Badge key={t} variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-accent/30 text-accent/80 bg-accent/5 uppercase leading-none">
                {t}
              </Badge>
            ))}

            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`text-xs ${temp.cls}`}>{temp.emoji}</span>
              </TooltipTrigger>
              <TooltipContent><p className="text-[10px]">Temperatura: {temp.label}</p></TooltipContent>
            </Tooltip>
            {lead.autoDiagnosis && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Sparkles className="h-3 w-3 text-accent" />
                </TooltipTrigger>
                <TooltipContent><p className="text-[10px]">Análise IA disponível</p></TooltipContent>
              </Tooltip>
            )}
          </div>
          <input ref={fileRef} type="file" accept="audio/*,image/*,.pdf,.doc,.docx" className="hidden" onChange={handleFileUpload} />
        </div>

        <div className="pt-2 border-t border-border/40 space-y-1.5">
          <p className="text-[10px] text-foreground font-medium truncate flex items-center gap-1.5">
            <span className="text-accent shrink-0">→</span>
            <span className="truncate">{LeadIntelligenceRepository.nextAction(lead)}</span>
          </p>
          {summary.ultimaLigacao && (
            <p className="text-[10px] text-muted-foreground truncate italic leading-relaxed">
              "{summary.ultimaLigacao}"
            </p>
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] pt-1">
          <div className="flex items-center gap-2 text-muted-foreground/60">
            <span>⏱ {timeInStage(lead.stageChangedAt)}</span>
          </div>
          <div className="flex items-center gap-2">
             {pipeline === "oportunidades" && lead.contractValue && lead.contractValue > 0 && (
              <span className="font-bold text-accent">
                {lead.contractValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            )}
            <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
               <button onClick={(e) => { e.stopPropagation(); window.open(`tel:${lead.phone}`, '_self'); }} className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground">
                  <PhoneCall className="h-3 w-3" />
               </button>
               <button onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${lead.phoneNormalized || lead.phone?.replace(/\D/g, '')}`, '_blank'); }} className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground">
                  <MessageSquare className="h-3 w-3" />
               </button>
               <button onClick={(e) => { e.stopPropagation(); window.open(mapsUrlFor(lead), '_blank'); }} className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground" title="Abrir Google Meu Negócio">
                  <MapPin className="h-3 w-3" />
               </button>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );


});

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
  const rows = lines.slice(1)
    .map((line) => {
      const vals = splitLine(line);
      if (vals.every(v => !v)) return null;
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h] = vals[i] || ""));
      return obj;
    })
    .filter((row): row is Record<string, string> => row !== null);
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
  const [drawerTab, setDrawerTab] = useState<LeadTabHint | undefined>(undefined);
  const [drawerAction, setDrawerAction] = useState<LeadActionHint | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [alignmentLead, setAlignmentLead] = useState<Lead | null>(null);
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [newStageName, setNewStageName] = useState("");
  const [showAddStage, setShowAddStage] = useState(false);
  const [lostReasonLead, setLostReasonLead] = useState<{ id: string; stage: string } | null>(null);
  const [form, setForm] = useState({
    company: "", contact: "", phone: "", notes: "",
    niche: "", city: "", gmnLink: "", instagramLink: "",
    icpStars: 3 as ICPStars, runsAds: false,
  });
  const csvRef = useRef<HTMLInputElement>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [sortBy, setSortBy] = useState<string>(() => uload<string>(`p21_sort_${pipeline}`, "default"));
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const filtersKey = `p21_filters_${pipeline}`;
  const [filterNiches, setFilterNiches] = useState<string[]>(
    () => uload<{ niches?: string[]; cities?: string[]; search?: string; tags?: string[] }>(filtersKey, {}).niches ?? []
  );
  const [filterCities, setFilterCities] = useState<string[]>(
    () => uload<{ niches?: string[]; cities?: string[]; search?: string; tags?: string[] }>(filtersKey, {}).cities ?? []
  );
  const [filterTags, setFilterTags] = useState<string[]>(
    () => uload<{ niches?: string[]; cities?: string[]; search?: string; tags?: string[] }>(filtersKey, {}).tags ?? []
  );
  const [searchQuery, setSearchQuery] = useState<string>(
    () => uload<{ niches?: string[]; cities?: string[]; search?: string; tags?: string[] }>(filtersKey, {}).search ?? ""
  );

  useEffect(() => {
    usave(filtersKey, { niches: filterNiches, cities: filterCities, search: searchQuery, tags: filterTags });
    usave(`p21_sort_${pipeline}`, sortBy);
  }, [filtersKey, filterNiches, filterCities, searchQuery, filterTags, sortBy, pipeline]);

  const viewKey = `p21_view_${pipeline}`;
  const [view, setView] = useState<"kanban" | "list">(
    () => (uload<"kanban" | "list">(viewKey, "kanban") === "list" ? "list" : "kanban")
  );
  useEffect(() => { usave(viewKey, view); }, [viewKey, view]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const onSync = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const fresh = getLeads();
        setLeads(fresh);
        setStages(getStagesForPipeline(pipeline));
        setSelectedLead((cur) => (cur ? fresh.find((l) => l.id === cur.id) ?? cur : cur));
      }, 100);
    };

    // Force load if we have a current user but haven't triggered a sync yet
    const uid = localStorage.getItem("p21_current_user_id");
    if (uid && leads.length === 0) {
      onSync();
    }


    // Initial load: ensures we don't wait for a sync event if data is already in memCache
    onSync();

    window.addEventListener("p21:storage-synced", onSync);
    window.addEventListener("p21:leads-changed", onSync);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("p21:storage-synced", onSync);
      window.removeEventListener("p21:leads-changed", onSync);
    };
  }, [pipeline]);


  useEffect(() => {
    const handler = (e: any) => {
      const { id, stage } = e.detail;
      setLostReasonLead({ id, stage });
    };
    window.addEventListener(LOST_REASON_EVENT, handler);
    return () => window.removeEventListener(LOST_REASON_EVENT, handler);
  }, []);

  const refresh = useCallback(() => {
    setLeads(getLeads());
    setStages(getStagesForPipeline(pipeline));
  }, [pipeline]);

  // ── Abrir Lead a partir de contextos externos (Missão do Dia, Central de
  // Decisão, Agenda, Lembretes...). A abertura é feita SEMPRE pelo ID do lead,
  // nunca pelo conjunto filtrado — os filtros ativos permanecem intactos.
  const pendingOpenRef = useRef<PendingOpenLead | null>(null);

  const tryOpenPending = useCallback((p: PendingOpenLead | null) => {
    if (!p) return;
    const l = getLeads().find((x) => x.id === p.leadId);
    if (!l) {
      // Base ainda não carregada/sincronizada: guarda e tenta de novo depois.
      pendingOpenRef.current = p;
      return;
    }
    // Se o lead pertence a outro pipeline, mantém pendente para o board correto.
    if (!getStagesForPipeline(pipeline).includes(l.stage)) {
      pendingOpenRef.current = null;
      try { sessionStorage.setItem(PENDING_OPEN_LEAD_KEY, JSON.stringify(p)); } catch { /* ignore */ }
      return;
    }
    pendingOpenRef.current = null;
    setSelectedLead(l);
    setDrawerTab(p.tab);
    setDrawerAction(p.action);
    setDrawerOpen(true);
  }, [pipeline]);

  useEffect(() => {
    tryOpenPending(consumePendingOpenLead());
    const onEvt = (e: Event) => {
      const detail = (e as CustomEvent<PendingOpenLead>).detail;
      tryOpenPending(detail || consumePendingOpenLead());
    };
    window.addEventListener(OPEN_LEAD_EVENT, onEvt as EventListener);
    return () => window.removeEventListener(OPEN_LEAD_EVENT, onEvt as EventListener);
  }, [tryOpenPending]);

  // Retenta assim que a base de leads chega (sync assíncrono / IndexedDB).
  useEffect(() => {
    if (pendingOpenRef.current) tryOpenPending(pendingOpenRef.current);
  }, [leads, tryOpenPending]);



  const stageSet = useMemo(() => new Set(stages), [stages]);
  const allPipelineLeads = useMemo(
    () => leads.filter((l) => stageSet.has(l.stage)),
    [leads, stageSet]
  );
  const filterNicheSet = useMemo(() => new Set(filterNiches), [filterNiches]);
  const filterCitySet = useMemo(() => new Set(filterCities), [filterCities]);
  const niches = useMemo(
    () =>
      Array.from(
        new Set(
          allPipelineLeads
            .filter((l) => filterCitySet.size === 0 || (l.city && filterCitySet.has(l.city)))
            .map((l) => l.niche)
            .filter(Boolean)
        )
      ).sort(),
    [allPipelineLeads, filterCitySet]
  );
  const cities = useMemo(
    () =>
      Array.from(
        new Set(
          allPipelineLeads
            .filter((l) => filterNicheSet.size === 0 || (l.niche && filterNicheSet.has(l.niche)))
            .map((l) => l.city)
            .filter(Boolean)
        )
      ).sort(),
    [allPipelineLeads, filterNicheSet]
  );
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const pipelineLeads = useMemo(() => {
    const q = deferredSearchQuery.trim();
    let filtered = allPipelineLeads.filter((l) => {
      const matchesNiche = filterNicheSet.size === 0 || (l.niche && filterNicheSet.has(l.niche));
      const matchesCity = filterCitySet.size === 0 || (l.city && filterCitySet.has(l.city));
      const matchesTags = filterTags.length === 0 || (l.tags && l.tags.some(t => filterTags.includes(t)));
      if (!matchesNiche || !matchesCity || !matchesTags) return false;
      if (!q) return true;
      return leadMatchesQuery(l, q);
    });

    if (sortBy === "icp_desc") filtered.sort((a, b) => (b.icpStars || 0) - (a.icpStars || 0));
    else if (sortBy === "name_asc") filtered.sort((a, b) => a.company.localeCompare(b.company));
    else if (sortBy === "name_desc") filtered.sort((a, b) => b.company.localeCompare(a.company));
    else if (sortBy === "rating_desc") filtered.sort((a, b) => (b.googleRating || 0) - (a.googleRating || 0));
    else if (sortBy === "rating_asc") filtered.sort((a, b) => (a.googleRating || 0) - (b.googleRating || 0));
    else if (sortBy === "reviews_desc") filtered.sort((a, b) => (b.googleReviews || 0) - (a.googleReviews || 0));
    else if (sortBy === "reviews_asc") filtered.sort((a, b) => (a.googleReviews || 0) - (b.googleReviews || 0));
    else if (sortBy === "reputation") {
      filtered.sort((a, b) => {
        const score = (l: Lead) => {
          const r = l.googleRating || 0;
          const v = l.googleReviews || 0;
          // Algoritmo simples de reputação: Peso 70% nota, 30% volume (logarítmico para não explodir com reviews)
          return r * 0.7 + (Math.log10(v + 1)) * 0.3;
        };
        return score(b) - score(a);
      });
    }

    return filtered;
  }, [allPipelineLeads, filterNicheSet, filterCitySet, filterTags, deferredSearchQuery, sortBy]);
  const leadsByStage = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const s of stages) map.set(s, []);
    for (const l of pipelineLeads) {
      const arr = map.get(l.stage);
      if (arr) arr.push(l);
    }
    return map;
  }, [pipelineLeads, stages]);

  const toggleFilterValue = (current: string[], value: string) =>
    current.includes(value) ? current.filter((v) => v !== value) : [...current, value];

  const startEditStage = (s: string) => { setEditingStage(s); setEditingValue(s); };
  const commitEditStage = () => {
    if (editingStage && editingValue.trim() && editingValue !== editingStage) {
      const r = renameStage(pipeline, editingStage, editingValue.trim());
      if (!r.ok) {
        toast.error((r as any).error || "Não foi possível renomear");
        return; // mantém o input aberto para o usuário corrigir
      }
    }
    setEditingStage(null); setEditingValue("");
    refresh();
  };
  const handleAddStage = () => {
    const name = newStageName.trim();
    if (name) {
      const r = addStage(pipeline, name);
      if (!(r as any).ok) {
        toast.error((r as any).error || "Erro ao adicionar etapa");
        return;
      }
      if (!r.ok) {
        toast.error(r.error || "Não foi possível adicionar");
        return;
      }
    }
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
    addLead({ ...form, stage: stages[0] }, stages[0]);
    setForm({ company: "", contact: "", phone: "", notes: "", niche: "", city: "", gmnLink: "", instagramLink: "", icpStars: 3, runsAds: false });
    setDialogOpen(false);
    refresh();
  };

  const handleDelete = useCallback((id: string) => {
    deleteLead(id);
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    refresh();
  }, [refresh]);

  const handleCardClick = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setDrawerOpen(true);
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const maybePromptAlignment = useCallback((leadId: string) => {
    const fresh = getLeads().find((l) => l.id === leadId);
    if (!fresh) return;
    if (getPipelineForStage(fresh.stage) !== "oportunidades") return;
    if (fresh.stage !== "Reunião Realizada") return;
    const already = getMeetingsForLead(leadId).some((m) =>
      (m.title || "").toLowerCase().startsWith("reunião de alinhamento")
    );
    if (already) return;
    setAlignmentLead(fresh);
  }, []);

  const handleBulkMove = (targetStage: PipelineStage) => {
    const count = selectedIds.size;
    const idsSnapshot = Array.from(selectedIds);
    const result = moveLeadsToStageBatch(selectedIds, targetStage);
    setSelectedIds(new Set());
    refresh();
    toast.success(`${count} leads movidos para "${targetStage}"`);
    if (result.autoTransfer) {
      const labels: Record<string, string> = { cold_call: "Cold Call", oportunidades: "Oportunidades", onboarding: "Onboarding" };
      toast.success(`Transferidos automaticamente para ${labels[result.autoTransfer] ?? result.autoTransfer}!`);
    }
    if (targetStage === "Reunião Realizada" && idsSnapshot.length === 1) {
      maybePromptAlignment(idsSnapshot[0]);
    }
  };

  const handleBulkDelete = () => {
    const count = selectedIds.size;
    deleteLeadsBatch(selectedIds);
    setSelectedIds(new Set());
    refresh();
    toast.success(`${count} lead(s) excluído(s)`);
  };

  const handleSelectAllInStage = (stage: PipelineStage) => {
    const stageLeadIds = (leadsByStage.get(stage) ?? []).map((l) => l.id);
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
          rows = (aoa.slice(1) as unknown[][])
            .map((arr) => {
              if (arr.every(v => v === undefined || v === null || String(v).trim() === "")) return null;
              const obj: Record<string, string> = {};
              headers.forEach((h, i) => { obj[h] = String(arr[i] ?? "").trim(); });
              return obj;
            })
            .filter((row): row is Record<string, string> => row !== null);
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

  const handleConfirmMapping = (mapping: Record<LeadFieldKey, string>, tag: string) => {
    try {
      let created = 0;
      let updatedCount = 0;
      const existing = getLeads();
      
      // Build index for O(1) lookup
      const leadsByPhone = new Map<string, Lead>();
      const leadsByCompany = new Map<string, Lead>();
      const leadsByGmn = new Map<string, Lead>();

      for (const l of existing) {
        const kPhone = (l.phoneNormalized || (l.phone ? l.phone.replace(/\D+/g, "") : "")).trim();
        const lCity = (l.city || "").trim().toLowerCase();
        const kCompany = lCity ? `${(l.company || "").trim().toLowerCase()}|${lCity}` : "";
        const kGmn = (l.gmnLink || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
        
        if (kPhone) leadsByPhone.set(kPhone, l);
        if (kCompany && kCompany !== "|") leadsByCompany.set(kCompany, l);
        if (kGmn) leadsByGmn.set(kGmn, l);
      }


      const allLeads = [...existing];
      const initialStage = stages[0];
      
      if (!initialStage) {
        toast.error("Nenhuma etapa disponível neste pipeline. Crie uma etapa antes de importar.");
        return;
      }

      importRows.forEach((row) => {
        const get = (k: LeadFieldKey) => {
          const col = mapping[k];
          if (!col || col === "__none__") return "";
          return (row[col] || "").trim();
        };

        const company = get("company");
        if (!company) return;
        
        const phone = get("phone");
        const gmnLink = get("gmnLink");
        const cityVal = get("city");
        const kPhone = phone.replace(/\D+/g, "");
        const kCompany = cityVal ? `${company.trim().toLowerCase()}|${cityVal.trim().toLowerCase()}` : "";
        const kGmn = gmnLink.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");

        // Find existing match (phone > gmn > empresa+cidade)
        const existingLead = (kPhone && leadsByPhone.get(kPhone)) || 
                             (kGmn && leadsByGmn.get(kGmn)) ||
                             (kCompany && leadsByCompany.get(kCompany));

        const icpStars = (mapping.icpStars && mapping.icpStars !== "__none__" && row[mapping.icpStars]) 
          ? (Math.min(5, Math.max(1, parseInt(row[mapping.icpStars]))) as ICPStars)
          : 2;

        if (existingLead) {
          // Update existing lead
          const idx = allLeads.findIndex(l => l.id === existingLead.id);
          if (idx !== -1) {
            const currentTags = allLeads[idx].tags || [];
            // Tag da importação sempre em primeiro (é a que aparece no card)
            const newTags = Array.from(new Set([tag, ...currentTags]));

            
            allLeads[idx] = {
              ...allLeads[idx],
              company: company || allLeads[idx].company,
              contact: get("contact") || allLeads[idx].contact,
              phone: phone || allLeads[idx].phone,
              website: get("website") || allLeads[idx].website,
              niche: get("niche") || allLeads[idx].niche,
              city: get("city") || allLeads[idx].city,
              gmnLink: gmnLink || allLeads[idx].gmnLink,
              instagramLink: get("instagramLink") || allLeads[idx].instagramLink,
              notes: get("notes") ? (allLeads[idx].notes ? `${allLeads[idx].notes}\n${get("notes")}` : get("notes")) : allLeads[idx].notes,
              googleRating: parseFloat(get("googleRating").replace(",", ".")) || allLeads[idx].googleRating,
              googleReviews: parseInt(get("googleReviews").replace(/\D/g, ""), 10) || allLeads[idx].googleReviews,
              icpStars: mapping.icpStars && mapping.icpStars !== "__none__" ? icpStars : allLeads[idx].icpStars,
              tags: newTags
            };
            updatedCount++;
          }
        } else {
          // Create new lead
          const now = new Date().toISOString();
          const newLead: Lead = {
            id: crypto.randomUUID(),
            company,
            contact: get("contact"),
            phone,
            website: get("website"),
            niche: get("niche"),
            city: get("city"),
            gmnLink,
            instagramLink: get("instagramLink"),
            notes: get("notes"),
            googleRating: parseFloat(get("googleRating").replace(",", ".")) || undefined,
            googleReviews: parseInt(get("googleReviews").replace(/\D/g, ""), 10) || undefined,
            icpStars,
            runsAds: false,
            tags: [tag],
            stage: initialStage,
            createdAt: now,
            stageChangedAt: now,
            attachments: [],
            interactions: [],
            callNotes: []
          };
          allLeads.push(newLead);
          created++;
          
          // Update index for next rows in same import
          if (kPhone) leadsByPhone.set(kPhone, newLead);
          if (kCompany) leadsByCompany.set(kCompany, newLead);
          if (kGmn) leadsByGmn.set(kGmn, newLead);
        }
      });

      setLeads(allLeads);
      
      setMappingOpen(false);
      setImportHeaders([]);
      setImportRows([]);
      refresh();

      if (created === 0 && updatedCount === 0) {
        toast.warning("Nenhum lead válido encontrado.");
      } else {
        const parts = [];
        if (created > 0) parts.push(`${created} novos`);
        if (updatedCount > 0) parts.push(`${updatedCount} atualizados`);
        toast.success(`Importação concluída: ${parts.join(" • ")}`);
      }
    } catch (err) {
      console.error("[import] failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erro ao importar: ${msg}`);
    }
  };


  const handleDedupe = () => {
    const removed = dedupeLeads();
    refresh();
    if (removed === 0) toast.info("Nenhuma duplicata encontrada.");
    else toast.success(`${removed} duplicata(s) removida(s)`);
  };

  const onDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.setData("application/x-lead", id);
  }, []);

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
    
    const isLost = stage.toLowerCase().includes("não quer") || stage.toLowerCase().includes("nao quer") || stage === "Perdido";
    if (isLost) {
      setLostReasonLead({ id, stage });
      return;
    }

    const result = moveLeadToStage(id, stage);
    refresh();
    if (result.missingContractValue) {
      toast.warning("Lead movido para Ganho sem valor de contrato definido", {
        style: { background: "hsl(28 90% 55%)", color: "white", border: "none" },
      });
    }
    if (result.autoTransfer) {
      const labels: Record<string, string> = { cold_call: "Cold Call", oportunidades: "Oportunidades", onboarding: "Onboarding" };
      toast.success(`Lead transferido automaticamente para ${labels[result.autoTransfer] ?? result.autoTransfer}!`);
    }
    if (stage === "Reunião Realizada") maybePromptAlignment(id);
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">{title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle || `${pipelineLeads.length} leads no total`}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-border bg-muted/30 p-0.5">
            <button
              onClick={() => setView("kanban")}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-sm transition-all ${view === "kanban" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
            <button
              onClick={() => setView("list")}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-sm transition-all ${view === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <ListIcon className="h-3.5 w-3.5" /> Lista
            </button>
          </div>
          
          {extraActions}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1 px-2">
                <Settings2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Ações</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {showImport && (
                <>
                  <DropdownMenuItem onClick={() => csvRef.current?.click()} className="text-xs">
                    <Upload className="h-3.5 w-3.5 mr-2" /> Importar Leads
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDedupe} className="text-xs">
                    <Copy className="h-3.5 w-3.5 mr-2" /> Remover Duplicatas
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={() => setCampaignOpen(true)} className="text-xs" disabled={pipelineLeads.length === 0}>
                <Download className="h-3.5 w-3.5 mr-2" /> Exportar Leads
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {showImport && <input ref={csvRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileImport} />}

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
                          {form.icpStars === 1 ? "Baixa" : form.icpStars === 2 ? "Média" : form.icpStars === 3 ? "Alta" : "Muito Alta"}
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

      <div className="flex flex-wrap items-center gap-2 mb-4 bg-muted/20 p-2 rounded-lg border border-border/40">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            placeholder="Pesquisar leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-xs pl-8 border-border/60 bg-background/50 focus:bg-background"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-[11px] font-normal border-border/60 bg-background/50 gap-2 min-w-[140px] justify-between">
                <span className="truncate">
                  {filterNiches.length === 0 ? "Nichos" : `${filterNiches.length} nicho(s)`}
                </span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-2" align="start">
              <div className="max-h-[240px] overflow-y-auto space-y-0.5">
                {getCorrelatedOptions(leads, "niche", { city: filterCities }).map((n) => (
                  <label key={n} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-xs">
                    <Checkbox
                      checked={filterNiches.includes(n)}
                      onCheckedChange={() => setFilterNiches((prev) => toggleFilterValue(prev, n))}
                      className="h-3.5 w-3.5"
                    />
                    <span className="truncate">{n}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-[11px] font-normal border-border/60 bg-background/50 gap-2 min-w-[140px] justify-between">
                <span className="truncate">
                  {filterCities.length === 0 ? "Cidades" : `${filterCities.length} cidade(s)`}
                </span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-2" align="start">
              <div className="max-h-[240px] overflow-y-auto space-y-0.5">
                {getCorrelatedOptions(leads, "city", { niche: filterNiches }).map((c) => (
                  <label key={c} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-xs">
                    <Checkbox
                      checked={filterCities.includes(c)}
                      onCheckedChange={() => setFilterCities((prev) => toggleFilterValue(prev, c))}
                      className="h-3.5 w-3.5"
                    />
                    <span className="truncate">{c}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-[11px] font-normal border-border/60 bg-background/50 gap-2 min-w-[140px] justify-between">
                <span className="truncate">
                  {filterTags.length === 0 ? "Tags" : `${filterTags.length} tag(s)`}
                </span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-2" align="start">
              <div className="max-h-[240px] overflow-y-auto space-y-0.5">
                {getAvailableOptions(leads, "tags").map((t) => (
                  <label key={t} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-xs">
                    <Checkbox
                      checked={filterTags.includes(t)}
                      onCheckedChange={() => setFilterTags((prev) => toggleFilterValue(prev, t))}
                      className="h-3.5 w-3.5"
                    />
                    <span className="truncate">{t}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>


          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 text-[11px] font-normal w-[160px] border-border/60 bg-background/50">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default" className="text-xs">Padrão</SelectItem>
              <SelectItem value="icp_desc" className="text-xs">ICP (↓)</SelectItem>
              <SelectItem value="name_asc" className="text-xs">A → Z</SelectItem>
              <SelectItem value="name_desc" className="text-xs">Z → A</SelectItem>
              <SelectItem value="rating_desc" className="text-xs">Nota (↓)</SelectItem>
              <SelectItem value="reviews_desc" className="text-xs">Avaliações (↓)</SelectItem>
              <SelectItem value="reputation" className="text-xs">Reputação</SelectItem>
            </SelectContent>
          </Select>

          {(filterNiches.length > 0 || filterCities.length > 0 || filterTags.length > 0 || searchQuery) && (
            <Button size="sm" variant="ghost" className="h-8 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => { setFilterNiches([]); setFilterCities([]); setFilterTags([]); setSearchQuery(""); }}>
              <XIcon className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
          )}
        </div>
      </div>


      <ExportLeadsDialog
        open={campaignOpen}
        onOpenChange={setCampaignOpen}
        filteredLeads={pipelineLeads}
        niches={filterNiches}
        cities={filterCities}
        showAttemptFilter={pipeline === "cold_call"}
      />



      <BulkActionsBar
        count={selectedIds.size}
        stages={[...stages] as PipelineStage[]}
        onMoveToStage={handleBulkMove}
        onDelete={handleBulkDelete}
        onClear={() => setSelectedIds(new Set())}
        onEdit={() => setBulkEditOpen(true)}
      />

      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        selectedIds={selectedIds}
        onDone={() => { setSelectedIds(new Set()); refresh(); }}
      />

      {view === "list" ? (
        <PipelineListView
          leads={pipelineLeads}
          stages={stages}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={(ids) => {
            const allSel = ids.length > 0 && ids.every((id) => selectedIds.has(id));
            const next = new Set(selectedIds);
            if (allSel) ids.forEach((id) => next.delete(id));
            else ids.forEach((id) => next.add(id));
            setSelectedIds(next);
          }}
          onRowClick={handleCardClick}
          onChangeStage={(id, stage) => {
            const isLost = stage.toLowerCase().includes("não quer") || stage.toLowerCase().includes("nao quer") || stage === "Perdido";
            if (isLost) {
              setLostReasonLead({ id, stage });
              return;
            }

            const result = moveLeadToStage(id, stage);
            refresh();
            if (result.missingContractValue) {
              toast.warning("Lead movido para Ganho sem valor de contrato definido");
            }
            if (result.autoTransfer) {
              const labels: Record<string, string> = { cold_call: "Cold Call", oportunidades: "Oportunidades", onboarding: "Onboarding" };
              toast.success(`Lead transferido automaticamente para ${labels[result.autoTransfer] ?? result.autoTransfer}!`);
            }
            if (stage === "Reunião Realizada") maybePromptAlignment(id);
          }}
          showContractValue={pipeline === "oportunidades"}
        />
      ) : (
      <div className="flex-1 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <div className="flex gap-4 h-full min-w-max">
          {stages.map((stage) => {
            const stageLeads = leadsByStage.get(stage) ?? [];
            const totalValue = stageLeads.reduce((sum, l) => sum + (l.contractValue ?? 0), 0);
            
            return (
              <div
                key={stage}
                onDrop={(e) => onDrop(e, stage)}
                onDragOver={onDragOver}
                className="flex flex-col min-w-[280px] w-[280px] bg-muted/10 rounded-xl border border-border/40 transition-shadow hover:shadow-md"
              >
                <div className="p-2.5 border-b border-border/40 bg-muted/5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
                      <div className="w-1 h-3 rounded-full shrink-0" style={{ backgroundColor: stageColors[stage]?.match(/bg-([a-z0-9-]+)/)?.[1] ? `var(--${stageColors[stage].match(/bg-([a-z0-9-]+)/)[1]})` : '#9ABD33' }} />
                      
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Checkbox 
                          checked={stageLeads.length > 0 && stageLeads.every(l => selectedIds.has(l.id))}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedIds);
                            if (checked) {
                              stageLeads.forEach(l => next.add(l.id));
                            } else {
                              stageLeads.forEach(l => next.delete(l.id));
                            }
                            setSelectedIds(next);
                          }}
                          className="h-3 w-3 shrink-0"
                        />

                        {editingStage === stage ? (
                          <div className="flex items-center gap-0.5 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                            <Input
                              autoFocus
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") commitEditStage(); if (e.key === "Escape") { setEditingStage(null); setEditingValue(""); } }}
                              className="h-6 text-[11px] px-1.5 py-0 border-accent/40"
                            />
                          </div>
                        ) : (
                          <h3
                            draggable
                            onDragStart={(e) => onStageDragStart(e, stage)}
                            onDoubleClick={() => startEditStage(stage)}
                            className="text-[10px] font-bold text-foreground uppercase tracking-widest truncate cursor-grab active:cursor-grabbing select-none"
                          >
                            {stage}
                          </h3>
                        )}
                      </div>
                      
                      <span className="text-[9px] font-bold text-muted-foreground/50 bg-muted/50 px-1.5 py-0.5 rounded shrink-0">
                        {stageLeads.length}
                      </span>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="text-muted-foreground/30 hover:text-foreground transition-colors p-1">
                          <MoreVertical className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-[11px]">
                        <DropdownMenuItem onClick={() => startEditStage(stage)}>
                          <Pencil className="h-3 w-3 mr-2" /> Renomear
                        </DropdownMenuItem>
                        {stages.length > 1 && (
                          <DropdownMenuItem onClick={() => handleRemoveStage(stage)} className="text-destructive">
                            <Trash2 className="h-3 w-3 mr-2" /> Excluir
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  
                  {pipeline === "oportunidades" && totalValue > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-muted-foreground/60 uppercase font-medium">Vol.</span>
                      <span className="text-[10px] font-bold text-accent">
                        {totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-280px)] scrollbar-hide content-visibility-auto">
                  {stageLeads.length === 0 ? (
                    <div className="h-20 flex items-center justify-center border border-dashed border-border/20 rounded-lg">
                      <p className="text-[9px] text-muted-foreground/30 italic">Vazio</p>
                    </div>
                  ) : (
                    stageLeads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        pipeline={pipeline}
                        selected={selectedIds.has(lead.id)}
                        onToggleSelect={handleToggleSelect}
                        onClick={handleCardClick}
                        onDelete={handleDelete}
                        onDragStart={onDragStart}
                        onRefresh={refresh}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}


          <div className="min-w-[280px] w-[280px]">
            {showAddStage ? (
              <div className="bg-muted/10 border border-accent/40 rounded-xl p-3 flex flex-col gap-2">
                <Input
                  autoFocus
                  placeholder="Nome da etapa"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddStage(); if (e.key === "Escape") { setShowAddStage(false); setNewStageName(""); } }}
                  className="h-8 text-xs"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddStage} className="h-7 text-[10px] flex-1">Salvar</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowAddStage(false); setNewStageName(""); }} className="h-7 text-[10px] flex-1">Cancelar</Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddStage(true)}
                className="flex flex-col items-center justify-center w-full h-[80px] border border-dashed border-border/20 rounded-xl text-muted-foreground/40 hover:text-foreground hover:border-accent/40 hover:bg-accent/5 transition-all group"
              >
                <div className="w-6 h-6 rounded-full bg-muted/50 flex items-center justify-center mb-2 group-hover:bg-accent/10">
                  <Plus className="h-3 w-3" />
                </div>
                <span className="text-[9px] font-bold uppercase tracking-widest">Nova Etapa</span>
              </button>
            )}
          </div>
        </div>
      </div>


      )}


      <LeadDetailDrawer
        lead={selectedLead}
        open={drawerOpen}
        onOpenChange={(o) => {
          setDrawerOpen(o);
          if (!o) { setDrawerTab(undefined); setDrawerAction(undefined); }
        }}
        initialTab={drawerTab}
        initialAction={drawerAction}
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

      <ScheduleMeetingDialog
        lead={alignmentLead}
        open={!!alignmentLead}
        onOpenChange={(o) => { if (!o) setAlignmentLead(null); }}
        onScheduled={() => { setAlignmentLead(null); refresh(); }}
        kind="alinhamento"
      />
      <LostReasonDialog
        open={!!lostReasonLead}
        onOpenChange={(open) => !open && setLostReasonLead(null)}
        pipeline={pipeline === "cold_call" ? "cold_call" : "oportunidades"}
        onConfirm={(reason) => {
          if (!lostReasonLead) return;
          moveLeadToStage(lostReasonLead.id, lostReasonLead.stage);
          addInteraction(lostReasonLead.id, {
            type: "Outro",
            date: new Date().toISOString(),
            title: "Lead Perdido / Sem Interesse",
            summary: `Motivo da perda: ${reason}`,
          });
          refresh();
          toast.success("Lead movido e motivo registrado.");
          setLostReasonLead(null);
        }}
      />
    </div>
  );
}
