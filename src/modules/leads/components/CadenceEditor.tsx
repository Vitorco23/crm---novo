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
  return attempt === 0 ? "Novo Lead (D0)" : `Tentativa ${attempt}`;
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
      const last = prev[prev.length - 1];
      const nextDay = last ? last.day + 1 : 1;
      const nextStep: CadenceStep = {
        day: nextDay, attempt: prev.length,
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">{label} · {steps.length} etapas</p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar padrão</Button>
          <Button size="sm" onClick={save} disabled={!dirty} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Save className="h-3.5 w-3.5 mr-1" /> Salvar
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {steps.map((s, i) => {
          const current = currentAttempt === s.attempt;
          return (
            <div key={i} className={`rounded-md border p-3 space-y-2 ${current ? "border-accent/60 bg-accent/5" : "border-border/60 bg-muted/20"}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button type="button" onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i <= 1} aria-label="Mover para cima">▲</button>
                    <button type="button" onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0 || i === steps.length - 1} aria-label="Mover para baixo">▼</button>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{stepLabel(s.attempt)}</Badge>
                  {current && <Badge className="bg-accent text-accent-foreground text-[10px]">Atual</Badge>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(i)} disabled={i === 0} className="h-7 text-destructive hover:text-destructive disabled:opacity-30">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Dia (D+)</Label>
                  <Input type="number" min={0} value={s.day}
                    onChange={(e) => update(i, { day: Math.max(0, parseInt(e.target.value || "0", 10)) })}
                    className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Canal</Label>
                  <Select value={s.channel} onValueChange={(v) => update(i, { channel: v as CadenceChannel })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Tempo estimado (min)</Label>
                  <Input type="number" min={1} value={s.estimatedMinutes}
                    onChange={(e) => update(i, { estimatedMinutes: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                    className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Objetivo</Label>
                  <Input value={s.objective} onChange={(e) => update(i, { objective: e.target.value })} className="h-8 text-xs" />
                </div>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground">Próxima ação (resumo)</Label>
                <Input value={s.nextAction} onChange={(e) => update(i, { nextAction: e.target.value })} className="h-8 text-xs" />
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground">Script</Label>
                <Textarea rows={4} value={s.script} onChange={(e) => update(i, { script: e.target.value })} className="text-xs font-mono" />
              </div>
            </div>
          );
        })}
      </div>

      <Button variant="outline" onClick={add} className="w-full">
        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar etapa
      </Button>
    </div>
  );
}
