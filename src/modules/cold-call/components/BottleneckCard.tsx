import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, TrendingUp, TrendingDown, Lightbulb, History as HistoryIcon, Target, MapPin, Clock, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBRL } from "@/modules/financeiro/services/finance";
import {
  analyzeBottleneck, resolveBottleneckPeriod, previousPeriod, compareBottlenecks,
  toSnapshot, type PeriodKey, type Severity, type Bottleneck,
} from "@/modules/cold-call/services/bottleneckEngine";
import { appendBottleneckSnapshot, getBottleneckHistory } from "@/modules/cold-call/services/bottleneckHistory";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today",     label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "last7",     label: "7 dias" },
  { key: "last30",    label: "30 dias" },
  { key: "thisMonth", label: "Este mês" },
  { key: "lastMonth", label: "Mês ant." },
];

const SEVERITY_STYLE: Record<Severity, { badge: string; ring: string; dot: string; label: string }> = {
  critico:    { badge: "bg-red-500/15 text-red-400 border-red-500/40",       ring: "border-l-red-500",    dot: "🔴", label: "Crítico" },
  alto:       { badge: "bg-orange-500/15 text-orange-400 border-orange-500/40", ring: "border-l-orange-500", dot: "🟠", label: "Alto" },
  medio:      { badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40", ring: "border-l-yellow-500", dot: "🟡", label: "Médio" },
  controlado: { badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40", ring: "border-l-emerald-500", dot: "🟢", label: "Controlado" },
};

const CONFIDENCE_DOT: Record<string, string> = { alta: "🟢", media: "🟡", baixa: "🔴" };

export default function BottleneckCard() {
  const [periodKey, setPeriodKey] = useState<PeriodKey>("today");
  const [tick, setTick] = useState(0);

  // Reage a mudanças de dados (cloud sync, novos eventos, etc.)
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("storage", bump);
    window.addEventListener("p21:storage-synced", bump as EventListener);
    return () => {
      window.removeEventListener("storage", bump);
      window.removeEventListener("p21:storage-synced", bump as EventListener);
    };
  }, []);

  const current = useMemo<Bottleneck>(
    () => analyzeBottleneck(resolveBottleneckPeriod(periodKey)),
    [periodKey, tick]
  );
  const prev = useMemo<Bottleneck>(
    () => analyzeBottleneck(previousPeriod(current.period)),
    [current, tick]
  );
  const comparison = useMemo(() => compareBottlenecks(current, prev), [current, prev]);

  // Registra snapshot no histórico quando há diagnóstico confiável.
  useEffect(() => {
    if (current.hasEnoughData) appendBottleneckSnapshot(toSnapshot(current));
  }, [current]);

  const sev = SEVERITY_STYLE[current.main.severity];
  const history = useMemo(() => getBottleneckHistory().slice(-10).reverse(), [tick, current]);

  return (
    <Card className={`border-l-4 ${sev.ring}`}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-accent" />
            Gargalo da Operação
            {current.hasEnoughData && (
              <Badge variant="outline" className={`text-[10px] ${sev.badge}`}>
                {sev.dot} {sev.label}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
              {PERIODS.map((p) => (
                <Button
                  key={p.key} size="sm"
                  variant={periodKey === p.key ? "default" : "ghost"}
                  onClick={() => setPeriodKey(p.key)}
                  className={periodKey === p.key
                    ? "bg-accent text-accent-foreground hover:bg-accent/90 h-6 text-[10px] px-2"
                    : "h-6 text-[10px] px-2"}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1">
                  <HistoryIcon className="h-3 w-3" /> Histórico
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[360px] p-0">
                <div className="p-2 border-b text-xs font-medium">Histórico de gargalos</div>
                <ScrollArea className="max-h-72">
                  {history.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3">Ainda sem registros.</p>
                  ) : (
                    <ul className="divide-y">
                      {history.map((h, i) => (
                        <li key={i} className="p-2 text-[11px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{h.stageLabel}</span>
                            <span className="text-muted-foreground">
                              {new Date(h.timestamp).toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                          <div className="text-muted-foreground">
                            {h.from} → {h.to} · {h.actualPct ?? "—"}% (meta {h.targetPct}%) · {SEVERITY_STYLE[h.severity].dot} {SEVERITY_STYLE[h.severity].label} · {h.periodLabel}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!current.hasEnoughData ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {current.reasonNoData ?? "Sem dados suficientes."}
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-sm text-foreground leading-relaxed">{current.explanation}</p>
              {comparison && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  {comparison.includes("melhorou")
                    ? <TrendingUp className="h-3 w-3 text-emerald-500" />
                    : <TrendingDown className="h-3 w-3 text-orange-500" />}
                  {comparison}
                </p>
              )}
            </div>

            {/* Métricas do gargalo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <MiniStat label="Conversão atual" value={`${(current.main.actualPct ?? 0).toFixed(1).replace(".", ",")}%`} />
              <MiniStat label="Meta" value={`${current.main.targetPct}%`} icon={<Target className="h-3 w-3" />} />
              <MiniStat label="Oportunidades perdidas" value={current.main.lostOpportunities.toString()} />
              <MiniStat label="Confiança" value={`${CONFIDENCE_DOT[current.main.confidence]} ${current.main.confidence}`} />
            </div>

            {/* Impacto */}
            {current.impact && current.impact.additionalDealsPerMonth > 0 && (
              <div className="rounded-md border border-accent/30 bg-accent/5 p-3 space-y-1">
                <div className="text-[11px] uppercase tracking-wide text-accent font-semibold">Impacto se corrigir</div>
                <p className="text-sm text-foreground">
                  Se essa conversão subir de{" "}
                  <strong>{(current.main.actualPct ?? 0).toFixed(1).replace(".", ",")}%</strong>{" "}
                  para <strong>{current.main.targetPct}%</strong>, sua projeção passa de{" "}
                  <strong>{current.impact.currentDealsProjected.toString().replace(".", ",")}</strong>{" "}
                  para aproximadamente{" "}
                  <strong>{current.impact.projectedDealsIfFixed.toString().replace(".", ",")}</strong>{" "}
                  vendas mensais.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Ganho potencial: {formatBRL(current.impact.additionalRevenuePerMonth)}/mês.
                </p>
              </div>
            )}

            {/* Recomendações */}
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1">
                <Lightbulb className="h-3 w-3" /> Recomendações
              </div>
              <ul className="space-y-1">
                {current.recommendations.map((r, i) => (
                  <li key={i} className="text-xs text-foreground flex gap-2">
                    <span className="text-accent">›</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Dimensões */}
            {current.dimensions.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1">
                  <Layers className="h-3 w-3" /> Onde o problema aparece
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {current.dimensions.map((d, i) => (
                    <div key={i} className="rounded-md border p-2 text-xs flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0">
                        {d.dimension === "Cidade" && <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />}
                        {d.dimension === "Horário" && <Clock className="h-3 w-3 text-muted-foreground shrink-0" />}
                        {(d.dimension === "Nicho" || d.dimension === "Campanha") && <Layers className="h-3 w-3 text-muted-foreground shrink-0" />}
                        <span className="text-muted-foreground">{d.dimension}:</span>
                        <span className="font-medium truncate">{d.value}</span>
                      </span>
                      <span className={`tabular-nums shrink-0 ${d.vsGlobal >= 0 ? "text-emerald-500" : "text-orange-500"}`}>
                        {d.actualPct.toFixed(1).replace(".", ",")}% ({d.vsGlobal >= 0 ? "+" : ""}{d.vsGlobal})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ranking rápido de todas as etapas */}
            <div className="pt-1 border-t">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
                Todas as conversões
              </div>
              <div className="space-y-1">
                {current.allStages.map((s) => {
                  const style = SEVERITY_STYLE[s.severity];
                  return (
                    <div key={s.key} className="flex items-center gap-2 text-[11px]">
                      <span className="w-40 truncate text-muted-foreground">{s.from} → {s.to}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-sm overflow-hidden">
                        <div
                          className={
                            s.severity === "critico" ? "h-full rounded-sm bg-red-500" :
                            s.severity === "alto"    ? "h-full rounded-sm bg-orange-500" :
                            s.severity === "medio"   ? "h-full rounded-sm bg-yellow-500" :
                                                       "h-full rounded-sm bg-emerald-500"
                          }
                          style={{ width: `${Math.min(100, s.actualPct ?? 0)}%` }}
                        />
                      </div>
                      <span className="w-14 text-right tabular-nums text-foreground">
                        {s.actualPct != null ? `${s.actualPct.toFixed(1).replace(".", ",")}%` : "—"}
                      </span>
                      <span className="w-14 text-right tabular-nums text-muted-foreground">
                        meta {s.targetPct}%
                      </span>
                      <span className="w-4 text-right">{style.dot}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
