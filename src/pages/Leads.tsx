import { useState, useCallback } from "react";
import {
  PIPELINE_STAGES,
  type Lead,
  type PipelineStage,
  getLeads,
  saveLeads,
  addLead,
  deleteLead,
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
import { Plus, Trash2, GripVertical } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

function timeInStage(stageChangedAt: string) {
  return formatDistanceToNow(new Date(stageChangedAt), { locale: ptBR, addSuffix: false });
}

function LeadCard({
  lead,
  onDragStart,
  onDelete,
}: {
  lead: Lead;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDelete: (id: string) => void;
}) {
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
        <button
          onClick={() => onDelete(lead.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {lead.contact && <p className="text-xs text-muted-foreground mt-1 truncate">{lead.contact}</p>}
      <p className="text-[10px] text-muted-foreground/70 mt-2">⏱ {timeInStage(lead.stageChangedAt)}</p>
    </div>
  );
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>(getLeads);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ company: "", contact: "", phone: "", notes: "" });

  const refresh = useCallback(() => setLeads(getLeads()), []);

  const handleAdd = () => {
    if (!form.company.trim()) return;
    addLead(form);
    setForm({ company: "", contact: "", phone: "", notes: "" });
    setDialogOpen(false);
    refresh();
  };

  const handleDelete = (id: string) => {
    deleteLead(id);
    refresh();
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };

  const onDrop = (e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="h-4 w-4 mr-1" /> Novo Lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Lead</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Empresa *</Label>
                <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
              <div>
                <Label>Contato</Label>
                <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
                    <LeadCard key={lead.id} lead={lead} onDragStart={onDragStart} onDelete={handleDelete} />
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
