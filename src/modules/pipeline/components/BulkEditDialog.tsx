import { useState } from "react";
import { type Lead, type ICPStars, updateLeadsBatch } from "@/shared/services/store";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Star } from "lucide-react";
import { toast } from "sonner";

type FieldKey =
  | "niche"
  | "city"
  | "icpStars"
  | "runsAds"
  | "serviceType"
  | "contractValue"
  | "notes";

const FIELD_LABELS: Record<FieldKey, string> = {
  niche: "Nicho",
  city: "Cidade",
  icpStars: "ICP (estrelas)",
  runsAds: "Roda Anúncios",
  serviceType: "Tipo de Serviço",
  contractValue: "Valor do Contrato (R$)",
  notes: "Anotações (substitui)",
};

export default function BulkEditDialog({
  open,
  onOpenChange,
  selectedIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedIds: Set<string>;
  onDone: () => void;
}) {
  const [enabled, setEnabled] = useState<Record<FieldKey, boolean>>({
    niche: false, city: false, icpStars: false, runsAds: false,
    serviceType: false, contractValue: false, notes: false,
  });
  const [values, setValues] = useState<{
    niche: string; city: string; icpStars: ICPStars; runsAds: boolean;
    serviceType: string; contractValue: string; notes: string;
  }>({
    niche: "", city: "", icpStars: 2, runsAds: false,
    serviceType: "", contractValue: "", notes: "",
  });

  const count = selectedIds.size;

  const toggle = (k: FieldKey) => setEnabled((p) => ({ ...p, [k]: !p[k] }));

  const apply = () => {
    const updates: Partial<Lead> = {};
    if (enabled.niche) updates.niche = values.niche;
    if (enabled.city) updates.city = values.city;
    if (enabled.icpStars) updates.icpStars = values.icpStars;
    if (enabled.runsAds) updates.runsAds = values.runsAds;
    if (enabled.serviceType) updates.serviceType = values.serviceType;
    if (enabled.contractValue) {
      const n = parseFloat(values.contractValue.replace(",", "."));
      if (!isNaN(n)) updates.contractValue = n;
    }
    if (enabled.notes) updates.notes = values.notes;

    if (Object.keys(updates).length === 0) {
      toast.error("Selecione ao menos um campo para alterar");
      return;
    }

    updateLeadsBatch(selectedIds, updates);
    toast.success(`${count} lead(s) atualizado(s)`);
    onOpenChange(false);
    onDone();
    // reset
    setEnabled({
      niche: false, city: false, icpStars: false, runsAds: false,
      serviceType: false, contractValue: false, notes: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar {count} lead{count > 1 ? "s" : ""} em massa</DialogTitle>
          <DialogDescription>
            Marque os campos que deseja alterar. Apenas os campos marcados serão sobrescritos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Niche */}
          <FieldRow enabled={enabled.niche} onToggle={() => toggle("niche")} label={FIELD_LABELS.niche}>
            <Input value={values.niche} onChange={(e) => setValues({ ...values, niche: e.target.value })}
              placeholder="Ex: Restaurante" disabled={!enabled.niche} />
          </FieldRow>

          {/* City */}
          <FieldRow enabled={enabled.city} onToggle={() => toggle("city")} label={FIELD_LABELS.city}>
            <Input value={values.city} onChange={(e) => setValues({ ...values, city: e.target.value })}
              placeholder="Ex: São Paulo" disabled={!enabled.city} />
          </FieldRow>

          {/* ICP */}
          <FieldRow enabled={enabled.icpStars} onToggle={() => toggle("icpStars")} label={FIELD_LABELS.icpStars}>
            <div className="flex gap-1">
              {([1, 2, 3] as ICPStars[]).map((s) => (
                <button key={s} type="button" disabled={!enabled.icpStars}
                  onClick={() => setValues({ ...values, icpStars: s })}>
                  <Star className={`h-5 w-5 ${s <= values.icpStars ? "fill-accent text-accent" : "text-muted-foreground/30"}`} />
                </button>
              ))}
            </div>
          </FieldRow>

          {/* Runs ads */}
          <FieldRow enabled={enabled.runsAds} onToggle={() => toggle("runsAds")} label={FIELD_LABELS.runsAds}>
            <Switch checked={values.runsAds} onCheckedChange={(v) => setValues({ ...values, runsAds: v })}
              disabled={!enabled.runsAds} />
          </FieldRow>

          {/* Service type */}
          <FieldRow enabled={enabled.serviceType} onToggle={() => toggle("serviceType")} label={FIELD_LABELS.serviceType}>
            <Input value={values.serviceType} onChange={(e) => setValues({ ...values, serviceType: e.target.value })}
              placeholder="Ex: Tráfego Pago" disabled={!enabled.serviceType} />
          </FieldRow>

          {/* Contract value */}
          <FieldRow enabled={enabled.contractValue} onToggle={() => toggle("contractValue")} label={FIELD_LABELS.contractValue}>
            <Input type="number" value={values.contractValue}
              onChange={(e) => setValues({ ...values, contractValue: e.target.value })}
              placeholder="3000" disabled={!enabled.contractValue} />
          </FieldRow>

          {/* Notes */}
          <FieldRow enabled={enabled.notes} onToggle={() => toggle("notes")} label={FIELD_LABELS.notes}>
            <Input value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })}
              placeholder="Substitui as anotações atuais" disabled={!enabled.notes} />
          </FieldRow>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={apply} className="bg-accent text-accent-foreground hover:bg-accent/90">
            Aplicar a {count} lead{count > 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({
  enabled, onToggle, label, children,
}: {
  enabled: boolean; onToggle: () => void; label: string; children: React.ReactNode;
}) {
  return (
    <div className={`flex items-start gap-3 p-2 rounded-md border ${enabled ? "border-accent/50 bg-accent/5" : "border-border"}`}>
      <Checkbox checked={enabled} onCheckedChange={onToggle} className="mt-1" />
      <div className="flex-1 space-y-1">
        <Label className="text-xs">{label}</Label>
        {children}
      </div>
    </div>
  );
}
