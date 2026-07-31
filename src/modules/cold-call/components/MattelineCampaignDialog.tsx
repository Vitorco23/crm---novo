import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Phone, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import type { Lead } from "@/shared/services/store";
import {
  ATTEMPT_OPTIONS, attemptLabel, buildCampaignName, selectCampaignLeads,
  runMattelineCampaign, type CampaignResult,
} from "@/modules/cold-call/services/mattelineCampaign";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filteredLeads: Lead[];
  niches: string[];
  cities: string[];
  onDone?: () => void;
}

export default function MattelineCampaignDialog({
  open, onOpenChange, filteredLeads, niches, cities, onDone,
}: Props) {
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<CampaignResult | null>(null);

  const autoName = useMemo(
    () => buildCampaignName({ niches, cities, attempt }),
    [niches, cities, attempt]
  );

  useEffect(() => {
    if (!nameTouched) setName(autoName);
  }, [autoName, nameTouched]);

  useEffect(() => {
    if (open) {
      setRunning(false);
      setResult(null);
      setProgress({ done: 0, total: 0 });
      setNameTouched(false);
      setName(autoName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const targets = useMemo(
    () => selectCampaignLeads(filteredLeads, attempt),
    [filteredLeads, attempt]
  );

  const states = useMemo(
    () => Array.from(new Set(filteredLeads.map((l) => (l as Lead & { state?: string }).state).filter(Boolean))) as string[],
    [filteredLeads]
  );

  async function handleConfirm() {
    if (targets.length === 0 || running) return;
    setRunning(true);
    setProgress({ done: 0, total: targets.length });
    const res = await runMattelineCampaign({
      leads: targets,
      campaignName: name.trim() || autoName,
      attempt,
      onProgress: (done, total) => setProgress({ done, total }),
    });
    setResult(res);
    setRunning(false);
    onDone?.();
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!running) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4" /> Criar Campanha Matteline
          </DialogTitle>
          <DialogDescription>
            Os contatos são enviados ao Matteline. A campanha continua sendo iniciada manualmente lá.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-accent" /> Campanha criada com sucesso.
            </div>
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div><strong>{result.sent}</strong> contatos enviados.</div>
              <div className={result.errors > 0 ? "text-destructive" : undefined}>
                <strong>{result.errors}</strong> erros.
              </div>
              <div className="text-muted-foreground text-xs">
                Tempo gasto: {(result.elapsedMs / 1000).toFixed(1)}s
              </div>
              <div className="text-muted-foreground text-xs">Campanha: {result.campaignName}</div>
            </div>
          </div>
        ) : running ? (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progress.done === 0 ? "Preparando campanha..." : `${progress.done} / ${progress.total} enviados`}
            </div>
            <Progress value={pct} />
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome da campanha</Label>
              <Input
                value={name}
                onChange={(e) => { setNameTouched(true); setName(e.target.value); }}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Origem dos Leads</Label>
              <RadioGroup
                value={String(attempt)}
                onValueChange={(v) => setAttempt(Number(v))}
                className="grid grid-cols-2 gap-1"
              >
                {ATTEMPT_OPTIONS.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-xs rounded px-2 py-1.5 hover:bg-accent/10 cursor-pointer">
                    <RadioGroupItem value={String(o.value)} id={`attempt-${o.value}`} />
                    {o.label}
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="rounded-md border p-3 space-y-1 text-sm">
              <div className="text-base font-semibold">{targets.length} Leads</div>
              {niches.length > 0 && <div className="text-muted-foreground">{niches.join(", ")}</div>}
              {(cities.length > 0 || states.length > 0) && (
                <div className="text-muted-foreground">
                  {[cities.join(", "), states.join(", ")].filter(Boolean).join(" - ")}
                </div>
              )}
              <div className="text-muted-foreground">{attemptLabel(attempt)}</div>
              {targets.length === 0 && (
                <div className="flex items-center gap-1.5 text-xs text-destructive pt-1">
                  <AlertTriangle className="h-3 w-3" />
                  Nenhum lead com telefone válido nesta tentativa.
                </div>
              )}
              {targets.length > 0 && targets.length !== filteredLeads.length && (
                <Badge variant="outline" className="text-[10px] mt-1">
                  {filteredLeads.length} filtrados · {targets.length} elegíveis
                </Badge>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          ) : (
            <>
              <Button variant="ghost" disabled={running} onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button disabled={running || targets.length === 0} onClick={handleConfirm}>
                <Phone className="h-3.5 w-3.5 mr-1.5" /> Criar campanha
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
