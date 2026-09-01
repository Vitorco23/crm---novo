import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { computeRealConversion, type RealPeriod } from "@/modules/metas/services/realConversion";

const PERIODS: { value: RealPeriod; label: string }[] = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
  { value: 0, label: "Tudo" },
];

export interface RealConversionPanelProps {
  /** Taxas estimadas configuradas pelo usuário, para comparação */
  estimates: Record<string, number>;
  onApplyReal?: (rates: Record<string, number>) => void;
}

export default function RealConversionPanel({ estimates, onApplyReal }: RealConversionPanelProps) {
  const [period, setPeriod] = useState<RealPeriod>(30);
  const [tick, setTick] = useState(0);

  // Recalcula em tempo real quando qualquer dado do CRM muda.
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("p21:data-changed", bump);
    return () => window.removeEventListener("p21:data-changed", bump);
  }, []);

  const report = useMemo(() => computeRealConversion(period), [period, tick]);

  const applicable = report.rates.filter((r) => r.rate !== null);

  return (
    <Card className="mission-card shadow-none border-accent/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-accent" /> Taxas Reais (dados do CRM)
          </CardTitle>
          <div className="flex items-center gap-1">
            {PERIODS.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant={period === p.value ? "default" : "ghost"}
                className="h-6 px-2 text-[10px]"
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {!report.hasData ? (
          <p className="text-xs text-muted-foreground">
            Ainda não há dados suficientes no período. Registre sessões de Pomodoro e movimente
            leads no pipeline para calcular suas taxas reais.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-1">
              <VolumeChip label="Ligações" value={report.volumes.calls} />
              <VolumeChip label="Conexões" value={report.volumes.connections} />
              <VolumeChip label="Decisores" value={report.volumes.decisionMakers} />
              <VolumeChip label="Marcadas" value={report.volumes.meetingsScheduled} />
              <VolumeChip label="Realizadas" value={report.volumes.meetingsHeld} />
              <VolumeChip label="Fechamentos" value={report.volumes.closes} />
            </div>

            {report.rates.map((r) => {
              const est = estimates[r.key] ?? 0;
              const diff = r.rate === null ? null : r.rate - est;
              return (
                <div key={r.key} className="flex items-center gap-2 text-xs">
                  <span className="w-48 text-muted-foreground truncate">{r.label}</span>
                  <div className="flex-1 h-3 bg-muted rounded-sm overflow-hidden relative">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{ width: `${Math.min(r.rate ?? 0, 100)}%` }}
                    />
                    {est > 0 && (
                      <div
                        className="absolute top-0 h-full w-0.5 bg-foreground/50"
                        style={{ left: `${Math.min(est, 100)}%` }}
                        title={`Estimativa: ${est}%`}
                      />
                    )}
                  </div>
                  <span className="w-14 text-right font-bold text-accent tabular-nums">
                    {r.rate === null ? "—" : `${r.rate.toFixed(1)}%`}
                  </span>
                  <span className="w-16 text-right text-[10px] text-muted-foreground tabular-nums">
                    {r.denominator > 0 ? `${r.numerator}/${r.denominator}` : "sem base"}
                  </span>
                  <DeltaBadge diff={diff} />
                </div>
              );
            })}

            {onApplyReal && applicable.length > 0 && (
              <div className="pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    const next: Record<string, number> = {};
                    applicable.forEach((r) => {
                      next[r.key] = Math.round((r.rate as number) * 10) / 10;
                    });
                    onApplyReal(next);
                  }}
                >
                  Usar taxas reais na calculadora
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function VolumeChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-[hsl(var(--mission-surface-2))] px-2 py-1.5 text-center">
      <p className="text-[9px] text-muted-foreground truncate">{label}</p>
      <p className="text-sm font-bold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

function DeltaBadge({ diff }: { diff: number | null }) {
  if (diff === null) {
    return <span className="w-14" />;
  }
  const rounded = Math.round(diff * 10) / 10;
  const neutral = Math.abs(rounded) < 0.5;
  const Icon = neutral ? Minus : rounded > 0 ? ArrowUp : ArrowDown;
  const cls = neutral
    ? "bg-muted text-muted-foreground border-border"
    : rounded > 0
      ? "bg-accent/20 text-accent border-accent/40"
      : "bg-destructive/20 text-destructive border-destructive/40";
  return (
    <Badge variant="outline" className={`w-16 justify-center gap-0.5 text-[9px] ${cls}`}>
      <Icon className="h-2.5 w-2.5" />
      {neutral ? "igual" : `${Math.abs(rounded)}p`}
    </Badge>
  );
}
