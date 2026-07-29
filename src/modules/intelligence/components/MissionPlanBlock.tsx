// Plano de Execução da Missão do Dia — transforma prioridades em tarefas reais.
// Reutiliza o módulo atual de tarefas (origin = mission_center) e o Priority Engine.
// Nenhuma tela nova: este bloco vive dentro da Missão do Dia (Central de Decisão / Dashboard).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Check, Plus, Phone, Users, Target, FileText, Flame, ListChecks, ExternalLink } from "lucide-react";
import {
  buildMissionPlan,
  addMissionTask,
  addFollowupTask,
  getMissionTasksToday,
  type MissionItem,
  type MissionPlan,
  type FollowupPick,
} from "@/modules/intelligence/services/missionPlanner";
import { openLead } from "@/modules/leads/services/openLead";
import { on } from "@/shared/services/eventBus";

const KIND_ICON: Record<MissionItem["kind"], JSX.Element> = {
  calls: <Phone className="h-3.5 w-3.5" />,
  followups: <ListChecks className="h-3.5 w-3.5" />,
  meetings: <Users className="h-3.5 w-3.5" />,
  prospect: <Target className="h-3.5 w-3.5" />,
  script: <FileText className="h-3.5 w-3.5" />,
  lead: <Flame className="h-3.5 w-3.5" />,
};

const BUCKET_META: Record<FollowupPick["bucket"], { label: string; cls: string }> = {
  urgente: { label: "Urgente", cls: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  quente: { label: "Quente", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  cadencia: { label: "Cadência", cls: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
};

export default function MissionPlanBlock() {
  const [tick, setTick] = useState(0);
  const [showAllFollowups, setShowAllFollowups] = useState(false);

  const plan: MissionPlan = useMemo(() => buildMissionPlan(), [tick]);
  const added = useMemo(() => getMissionTasksToday(), [tick]);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const offs = [
      on("TarefaCriada", bump),
      on("TarefaConcluida", bump),
      on("TarefaAtualizada", bump),
      on("LigacaoRegistrada", bump),
      on("MensagemRegistrada", bump),
      on("LeadAtualizado", bump),
      on("LeadMovido", bump),
      on("MetaAtualizada", bump),
    ];
    window.addEventListener("p21:priority-leads-updated", bump);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener("p21:priority-leads-updated", bump);
    };
  }, []);

  const handleAdd = useCallback((item: MissionItem) => {
    addMissionTask(item);
    toast({ title: "Adicionado à Missão", description: item.title });
    setTick((t) => t + 1);
  }, []);

  const handleAddFollowup = useCallback((f: FollowupPick) => {
    addFollowupTask(f);
    toast({ title: "Follow-up na Missão", description: f.company });
    setTick((t) => t + 1);
  }, []);

  const followups = showAllFollowups ? plan.followups : plan.followups.slice(0, 6);

  return (
    <div className="space-y-3">
      {/* Prioridades para hoje */}
      {plan.items.length > 0 && (
        <div className="rounded-md border border-border/60 bg-background/40 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Prioridades para hoje
            </p>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {plan.callsDone}/{plan.callsGoal} ligações registradas
            </span>
          </div>

          <div className="space-y-1.5">
            {plan.items.map((item) => {
              const isAdded = added.has(item.id);
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-2 rounded-md border border-border/50 bg-card/50 px-2.5 py-2"
                >
                  <span className="mt-0.5 text-accent shrink-0">{KIND_ICON[item.kind]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                    {item.bullets.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Priorizar: {item.bullets.join(" · ")}
                      </p>
                    )}
                    {item.reason && (
                      <p className="text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-2">
                        Motivo: {item.reason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.leadId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => openLead(item.leadId!, { tab: "interacoes" })}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={isAdded ? "outline" : "secondary"}
                      disabled={isAdded}
                      className="h-7 px-2 text-[11px] gap-1"
                      onClick={() => handleAdd(item)}
                    >
                      {isAdded ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      {isAdded ? "Na Missão" : "Adicionar à Missão"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Follow-ups inteligentes */}
      {plan.followups.length > 0 && (
        <div className="rounded-md border border-border/60 bg-background/40 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Follow-ups do dia ({plan.followups.length})
            </p>
            {plan.followups.length > 6 && (
              <button
                className="text-[10px] text-accent hover:underline"
                onClick={() => setShowAllFollowups((v) => !v)}
              >
                {showAllFollowups ? "Ver menos" : "Ver todos"}
              </button>
            )}
          </div>

          <div className="space-y-1">
            {followups.map((f) => {
              const ref = `${plan.generatedAt.slice(0, 10)}:followup:${f.leadId}`;
              const isAdded = added.has(ref);
              return (
                <div key={f.leadId} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                  <span className="text-xs">{f.temperature.emoji}</span>
                  <button
                    className="text-xs font-medium text-foreground truncate flex-1 text-left hover:underline"
                    onClick={() => openLead(f.leadId, { tab: "interacoes" })}
                    title="Abrir lead"
                  >
                    {f.company}
                  </button>
                  <Badge variant="outline" className={`text-[10px] hidden sm:inline-flex ${BUCKET_META[f.bucket].cls}`}>
                    {BUCKET_META[f.bucket].label}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground truncate hidden md:block max-w-[32%]">
                    {f.motivo}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isAdded}
                    className="h-6 px-1.5 text-[10px] gap-1 shrink-0"
                    onClick={() => handleAddFollowup(f)}
                  >
                    {isAdded ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {isAdded ? "Na Missão" : "Adicionar"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
