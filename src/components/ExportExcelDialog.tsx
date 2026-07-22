import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Download, Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  exportWorkbook, resolvePeriod, PERIOD_LABELS,
  type PeriodPreset, type SheetSpec, type DateRange,
} from "@/lib/exportEngine";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  moduleName: string;
  moduleSlug: string;
  build: (range: DateRange) => SheetSpec[];
  defaultPreset?: PeriodPreset;
  trigger?: React.ReactNode;
}

export default function ExportExcelDialog({
  moduleName, moduleSlug, build, defaultPreset = "last30", trigger,
}: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<PeriodPreset>(defaultPreset);
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const [busy, setBusy] = useState(false);

  const range = useMemo(
    () => resolvePeriod(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR");

  const doExport = () => {
    setBusy(true);
    // Rendering hint to browser
    setTimeout(() => {
      try {
        const sheets = build(range);
        exportWorkbook(
          {
            crmName: "Performance21 CRM",
            moduleName,
            period: range,
            user: user?.email || undefined,
          },
          sheets,
          moduleSlug,
        );
        toast({
          title: "Exportação concluída",
          description: `${sheets.length + 1} abas geradas para o período ${range.label.toLowerCase()}.`,
        });
        setOpen(false);
      } catch (e) {
        console.error(e);
        toast({ title: "Falha na exportação", description: String(e), variant: "destructive" });
      } finally {
        setBusy(false);
      }
    }, 50);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" className="gap-1.5">
            <Download className="h-4 w-4" /> Exportar Excel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar {moduleName} para Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Período</label>
            <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => (
                  <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Data inicial</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start mt-1 font-normal">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {customStart ? fmt(customStart) : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customStart}
                      onSelect={setCustomStart} initialFocus
                      className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Data final</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start mt-1 font-normal">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {customEnd ? fmt(customEnd) : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customEnd}
                      onSelect={setCustomEnd} initialFocus
                      className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          <div className="rounded-md bg-muted/40 border p-3 text-xs text-muted-foreground">
            Período que será exportado: <strong className="text-foreground">{fmt(range.start)}</strong> até{" "}
            <strong className="text-foreground">{fmt(range.end)}</strong>. Arquivo em <code>.xlsx</code> com
            múltiplas abas, cabeçalhos formatados e filtros automáticos.
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={doExport} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Exportar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
