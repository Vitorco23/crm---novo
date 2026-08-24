// Missão do Dia — execução operacional diária do Sistema Operacional Comercial.
// Consome exclusivamente o resultado do priorityEngine (via missionPlanner)
// e o estado de execução persistido em missionStore. Nenhum motor novo.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import {
  BarChart3,
  Check,
  Clock,
  Compass,
  ExternalLink,
  FileText,
  Flame,
  ListChecks,
  Phone,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Undo2,
  Users,
} from "lucide-react";
import { PageContainer, PageHeader } from "@/shared/components/shell";
import {
  MISSION_UPDATED_EVENT,
  completeMissionEntry,
  getMissionEntries,
  getMissionProgress,
  removeMissionEntry,
  reopenMissionEntry,
  resetMissionDay,
  runOneTimeMissionReset,
  type MissionEntry,
} from "@/modules/intelligence/services/missionStore";
import {
  addFollowupTask,
  addMissionTask,
  buildMissionPlan,
  type FollowupPick,
  type MissionItem,
} from "@/modules/intelligence/services/missionPlanner";
import { OperationalCapacityCard } from "@/modules/intelligence/components/OperationalCapacityCard";
import ColdCallOpsPanel from "@/modules/cold-call/components/ColdCallOpsPanel";
import { openLead } from "@/modules/leads/services/openLead";
import { on } from "@/shared/services/eventBus";
import { PRIORITY_CLASSES, PRIORITY_LABEL, type TaskPriority } from "@/modules/leads/services/leadTasks";
import { formatMinutes } from "@/modules/intelligence/services/priorityEngine";

const KIND_ICON: Record<MissionEntry["kind"], JSX.Element> = {
  calls: <Phone className="h-4 w-4" />,
  followups: <ListChecks className="h-4 w-4" />,
  meetings: <Users className="h-4 w-4" />,
  prospect: <Target className="h-4 w-4" />,
  script: <FileText className="h-4 w-4" />,
  lead: <Flame className="h-4 w-4" />,
};

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  urgente: 0,
  alta: 1,
  media: 2,
  baixa: 3,
};

type ActionSource = "mission" | "suggestion" | "followup";

type CommandCenterAction = {
  id: string;
  title: string;
  reason: string;
  priority: TaskPriority;
  kind: MissionEntry["kind"];
  estimatedMinutes: number;
  leadId?: string | null;
  company?: string | null;
  recommendedTime?: string | null;
  badges: string[];
  source: ActionSource;
  missionEntry?: MissionEntry;
  missionItem?: MissionItem;
  followup?: FollowupPick;
};

const SOURCE_LABEL: Record<ActionSource, string> = {
  mission: "Na missão",
  followup: "Follow-up inteligente",
  suggestion: "Planejamento do dia",
};

const SOURCE_REASON: Record<ActionSource, string> = {
  mission: "Ação já selecionada para executar hoje.",
  followup: "Lead puxado da cadência e dos sinais comerciais do dia.",
  suggestion: "Ação recomendada pelo planejamento operacional.",
};

function sourceLabel(action: CommandCenterAction) {
  return SOURCE_LABEL[action.source];
}

function evidenceLine(action: CommandCenterAction) {
  const base = action.reason || SOURCE_REASON[action.source];
  const time = action.recommendedTime ? ` Melhor horário: ${action.recommendedTime}.` : "";
  return `${base}${time}`;
}

function missionEntryToAction(entry: MissionEntry): CommandCenterAction {
  return {
    id: `mission:${entry.id}`,
    title: entry.title,
    reason: entry.reason || SOURCE_REASON.mission,
    priority: entry.priority,
    kind: entry.kind,
    estimatedMinutes: entry.estimatedMinutes,
    leadId: entry.leadId,
    company: entry.company,
    recommendedTime: entry.recommendedTime,
    badges: [entry.company || "", entry.niche || "", entry.city || ""].filter(Boolean),
    source: "mission",
    missionEntry: entry,
  };
}

function missionItemToAction(item: MissionItem): CommandCenterAction {
  return {
    id: `suggestion:${item.id}`,
    title: item.title,
    reason: item.reason || SOURCE_REASON.suggestion,
    priority: item.priority,
    kind: item.kind,
    estimatedMinutes: item.estimatedMinutes,
    leadId: item.leadId,
    company: item.company,
    recommendedTime: item.recommendedTime,
    badges: [item.company || "", item.niche || "", item.city || "", ...item.bullets.slice(0, 1)].filter(Boolean),
    source: "suggestion",
    missionItem: item,
  };
}

