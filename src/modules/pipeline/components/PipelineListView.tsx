import { useEffect, useMemo, useState } from "react";
import type { Lead, PipelineStage } from "@/shared/services/store";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown, ArrowUp, ChevronsUpDown, Star, MapPin, Paperclip, AlertCircle,
  Phone, MessageCircle, Instagram, ExternalLink, Clock, Users,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EmptyState } from "@/shared/components/shell/states/EmptyState";

type SortKey = "company" | "contact" | "niche" | "city" | "stage" | "icpStars" | "phone" | "stageChangedAt" | "contractValue";

interface Props {
  leads: Lead[];
  stages: PipelineStage[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (ids: string[]) => void;
  onRowClick: (lead: Lead) => void;
  onChangeStage: (id: string, stage: PipelineStage) => void;
  showContractValue?: boolean;
}

function mapsUrlFor(lead: Lead) {
  if (lead.gmnLink) return lead.gmnLink;
  const q = encodeURIComponent(`${lead.company} ${lead.city || ""}`.trim());
  return q ? `https://www.google.com/maps/search/?api=1&query=${q}` : "";
}

function QuickLink({
  href, title, children, className = "",
}: {
  href?: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      title={title}
      aria-label={title}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground transition-colors hover:border-accent/60 hover:bg-accent/10 hover:text-accent ${className}`}
    >
      {children}
    </a>
  );
}

export default function PipelineListView({
  leads, stages, selectedIds, onToggleSelect, onToggleSelectAll, onRowClick, onChangeStage, showContractValue,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("stageChangedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const sorted = useMemo(() => {
    const arr = [...leads];
    arr.sort((a, b) => {
      const av: any = (a as any)[sortKey] ?? "";
      const bv: any = (b as any)[sortKey] ?? "";
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [leads, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages - 1) setPage(0);
  }, [totalPages, page]);

  const paged = useMemo(
    () => sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [sorted, page],
  );

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const Th = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`text-left px-3 py-2 font-medium text-[11px] uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none ${className}`}
    >
      <span className="inline-flex items-center gap-1">{children}<SortIcon k={k} /></span>
    </th>
  );

  const allIds = sorted.map((l) => l.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

  return (
    <div className="flex-1 flex flex-col min-h-0 mission-card overflow-hidden">
    <div className="flex-1 overflow-auto scrollbar-thin">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10 bg-muted border-b border-border">
          <tr>
            <th className="w-8 px-2 py-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() => onToggleSelectAll(allIds)}
                className="h-3.5 w-3.5"
              />
            </th>
            <Th k="company">Empresa</Th>
            <Th k="stage">Status</Th>
            <Th k="contact">Contato</Th>
            <Th k="phone">Telefone e atalhos</Th>
            <Th k="niche">Nicho</Th>
            <Th k="city">Cidade</Th>
            <Th k="icpStars">ICP</Th>
            {showContractValue && <Th k="contractValue">Valor</Th>}
            <Th k="stageChangedAt">Tempo na etapa</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={showContractValue ? 10 : 9} className="p-0">
                <EmptyState
                  icon={Users}
                  title="Nenhum lead encontrado"
                  description="Ajuste os filtros ou adicione um novo lead a este pipeline."
                  className="border-0 rounded-none bg-transparent"
                />
              </td>
            </tr>
          )}
          {paged.map((lead) => {
            const isSelected = selectedIds.has(lead.id);
            const stale = (Date.now() - new Date(lead.stageChangedAt).getTime()) / 86400000 >= 1;
            const whats = lead.whatsapp || lead.phone;
            const whatsUrl = whats ? `https://wa.me/${whats.replace(/\D/g, "")}` : "";
            const mapsUrl = mapsUrlFor(lead);

            return (
              <tr
                key={lead.id}
                onClick={() => onRowClick(lead)}
                className={`border-b border-border/50 hover:bg-accent/5 cursor-pointer transition-colors ${
                  isSelected ? "bg-accent/10" : ""
                }`}
              >
                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(lead.id)}
                    className="h-3.5 w-3.5"
                  />
                </td>
                <td className="px-3 py-1.5 font-medium text-foreground max-w-[220px] truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{lead.company}</span>
                    {lead.attachments?.length > 0 && <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />}
                  </div>
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <Select value={lead.stage} onValueChange={(v) => onChangeStage(lead.id, v)}>
                    <SelectTrigger className="h-7 text-xs w-[160px] border-border bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground max-w-[160px] truncate">{lead.contact || "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span className="max-w-[120px] truncate" title={lead.phone || undefined}>{lead.phone || "—"}</span>
                    <div className="flex items-center gap-1">
                      <QuickLink href={lead.phone ? `tel:${lead.phone}` : ""} title="Ligar para o lead">
                        <Phone className="h-3.5 w-3.5" />
                      </QuickLink>
                      <QuickLink href={whatsUrl} title="Abrir WhatsApp" className="hover:text-emerald-500 hover:border-emerald-500/60 hover:bg-emerald-500/10">
                        <MessageCircle className="h-3.5 w-3.5" />
                      </QuickLink>
                      <QuickLink href={mapsUrl} title="Abrir Google/Maps">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </QuickLink>
                      <QuickLink href={lead.instagramLink} title="Abrir Instagram" className="hover:text-pink-500 hover:border-pink-500/60 hover:bg-pink-500/10">
                        <Instagram className="h-3.5 w-3.5" />
                      </QuickLink>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  {lead.niche ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{lead.niche}</Badge> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-1.5">
                  {lead.city ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />{lead.city}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={`h-3 w-3 ${s <= lead.icpStars ? "fill-accent text-accent" : "text-muted-foreground/30"}`} />
                    ))}
                  </div>
                </td>
                {showContractValue && (
                  <td className="px-3 py-1.5 text-xs font-semibold text-accent whitespace-nowrap">
                    {lead.contractValue ? lead.contractValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                  </td>
                )}
                <td className="px-3 py-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {formatDistanceToNow(new Date(lead.stageChangedAt), { locale: ptBR, addSuffix: false })}
                    {stale && <AlertCircle className="h-3 w-3 text-destructive" />}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
      {sorted.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground shrink-0">
          <span>
            {sorted.length} lead{sorted.length !== 1 ? "s" : ""} · página {page + 1} de {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
