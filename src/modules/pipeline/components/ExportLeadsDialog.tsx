import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { Lead } from "@/shared/services/store";
import {
  ATTEMPT_FILTER_OPTIONS, buildDialerRows, buildExportFilename, downloadCrmXlsx,
  downloadDialerXlsx, filterByAttempt, type AttemptFilter, type ExportFormat,
} from "@/modules/pipeline/services/dialerExport";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filteredLeads: Lead[];
  niches: string[];
  cities: string[];
  showAttemptFilter?: boolean;
}

export default function ExportLeadsDialog({
  open, onOpenChange, filteredLeads, niches, cities, showAttemptFilter = true,
}: Props) {
  const [format, setFormat] = useState<ExportFormat>("dialer");
  const [attempt, setAttempt] = useState<AttemptFilter>("all");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);

  const targets = useMemo(
    () => (showAttemptFilter ? filterByAttempt(filteredLeads, attempt) : filteredLeads),
    [filteredLeads, attempt, showAttemptFilter]
  );

  const { rows, stats } = useMemo(() => buildDialerRows(targets), [targets]);

  const autoName = useMemo(
    () => buildExportFilename({ niches, cities, attempt: showAttemptFilter ? attempt : "all" }),
    [niches, cities, attempt, showAttemptFilter]
  );

  useEffect(() => {
    if (!nameTouched) setName(autoName);
  }, [autoName, nameTouched]);

  useEffect(() => {
    if (open) {
      setNameTouched(false);
      setName(autoName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canExport = format === "crm" ? targets.length > 0 : rows.length > 0;

  function handleExport() {
    const filename = name.trim() || autoName;
    if (format === "crm") {
      const n = downloadCrmXlsx(targets, filename);
      toast.success(`${n} lead(s) exportado(s)`);
    } else {
      downloadDialerXlsx(rows, filename);
      toast.success(`${rows.length} contato(s) exportado(s) para o discador`);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-4 w-4" /> Exportar Leads
          </DialogTitle>
          <DialogDescription>
            Exporta apenas os leads atualmente filtrados no pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Formato da exportação</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as ExportFormat)}
              className="grid gap-1"
            >
              <label className="flex items-center gap-2 text-xs rounded px-2 py-1.5 hover:bg-accent/10 cursor-pointer">
                <RadioGroupItem value="crm" id="fmt-crm" /> Exportação CRM
              </label>
              <label className="flex items-center gap-2 text-xs rounded px-2 py-1.5 hover:bg-accent/10 cursor-pointer">
                <RadioGroupItem value="dialer" id="fmt-dialer" /> Exportação Discador (Matteline)
              </label>
            </RadioGroup>
          </div>

          {showAttemptFilter && (
            <div className="space-y-1.5">
              <Label className="text-xs">Tentativa</Label>
              <Select value={attempt} onValueChange={(v) => setAttempt(v as AttemptFilter)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecione a tentativa" />
                </SelectTrigger>
                <SelectContent>
                  {ATTEMPT_FILTER_OPTIONS.filter((o) => o.value !== "all").map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                  <SelectSeparator />
                  <SelectItem value="all">Todas as Tentativas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Nome do arquivo</Label>
            <Input
              value={name}
              onChange={(e) => { setNameTouched(true); setName(e.target.value); }}
              className="h-9 text-sm"
            />
          </div>

          <div className="rounded-md border p-3 space-y-1 text-sm">
            <div><strong>{stats.total}</strong> Leads encontrados</div>
            {format === "dialer" ? (
              <>
                <div><strong>{stats.valid}</strong> Telefones válidos</div>
                <div className={stats.invalid > 0 ? "text-destructive" : undefined}>
                  <strong>{stats.invalid}</strong> Telefones inválidos
                </div>
                <div><strong>{stats.duplicates}</strong> Duplicados</div>
                {(stats.invalid > 0 || stats.duplicates > 0) && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                    <AlertTriangle className="h-3 w-3" />
                    {stats.invalid + stats.duplicates} lead(s) não serão exportados.
                  </div>
                )}
                <div className="text-muted-foreground text-xs pt-1">
                  Colunas: Telefone, Nome, E-mail, Empresa.
                </div>
              </>
            ) : (
              <div className="text-muted-foreground text-xs">
                Colunas: Empresa, Telefone, Cidade, Nicho.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!canExport} onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