function followupToAction(followup: FollowupPick): CommandCenterAction {
  const priority: TaskPriority = followup.bucket === "urgente" ? "urgente" : followup.bucket === "quente" ? "alta" : "media";
  return {
    id: `followup:${followup.leadId}`,
    title: `${followup.action} — ${followup.company}`,
    reason: followup.motivo || SOURCE_REASON.followup,
    priority,
    kind: "lead",
    estimatedMinutes: followup.priority?.estimatedMinutes ?? 8,
    leadId: followup.leadId,
    company: followup.company,
    badges: [followup.stage, followup.temperature.label].filter(Boolean),
    source: "followup",
    followup,
  };
}

function orderCommandActions(a: CommandCenterAction, b: CommandCenterAction) {
  const byPriority = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
  if (byPriority !== 0) return byPriority;
  const sourceWeight = { mission: 0, followup: 1, suggestion: 2 } as const;
  const bySource = sourceWeight[a.source] - sourceWeight[b.source];
  if (bySource !== 0) return bySource;
  return b.estimatedMinutes - a.estimatedMinutes;
}

export default function MissaoDoDia() {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => { runOneTimeMissionReset(); }, []);

  useEffect(() => {
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
    window.addEventListener(MISSION_UPDATED_EVENT, bump);
    window.addEventListener("p21:priority-leads-updated", bump);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener(MISSION_UPDATED_EVENT, bump);
      window.removeEventListener("p21:priority-leads-updated", bump);
    };
  }, [bump]);

  const entries = useMemo(() => getMissionEntries(), [tick]);
  const progress = useMemo(() => getMissionProgress(), [tick]);
  const plan = useMemo(() => buildMissionPlan(), [tick]);

  const inMission = useMemo(() => new Set(entries.map((e) => e.ref)), [entries]);
  const pending = entries.filter((e) => e.status === "pendente");
  const done = entries.filter((e) => e.status === "concluida");

  const suggestions = plan.items.filter((i) => !inMission.has(i.id));
  const followupSuggestions = plan.followups.filter(
    (f) => !inMission.has(`${plan.generatedAt.slice(0, 10)}:followup:${f.leadId}`),
  );

  const commandActions = useMemo(() => {
    const actions = [
      ...pending.map(missionEntryToAction),
      ...followupSuggestions.slice(0, 8).map(followupToAction),
      ...suggestions.map(missionItemToAction),
    ];

    const unique = new Map<string, CommandCenterAction>();
    for (const action of actions.sort(orderCommandActions)) {
      const key = action.leadId ? `lead:${action.leadId}` : action.id;
      if (!unique.has(key)) unique.set(key, action);
    }
    return Array.from(unique.values()).slice(0, 5);
  }, [pending, followupSuggestions, suggestions]);

  const primaryAction = commandActions[0];

  const handleComplete = (entry: MissionEntry) => {
    completeMissionEntry(entry.id);
    toast({ title: "Atividade concluída", description: entry.title });
    bump();
  };

  const handleAddSuggestion = (item: MissionItem) => {
    addMissionTask(item);
    toast({ title: "Adicionado à missão", description: item.title });
    bump();
  };

  const handleAddFollowup = (followup: FollowupPick) => {
    addFollowupTask(followup);
    toast({ title: "Follow-up adicionado", description: followup.company });
    bump();
  };

  const handleReset = () => {
    resetMissionDay();
    toast({ title: "Missão do dia reiniciada", description: "Nenhum dado comercial foi alterado." });
    bump();
  };

  const renderActionButtons = (action: CommandCenterAction, compact = false) => (
    <div className="flex items-center gap-1 shrink-0">
      {action.leadId && (
        <Button
          size="sm"
          variant={compact ? "ghost" : "outline"}
          className={`${compact ? "h-7 px-2 text-[11px]" : ""} gap-1`}
          onClick={() => openLead(action.leadId!, { tab: "interacoes" })}
        >
          <ExternalLink className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} /> {compact ? "Abrir" : "Abrir lead"}
        </Button>
      )}
      {action.source === "mission" && action.missionEntry && (
        <Button
          size="sm"
          variant={compact ? "secondary" : "default"}
          className={`${compact ? "h-7 px-2 text-[11px]" : ""} gap-1 ${compact ? "" : "bg-accent text-accent-foreground hover:bg-accent/90"}`}
          onClick={() => handleComplete(action.missionEntry!)}
        >
          <Check className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} /> Concluir
        </Button>
      )}
      {action.source === "suggestion" && action.missionItem && (
        <Button
          size="sm"
          variant={compact ? "secondary" : "default"}
          className={`${compact ? "h-7 px-2 text-[11px]" : ""} gap-1 ${compact ? "" : "bg-accent text-accent-foreground hover:bg-accent/90"}`}
          onClick={() => handleAddSuggestion(action.missionItem!)}
        >
          <Plus className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} /> {compact ? "Missão" : "Colocar na missão"}
        </Button>
      )}
      {action.source === "followup" && action.followup && (
        <Button
          size="sm"
          variant={compact ? "secondary" : "default"}
          className={`${compact ? "h-7 px-2 text-[11px]" : ""} gap-1 ${compact ? "" : "bg-accent text-accent-foreground hover:bg-accent/90"}`}
          onClick={() => handleAddFollowup(action.followup!)}
        >
          <Plus className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} /> {compact ? "Missão" : "Colocar na missão"}
        </Button>
      )}
    </div>
  );

  return (
    <PageContainer>
      <PageHeader
        title="Missão do Dia"
        description="Execução operacional gerada automaticamente pela priorização comercial."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link to="/central"><Compass className="h-4 w-4" /> Central de Decisão</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <Link to="/inteligencia/metricas"><BarChart3 className="h-4 w-4" /> Fechar métricas do dia</Link>
            </Button>
            <Button variant="ghost" size="sm" className="gap-1" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" /> Reiniciar missão
            </Button>
          </div>
        }
      />

      <Card className="border-accent/40 bg-gradient-to-br from-accent/10 via-card to-card shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Central Inteligente do Dia
                </span>
              </div>
              <CardTitle className="text-xl md:text-2xl">Comece por aqui</CardTitle>
              <p className="text-sm text-muted-foreground max-w-3xl">
                Uma fila única reúne missão, follow-ups e planejamento do dia para mostrar a próxima ação com mais impacto agora.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-right">
              <p className="text-xs text-muted-foreground">Foco agora</p>
              <p className="text-2xl font-bold text-foreground">{commandActions.length || pending.length}</p>
              <p className="text-[11px] text-muted-foreground">ação(ões) priorizadas</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {primaryAction ? (
            <div className="rounded-xl border border-accent/30 bg-background/80 p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  {KIND_ICON[primaryAction.kind]}
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] ${PRIORITY_CLASSES[primaryAction.priority]}`}>
                      {PRIORITY_LABEL[primaryAction.priority]}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {sourceLabel(primaryAction)}
                    </Badge>
                    {primaryAction.recommendedTime && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Clock className="h-2.5 w-2.5" /> {primaryAction.recommendedTime}
                      </Badge>
                    )}
                  </div>
                  <h2 className="text-base md:text-lg font-semibold text-foreground">{primaryAction.title}</h2>
                  <p className="text-sm text-muted-foreground">Por quê: {evidenceLine(primaryAction)}</p>
                  <p className="text-xs text-muted-foreground/80">Tempo estimado: {formatMinutes(primaryAction.estimatedMinutes)}</p>
                </div>
              </div>
              {renderActionButtons(primaryAction)}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/60 p-4">
              <p className="text-sm font-semibold text-foreground">Nenhuma ação urgente agora.</p>
              <p className="text-sm text-muted-foreground">Use os objetivos e prioridades abaixo para montar a missão do dia.</p>
            </div>
          )}

          {commandActions.length > 1 && (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {commandActions.slice(1).map((action, index) => (
                <div key={action.id} className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-accent">#{index + 2}</span>
                    <Badge variant="outline" className={`text-[10px] ${PRIORITY_CLASSES[action.priority]}`}>
                      {PRIORITY_LABEL[action.priority]}
                    </Badge>
                  </div>
                  <Badge variant="secondary" className="w-fit text-[10px] font-normal">{sourceLabel(action)}</Badge>
                  <p className="text-sm font-semibold text-foreground line-clamp-2">{action.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{evidenceLine(action)}</p>
                  {action.badges.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {action.badges.slice(0, 2).map((badge) => (
                        <Badge key={badge} variant="secondary" className="text-[10px] font-normal">{badge}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1 pt-1">{renderActionButtons(action, true)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Objetivos do Dia</h2>
        <ColdCallOpsPanel refreshKey={tick} />
      </section>

      <OperationalCapacityCard plan={plan} />

      <Card>
        <CardContent className="py-4 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-semibold text-foreground">
              Progresso da missão · {progress.done}/{progress.total} concluídas
            </p>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Restam {formatMinutes(progress.minutesLeft)}
              <span className="text-muted-foreground/70 ml-2 tabular-nums">
                · {plan.callsDone}/{plan.callsGoal} ligações registradas hoje
              </span>
            </span>
          </div>
          <Progress value={progress.pct} className="h-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Atividades da missão ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma atividade na missão de hoje. Adicione prioridades abaixo ou pela Central de Decisão.
            </p>
          )}
          {pending.map((entry) => (
            <div key={entry.id} className="rounded-md border border-border/60 bg-card/50 px-3 py-2.5 flex items-start gap-3">
              <span className="mt-0.5 text-accent shrink-0">{KIND_ICON[entry.kind]}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                  <Badge variant="outline" className={`text-[10px] ${PRIORITY_CLASSES[entry.priority]}`}>
                    {PRIORITY_LABEL[entry.priority]}
                  </Badge>
                  {entry.recommendedTime && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Clock className="h-2.5 w-2.5" /> {entry.recommendedTime}
                    </Badge>
                  )}
                  {entry.niche && <Badge variant="outline" className="text-[10px]">{entry.niche}</Badge>}
                  {entry.city && <Badge variant="outline" className="text-[10px]">{entry.city}</Badge>}
                </div>
                {entry.company && <p className="text-xs text-muted-foreground mt-0.5">Empresa: {entry.company}</p>}
                {entry.bullets.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">Priorizar: {entry.bullets.join(" · ")}</p>
                )}
                {entry.reason && <p className="text-xs text-muted-foreground/80 mt-0.5">Motivo: {entry.reason}</p>}
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Tempo estimado: {formatMinutes(entry.estimatedMinutes)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {entry.leadId && (
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-xs gap-1"
                    onClick={() => openLead(entry.leadId!, { tab: "interacoes" })}>
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir Lead
                  </Button>
                )}
                <Button size="sm" className="h-8 px-2 text-xs gap-1 bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={() => handleComplete(entry)}>
                  <Check className="h-3.5 w-3.5" /> Concluir
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {(suggestions.length > 0 || followupSuggestions.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Prioridades recomendadas hoje</CardTitle>
            <p className="text-xs text-muted-foreground">
              {plan.followups.length} de {plan.followupTarget} follow-ups
              {plan.followupCoverage?.shortfallReason ? ` — ${plan.followupCoverage.shortfallReason}` : ""}
            </p>
          </CardHeader>

          <CardContent className="space-y-1.5">
            {suggestions.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-md border border-border/50 px-2.5 py-2">
                <span className="text-accent shrink-0">{KIND_ICON[item.kind]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">{item.reason}</p>
                </div>
                <Button size="sm" variant="secondary" className="h-7 px-2 text-[11px] gap-1"
                  onClick={() => handleAddSuggestion(item)}>
                  <Plus className="h-3 w-3" /> Adicionar à Missão
                </Button>
              </div>
            ))}
            {followupSuggestions.map((followup) => (
              <div key={followup.leadId} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-muted/50">
                <span className="text-xs">{followup.temperature.emoji}</span>
                <button className="text-xs font-medium text-foreground truncate flex-1 text-left hover:underline"
                  onClick={() => openLead(followup.leadId, { tab: "interacoes" })}>
                  {followup.company}
                </button>
                <span className="text-[11px] text-muted-foreground truncate hidden md:block max-w-[35%]">{followup.motivo}</span>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1"
                  onClick={() => handleAddFollowup(followup)}>
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {done.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Concluídas hoje ({done.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {done.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span className="text-xs text-muted-foreground line-through truncate flex-1">{entry.title}</span>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] gap-1"
                  onClick={() => { reopenMissionEntry(entry.id); bump(); }}>
                  <Undo2 className="h-3 w-3" /> Reabrir
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]"
                  onClick={() => { removeMissionEntry(entry.id); bump(); }}>
                  Remover
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
