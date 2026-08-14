import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, RotateCcw, Save, GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  type CadenceStep, type CadenceChannel,
  getCadenceForNiche, saveCadenceForNiche, resetCadenceForNiche,
} from "@/modules/leads/services/cadence";
import { pullKeysFromCloud } from "@/shared/services/userStorage";


const CHANNELS: CadenceChannel[] = ["Ligação", "WhatsApp", "Instagram", "E-mail"];

function renumber(steps: CadenceStep[]): CadenceStep[] {
  return steps.map((s, i) => ({ ...s, attempt: i }));
}

function stepLabel(attempt: number): string {
  return attempt === 0 ? "Novo Lead / T0" : `Tentativa T${attempt}`;
}

export default function CadenceEditor({
  niche, currentAttempt, onChanged,
}: {
  niche?: string;
  currentAttempt?: number;
  onChanged?: () => void;
}) {
  const [steps, setSteps] = useState<CadenceStep[]>(() => getCadenceForNiche(niche));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setSteps(getCadenceForNiche(niche));
    setDirty(false);
    // Force pull from backend so cadence edited on another device shows up.
    pullKeysFromCloud(["p21_cadence_overrides"]).then((changed) => {
      if (changed.length > 0) {
        setSteps(getCadenceForNiche(niche));
      }
    });
  }, [niche]);

  useEffect(() => {
    const reload = () => {
      if (dirty) return; // don't overwrite unsaved edits
      setSteps(getCadenceForNiche(niche));
    };
    const onFocus = () => {
      if (dirty) return;
      pullKeysFromCloud(["p21_cadence_overrides"]).then(() => reload());
    };
    window.addEventListener("p21:cadence-changed", reload);
    window.addEventListener("p21:storage-synced", reload);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("p21:cadence-changed", reload);
      window.removeEventListener("p21:storage-synced", reload);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [niche, dirty]);


  const label = niche ? `Cadência para nicho "${niche}"` : "Cadência padrão";

  const update = (i: number, patch: Partial<CadenceStep>) => {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    setDirty(true);
  };

  const remove = (i: number) => {
    setSteps((prev) => renumber(prev.filter((_, idx) => idx !== i)));
    setDirty(true);
  };

  const add = () => {
    setSteps((prev) => {
      const nextStep: CadenceStep = {
        attempt: prev.length,
        channel: "Ligação", objective: "Novo objetivo",
        nextAction: "Descreva a ação", script: "",
        estimatedMinutes: 5,
      };
      return [...prev, nextStep];
    });
    setDirty(true);
  };

  const move = (i: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return renumber(copy);
    });
    setDirty(true);
  };

  const save = () => {
    saveCadenceForNiche(niche, renumber(steps));
    setDirty(false);
    toast.success("Cadência salva");
    onChanged?.();
  };

  const reset = () => {
    resetCadenceForNiche(niche);
    const fresh = getCadenceForNiche(niche);
    setSteps(fresh);
    setDirty(false);
    toast.success("Cadência restaurada ao padrão");
    onChanged?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] uppercase text-muted-foreground">{niche || "Geral"} · {steps.length} etapas</p>
        <div className="flex gap-1">
           <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={reset} title="Restaurar padrão"><RotateCcw className="h-3.5 w-3.5" /></Button>
           <Button size="sm" variant="ghost" className={`h-7 w-7 p-0 ${dirty ? "text-accent" : "text-muted-foreground"}`} onClick={save} disabled={!dirty} title="Salvar"><Save className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <Accordion type="single" collapsible className="space-y-1">
        {steps.map((s, i) => {
          const isCurrent = currentAttempt === s.attempt;
          return (
            <AccordionItem key={i} value={`step-${i}`} className={`rounded border px-2 py-0 border-border/40 ${isCurrent ? "bg-accent/5 border-accent/30" : "bg-muted/10"}`}>
              <AccordionTrigger className="py-2 hover:no-underline">
                <div className="flex items-center gap-2 text-[11px] font-medium text-left">
                   <Badge variant="outline" className={`px-1 h-4 text-[9px] ${isCurrent ? "bg-accent text-accent-foreground border-accent" : ""}`}>T{s.attempt}</Badge>
                   <span className="truncate max-w-[120px]">{s.channel}</span>
                   <span className="text-muted-foreground font-normal truncate max-w-[100px] hidden sm:inline">— {s.objective}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-1 pb-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                   <div className="space-y-1">
                      <Label className="text-[9px] text-muted-foreground uppercase">Canal</Label>
                      <Select value={s.channel} onValueChange={(v) => update(i, { channel: v as CadenceChannel })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CHANNELS.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                   </div>
                   <div className="space-y-1">
                      <Label className="text-[9px] text-muted-foreground uppercase">Minutos</Label>
                      <Input type="number" className="h-7 text-xs" value={s.estimatedMinutes} onChange={(e) => update(i, { estimatedMinutes: parseInt(e.target.value || "1") })} />
                   </div>
                </div>
                <div className="space-y-1">
                   <Label className="text-[9px] text-muted-foreground uppercase">Objetivo / Ação</Label>
                   <Input className="h-7 text-xs" value={s.objective} onChange={(e) => update(i, { objective: e.target.value })} />
                </div>
                <div className="space-y-1">
                   <Label className="text-[9px] text-muted-foreground uppercase">Script</Label>
                   <Textarea className="text-[11px] min-h-[80px]" value={s.script} onChange={(e) => update(i, { script: e.target.value })} />
                </div>
                <div className="flex justify-between items-center pt-2">
                   <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(i, -1)} disabled={i <= 0}><GripVertical className="h-3 w-3 rotate-180" /></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(i, 1)} disabled={i >= steps.length - 1}><GripVertical className="h-3 w-3" /></Button>
                   </div>
                   <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => remove(i)} disabled={i === 0}>
                     <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
                   </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      <Button variant="ghost" size="sm" onClick={add} className="w-full text-xs h-8 border border-dashed border-border/60 hover:bg-accent/5">
        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar Etapa
      </Button>
    </div>
  );
}
}
