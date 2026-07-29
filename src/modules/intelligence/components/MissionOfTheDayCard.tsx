// Missão do Dia — visão executiva priorizada gerada dinamicamente.
// Reutiliza componentes existentes (Card, Badge, Button) e o Priority Engine.
// Nenhum texto é fixo: todos os números e motivos vêm da operação real.

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Target, Clock, ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import {
  buildDailyMission,
  formatMinutes,
  TIER_META,
  type DailyMission,
} from "@/modules/intelligence/services/priorityEngine";
import { ACTION_META } from "@/modules/intelligence/services/nextBestAction";
import { openLead } from "@/modules/leads/services/openLead";
import DirectorNudge from "@/modules/intelligence/components/DirectorNudge";
import MissionPlanBlock from "@/modules/intelligence/components/MissionPlanBlock";

const toneCls: Record<string, string> = {
  critical: "bg-rose-500/15 text-rose-500 border-rose-500/30",
  warn: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  info: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  good: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
};

export default function MissionOfTheDayCard() {
  const [tick, setTick] = useState(0);
  const mission: DailyMission = useMemo(() => buildDailyMission(), [tick]);

  // Reage às mudanças da operação sem exigir reload (IA/priorização invisível).
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("p21:priority-leads-updated", bump);
    const id = window.setInterval(bump, 120_000);
    return () => {
      window.removeEventListener("p21:priority-leads-updated", bump);
      window.clearInterval(id);
    };
  }, []);

  const top = mission.top;

  return (
    <div className="space-y-2">
      <Card className="overflow-hidden border-l-4 border-l-accent bg-gradient-to-r from-accent/8 via-accent/3 to-transparent">
        <CardContent className="py-4 px-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-accent/15 text-accent flex items-center justify-center shrink-0">
              <Target className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                Missão do Dia
              </p>

              {!top ? (
                <>
                  <p className="text-base font-semibold text-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-accent" />
                    Nenhuma pendência crítica na carteira.
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Melhor uso do tempo agora: abrir uma nova frente de prospecção e alimentar o topo do funil.
                  </p>
                </>
              ) : (
                <>
                  {mission.buckets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {mission.buckets.map((b) => (
                        <Badge key={b.key} variant="outline" className={`text-[11px] ${toneCls[b.tone]}`}>
                          {b.count} {b.label}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 rounded-md border border-border/60 bg-background/50 p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                        Prioridade nº 1
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${TIER_META[top.tier].cls}`}>
                        {TIER_META[top.tier].label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {top.temperature.emoji} {top.temperature.label}
                      </Badge>
                      {top.source === "ia" && (
                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30 gap-1">
                          <Sparkles className="h-2.5 w-2.5" /> IA
                        </Badge>
                      )}
                    </div>

                    <p className="text-base font-semibold text-foreground mt-1 truncate">{top.company}</p>

                    <ul className="mt-1 space-y-0.5">
                      {top.reasons.map((r) => (
                        <li key={r.key} className="text-xs text-muted-foreground flex gap-1.5">
                          <span className="text-accent">•</span>
                          <span className="truncate">{r.label}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        className="bg-accent text-accent-foreground hover:bg-accent/90 gap-1"
                        onClick={() => openLead(top.leadId, { tab: "interacoes" })}
                      >
                        {ACTION_META[top.action].icon} {top.actionLabel}
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                      <span className="text-[11px] text-muted-foreground">{top.actionReason}</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Tempo estimado para resolver as prioridades:{" "}
                    <span className="font-semibold text-foreground">{formatMinutes(mission.estimatedMinutes)}</span>
                    <span className="text-muted-foreground/70">
                      · {mission.totalLeadsWithPriority} lead(s) exigem ação
                    </span>
                  </p>
                </>
              )}
            </div>
          </div>

          {mission.queue.length > 1 && (
            <div className="border-t border-border/60 pt-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
                Sequência recomendada
              </p>
              <div className="space-y-1">
                {mission.queue.slice(1, 5).map((p, i) => (
                  <button
                    key={p.leadId}
                    onClick={() => openLead(p.leadId, { tab: "interacoes" })}
                    className="w-full flex items-center gap-2 text-left rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors"
                  >
                    <span className="text-[11px] text-muted-foreground tabular-nums w-4">{i + 2}.</span>
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${TIER_META[p.tier].dot}`} />
                    <span className="text-xs font-medium text-foreground truncate flex-1">{p.company}</span>
                    <span className="text-[11px] text-muted-foreground truncate hidden sm:block max-w-[45%]">
                      {ACTION_META[p.action].icon} {p.actionLabel}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{p.estimatedMinutes}min</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Plano de execução — prioridades viram tarefas reais (Central de Tarefas) */}
          <MissionPlanBlock />
        </CardContent>
      </Card>

      <DirectorNudge suggestion={mission.nudge} />
    </div>
  );
}
