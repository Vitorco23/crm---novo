// Missão do Dia — execução operacional diária do Sistema Operacional Comercial.
// Consome exclusivamente o resultado do priorityEngine (via missionPlanner)
// e o estado de execução persistido em missionStore. Nenhum motor novo.
//
// Sprint 1 (Command Center): reorganiza hierarquia/visual/microcopy da tela.
// Sprint 1.2 (P21 Intelligence OS): redesign visual profundo — menos caixas,
// mais profundidade, verde controlado. Nenhuma regra comercial, integração
// ou fonte de dados foi alterada — todos os handlers abaixo chamam
// exatamente as mesmas funções de antes; só a apresentação mudou.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  ExternalLink,
  FileText,
  Flame,
  ListChecks,
  Phone,
  Plus,
  RotateCcw,
  Target,
  Undo2,
  Users,
} from "lucide-react";
import { PageContainer } from "@/shared/components/shell";
import MissionOpening from "@/modules/intelligence/components/MissionOpening";
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
import { PRIORITY_LABEL, type TaskPriority } from "@/modules/leads/services/leadTasks";
import { formatMinutes } from "@/modules/intelligence/services/priorityEngine";
import { prettifyLeadName } from "@/modules/intelligence/utils/prettifyLeadName";

const KIND_ICON: Record<MissionEntry["kind"], JSX.Element> = {
  calls: <Phone className="h-3.5 w-3.5" />,
  followups: <ListChecks className="h-3.5 w-3.5" />,
  meetings: <Users className="h-3.5 w-3.5" />,
  prospect: <Target className="h-3.5 w-3.5" />,
  script: <FileText className="h-3.5 w-3.5" />,
  lead: <Flame className="h-3.5 w-3.5" />,
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

const SOURCE_REASON: Record<ActionSource, string> = {
  mission: "Ação já selecionada para executar hoje.",
  followup: "Lead puxado da cadência e dos sinais comerciais do dia.",
  suggestion: "Ação recomendada pelo planejamento operacional.",
};

function evidenceLine(action: CommandCenterAction) {
  const base = action.reason || SOURCE_REASON[action.source];
  const time = action.recommendedTime ? ` Melhor horário: ${action.recommendedTime}.` : "";
  return `${base}${time}`;
}

/** Apresentação: separa "verbo — empresa" quando o título segue esse padrão,
 * e limpa o nome da empresa (nunca altera o dado original salvo). */
function splitAction(action: CommandCenterAction): { verb: string; company?: string } {
  const rawCompany = action.company?.trim();
  if (rawCompany && action.title.includes(rawCompany)) {
    const verb = action.title.replace(rawCompany, "").replace(/[\s—-]+$/, "").trim();
    return { verb: verb || action.title, company: prettifyLeadName(rawCompany).name };
  }
  return { verb: action.title };
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
    badges: [entry.niche || "", entry.city || ""].filter(Boolean),
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
    badges: [item.niche || "", item.city || ""].filter(Boolean),
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

// Sprint 2A — semântica honesta dos CTAs de missão.
// Um item "mission" já foi assumido pelo vendedor: o único clique possível
// nele é concluir o item na missão (não dispara nenhuma ação comercial).
// Um item "suggestion"/"followup" ainda não foi assumido: o clique apenas
// adiciona à missão de hoje — não liga, não abre WhatsApp, não executa nada.
function missionCTA(source: ActionSource, compact: boolean): string {
  if (source === "mission") return compact ? "Concluir" : "Concluir item";
  return compact ? "Adicionar" : "Adicionar à missão";
}

export default function MissaoDoDia() {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const focusRef = useRef<HTMLDivElement>(null);

  const [showAllPriorities, setShowAllPriorities] = useState(false);
  const [showMissionList, setShowMissionList] = useState(false);
  const [showPlanning, setShowPlanning] = useState(false);
  const [showDone, setShowDone] = useState(false);

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
      // Sprint 2A: reunião é o sinal de maior peso no Priority Engine
      // (meetingSoon = 60, meetingToday = 30) — a Missão precisa recalcular
      // dados derivados quando uma reunião é marcada/reagendada/realizada.
      // Isso NÃO troca o Foco Agora sozinho: só força o mesmo recálculo que
      // já roda a cada bump() — a ordenação e o item #1 seguem inalterados
      // pelas mesmas regras de sempre (ver orderCommandActions).
      on("ReuniaoMarcada", bump),
      on("ReuniaoAtualizada", bump),
      on("ReuniaoRealizada", bump),
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
  const remainingCalls = Math.max(0, plan.callsGoal - plan.callsDone);

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
  const queue = commandActions.slice(1);
  const urgentCount = commandActions.filter((a) => a.priority === "urgente").length;
  const remainingPrioritiesCount = suggestions.length + followupSuggestions.length;

  const handleComplete = (entry: MissionEntry) => {
    completeMissionEntry(entry.id);
    toast({ title: "Item concluído na missão", description: entry.title });
    bump();
  };

  const handleAddSuggestion = (item: MissionItem) => {
    addMissionTask(item);
    toast({ title: "Adicionado à missão", description: item.title });
    bump();
  };

  const handleAddFollowup = (followup: FollowupPick) => {
    addFollowupTask(followup);
    toast({ title: "Adicionado à missão", description: followup.company });
    bump();
  };

  const handleReset = () => {
    resetMissionDay();
    toast({ title: "Missão do dia reiniciada", description: "Nenhum dado comercial foi alterado." });
    bump();
  };

  const primaryHandler = () => {
    if (!primaryAction) return;
    if (primaryAction.source === "mission" && primaryAction.missionEntry) handleComplete(primaryAction.missionEntry);
    else if (primaryAction.source === "suggestion" && primaryAction.missionItem) handleAddSuggestion(primaryAction.missionItem);
    else if (primaryAction.source === "followup" && primaryAction.followup) handleAddFollowup(primaryAction.followup);
  };

  const queueHandler = (action: CommandCenterAction) => () => {
    if (action.source === "mission" && action.missionEntry) handleComplete(action.missionEntry);
    else if (action.source === "suggestion" && action.missionItem) handleAddSuggestion(action.missionItem);
    else if (action.source === "followup" && action.followup) handleAddFollowup(action.followup);
  };

  return (
    <PageContainer>
      <div className="mission-os -mx-1 rounded-3xl px-4 py-4 md:px-7 md:py-5 space-y-6">

        {/* Barra de ações discreta — não compete com o hero. */}
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11px] text-[hsl(var(--mission-text-faint))]">
          <Link to="/central" className="inline-flex items-center gap-1 hover:text-[hsl(var(--mission-text))] transition-colors">
            <Compass className="h-3 w-3" /> Central de Decisão
          </Link>
          <span className="opacity-30">·</span>
          <Link to="/inteligencia/metricas" className="inline-flex items-center gap-1 hover:text-[hsl(var(--mission-text))] transition-colors">
            <BarChart3 className="h-3 w-3" /> Fechar métricas
          </Link>
          <span className="opacity-30">·</span>
          <button onClick={handleReset} className="inline-flex items-center gap-1 hover:text-[hsl(var(--mission-text))] transition-colors">
            <RotateCcw className="h-3 w-3" /> Reiniciar missão
          </button>
        </div>

        {/* 1 — ABERTURA INTELIGENTE */}
        <MissionOpening
          actionCount={commandActions.length}
          urgentCount={urgentCount}
          generatedAt={plan.generatedAt}
          missionDone={progress.done}
          missionTotal={progress.total}
          onStart={() => focusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />

        {/* 2 — FOCO AGORA (sem card-in-card: conteúdo direto sobre a superfície) */}
        <div ref={focusRef} className="scroll-mt-4 space-y-4 animate-slide-in">
          {primaryAction ? (
            <div className="relative pl-5">
              <span className="absolute left-0 top-1 h-[calc(100%-4px)] w-px bg-gradient-to-b from-[hsl(var(--mission-accent))] to-transparent opacity-60" />
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[hsl(var(--mission-accent))]">01</span>
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--mission-text-faint))]">Foco agora</span>
                    {primaryAction.priority === "urgente" && (
                      <span className="flex items-center gap-1 text-[10px] text-red-400/90">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400/90" /> urgente
                      </span>
                    )}
                  </div>

                  {(() => {
                    const { verb, company } = splitAction(primaryAction);
                    return (
                      <div className="space-y-1">
                        <h2 className="text-xl md:text-2xl font-semibold text-[hsl(var(--mission-text))] [text-wrap:balance]">
                          {verb}
                        </h2>
                        {company && (
                          <p className="text-[15px] font-medium text-[hsl(var(--mission-accent))]">{company}</p>
                        )}
                      </div>
                    );
                  })()}

                  <p className="text-sm text-[hsl(var(--mission-text-muted))] max-w-xl">{evidenceLine(primaryAction)}</p>

                  <p className="font-mono text-[11px] text-[hsl(var(--mission-text-faint))]">
                    {[PRIORITY_LABEL[primaryAction.priority], primaryAction.recommendedTime, `~${formatMinutes(primaryAction.estimatedMinutes)}`]
                      .filter(Boolean).join("  ·  ")}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {primaryAction.leadId && (
                    <button
                      onClick={() => openLead(primaryAction.leadId!, { tab: "interacoes" })}
                      className="text-sm text-[hsl(var(--mission-text-muted))] hover:text-[hsl(var(--mission-text))] transition-colors underline-offset-4 hover:underline"
                    >
                      {/* Navegação real para o lead — o rótulo usa o verbo já calculado
                          pelo motor (ex.: "Ligar agora", "Responder no WhatsApp"), nunca
                          um texto inventado; sem verbo claro, cai em "Abrir lead". */}
                      {splitAction(primaryAction).company ? splitAction(primaryAction).verb || "Abrir lead" : "Abrir lead"}
                    </button>
                  )}
                  <Button
                    onClick={primaryHandler}
                    className="gap-1.5 bg-[hsl(var(--mission-accent))] text-[hsl(var(--mission-bg))] hover:brightness-110 shadow-[0_0_24px_hsl(var(--mission-accent)/0.25)]"
                  >
                    {primaryAction.source === "mission" ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {missionCTA(primaryAction.source, false)}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[hsl(var(--mission-border))] bg-[hsl(var(--mission-surface))]/50 p-5">
              <p className="text-sm font-semibold text-[hsl(var(--mission-text))]">Nenhuma prioridade crítica agora.</p>
              <p className="text-sm text-[hsl(var(--mission-text-muted))]">Você pode iniciar seu bloco de prospecção.</p>
              <Button asChild size="sm" className="mt-3 w-fit gap-1 bg-[hsl(var(--mission-accent))] text-[hsl(var(--mission-bg))] hover:brightness-110">
                <Link to="/cold-call"><Phone className="h-3.5 w-3.5" /> Iniciar Cold Call</Link>
              </Button>
            </div>
          )}

          {/* 3 — DEPOIS DISSO: fila de execução, não cards grandes */}
          {queue.length > 0 && (
            <div className="pl-5">
              <p className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--mission-text-faint))]">
                Na sequência · {queue.length} {queue.length === 1 ? "ação" : "ações"}
              </p>
              <div className="border-l border-[hsl(var(--mission-border))]">
                {queue.map((action, index) => {
                  const { verb, company } = splitAction(action);
                  return (
                    <div
                      key={action.id}
                      className="group flex items-center gap-3 border-b border-[hsl(var(--mission-border))]/60 py-2.5 pl-4 pr-2 -ml-px transition-colors hover:bg-[hsl(var(--mission-surface))]/60"
                    >
                      <span className="font-mono text-xs text-[hsl(var(--mission-text-faint))] w-5 shrink-0">
                        {String(index + 2).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-[hsl(var(--mission-text))] truncate">{company || verb}</span>
                          {action.priority === "urgente" && (
                            <span className="h-1.5 w-1.5 rounded-full bg-red-400/80 shrink-0" title="Urgente" />
                          )}
                        </div>
                        <p className="text-xs text-[hsl(var(--mission-text-faint))] truncate">
                          {company ? verb : evidenceLine(action)}
                          {action.badges.length > 0 ? ` · ${action.badges.slice(0, 2).join(" · ")}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                        {action.leadId && (
                          <button
                            onClick={() => openLead(action.leadId!, { tab: "interacoes" })}
                            className="text-xs text-[hsl(var(--mission-text-faint))] hover:text-[hsl(var(--mission-text))]"
                          >
                            Abrir
                          </button>
                        )}
                        <button
                          onClick={queueHandler(action)}
                          className="inline-flex items-center gap-0.5 text-xs font-medium text-[hsl(var(--mission-accent))] hover:brightness-110"
                        >
                          {missionCTA(action.source, true)} <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {remainingCalls > 0 && (
            <div className="pl-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[hsl(var(--mission-surface))]/40 px-4 py-3">
              <p className="text-xs text-[hsl(var(--mission-text-muted))]">
                Faça mais <span className="text-[hsl(var(--mission-text))] font-medium">{remainingCalls} ligações</span> para alcançar a meta de hoje.
              </p>
              <Button asChild variant="ghost" size="sm" className="gap-1 h-7 text-xs text-[hsl(var(--mission-text-muted))] hover:text-[hsl(var(--mission-text))] hover:bg-[hsl(var(--mission-surface-2))]">
                <Link to="/cold-call"><Phone className="h-3 w-3" /> Iniciar Cold Call</Link>
              </Button>
            </div>
          )}
        </div>

        {/* 4 — PROGRESSO DO DIA (compacto, sem duplicação de meta) */}
        <div className="space-y-2">
          <h2 className="text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--mission-text-faint))]">Progresso do dia</h2>
          <ColdCallOpsPanel refreshKey={tick} />
          <div className="rounded-lg bg-[hsl(var(--mission-surface))]/40 px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-medium text-[hsl(var(--mission-text))]">
                Missão de hoje · {progress.done}/{progress.total} concluídas
              </p>
              <span className="text-[11px] text-[hsl(var(--mission-text-faint))] flex items-center gap-1">
                <Clock className="h-3 w-3" /> Restam {formatMinutes(progress.minutesLeft)}
              </span>
            </div>
            <Progress value={progress.pct} className="h-1.5" />
          </div>
        </div>

        {/* 5 — RESUMO OPERACIONAL COMPACTO */}
        <div className="space-y-1.5">
          {/* Atividades da missão — mesma lista de antes, agora secundária/expansível. */}
          <Collapsible open={showMissionList} onOpenChange={setShowMissionList}>
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1.5 text-xs text-[hsl(var(--mission-text-faint))] hover:text-[hsl(var(--mission-text))]">
                <span>
                  {pending.length > 0
                    ? `${pending.length} ${pending.length === 1 ? "atividade definida" : "atividades definidas"} para agora`
                    : "Atividades da missão"}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMissionList ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-2 rounded-lg bg-[hsl(var(--mission-surface))]/40 p-3">
                {pending.length === 0 && (
                  <p className="text-sm text-[hsl(var(--mission-text-muted))]">
                    Nenhuma atividade pendente — as prioridades acima já cobrem o que fazer agora.
                  </p>
                )}
                {pending.map((entry) => (
                  <div key={entry.id} className="rounded-md bg-[hsl(var(--mission-surface-2))]/50 px-3 py-2.5 flex items-start gap-3">
                    <span className="mt-0.5 text-[hsl(var(--mission-accent))] shrink-0">{KIND_ICON[entry.kind]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[hsl(var(--mission-text))]">{entry.title}</p>
                      <p className="text-xs text-[hsl(var(--mission-text-faint))]">
                        {[PRIORITY_LABEL[entry.priority], entry.recommendedTime, entry.niche, entry.city].filter(Boolean).join(" · ")}
                      </p>
                      {entry.company && <p className="text-xs text-[hsl(var(--mission-text-muted))] mt-0.5">{prettifyLeadName(entry.company).name}</p>}
                      {entry.reason && <p className="text-xs text-[hsl(var(--mission-text-faint))] mt-0.5">{entry.reason}</p>}
                      <p className="text-[11px] text-[hsl(var(--mission-text-faint))] mt-0.5">
                        ~{formatMinutes(entry.estimatedMinutes)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {entry.leadId && (
                        <button onClick={() => openLead(entry.leadId!, { tab: "interacoes" })}
                          className="text-xs text-[hsl(var(--mission-text-faint))] hover:text-[hsl(var(--mission-text))]">
                          Abrir
                        </button>
                      )}
                      <Button size="sm" className="h-7 px-2 text-xs gap-1 bg-[hsl(var(--mission-accent))] text-[hsl(var(--mission-bg))] hover:brightness-110"
                        onClick={() => handleComplete(entry)}>
                        <Check className="h-3.5 w-3.5" /> Concluir
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Prioridades recomendadas hoje — antes dominava a tela; agora é um link discreto. */}
          {remainingPrioritiesCount > 0 && (
            <Collapsible open={showAllPriorities} onOpenChange={setShowAllPriorities}>
              <CollapsibleTrigger asChild>
                <button className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1.5 text-xs text-[hsl(var(--mission-text-faint))] hover:text-[hsl(var(--mission-text))]">
                  <span>Ver todas as prioridades ({remainingPrioritiesCount})</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAllPriorities ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-1.5 rounded-lg bg-[hsl(var(--mission-surface))]/40 p-3">
                  <p className="text-xs text-[hsl(var(--mission-text-faint))] -mt-1 mb-1">
                    {plan.followups.length} de {plan.followupTarget} follow-ups
                    {plan.followupCoverage?.shortfallReason ? ` — ${plan.followupCoverage.shortfallReason}` : ""}
                  </p>
                  {suggestions.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-md px-2.5 py-2 hover:bg-[hsl(var(--mission-surface-2))]/50">
                      <span className="text-[hsl(var(--mission-accent))] shrink-0">{KIND_ICON[item.kind]}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[hsl(var(--mission-text))] truncate">{item.title}</p>
                        <p className="text-[11px] text-[hsl(var(--mission-text-faint))] line-clamp-1">{item.reason}</p>
                      </div>
                      <button onClick={() => handleAddSuggestion(item)}
                        className="text-[11px] font-medium text-[hsl(var(--mission-accent))] hover:brightness-110 shrink-0">
                        {missionCTA("suggestion", true)}
                      </button>
                    </div>
                  ))}
                  {followupSuggestions.map((followup) => (
                    <div key={followup.leadId} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-[hsl(var(--mission-surface-2))]/50">
                      <span className="text-xs">{followup.temperature.emoji}</span>
                      <button className="text-xs font-medium text-[hsl(var(--mission-text))] truncate flex-1 text-left hover:underline"
                        onClick={() => openLead(followup.leadId, { tab: "interacoes" })}>
                        {prettifyLeadName(followup.company).name}
                      </button>
                      <span className="text-[11px] text-[hsl(var(--mission-text-faint))] truncate hidden md:block max-w-[35%]">{followup.motivo}</span>
                      <button onClick={() => handleAddFollowup(followup)}
                        className="text-[11px] font-medium text-[hsl(var(--mission-accent))] hover:brightness-110 shrink-0">
                        {missionCTA("suggestion", true)}
                      </button>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Capacidade Operacional — informativo, movido para fora do fluxo principal. */}
          <Collapsible open={showPlanning} onOpenChange={setShowPlanning}>
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1.5 text-xs text-[hsl(var(--mission-text-faint))] hover:text-[hsl(var(--mission-text))]">
                <span>Detalhes do planejamento (capacidade operacional)</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showPlanning ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <OperationalCapacityCard plan={plan} />
            </CollapsibleContent>
          </Collapsible>

          {/* Concluídas hoje — preservado, apenas menos dominante. */}
          {done.length > 0 && (
            <Collapsible open={showDone} onOpenChange={setShowDone}>
              <CollapsibleTrigger asChild>
                <button className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1.5 text-xs text-[hsl(var(--mission-text-faint))] hover:text-[hsl(var(--mission-text))]">
                  <span>Concluídas hoje ({done.length})</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDone ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-1 rounded-lg bg-[hsl(var(--mission-surface))]/40 p-3">
                  {done.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                      <Check className="h-3.5 w-3.5 text-[hsl(var(--mission-accent))] shrink-0" />
                      <span className="text-xs text-[hsl(var(--mission-text-faint))] line-through truncate flex-1">{entry.title}</span>
                      <button onClick={() => { reopenMissionEntry(entry.id); bump(); }}
                        className="text-[10px] text-[hsl(var(--mission-text-faint))] hover:text-[hsl(var(--mission-text))] inline-flex items-center gap-0.5">
                        <Undo2 className="h-3 w-3" /> Reabrir
                      </button>
                      <button onClick={() => { removeMissionEntry(entry.id); bump(); }}
                        className="text-[10px] text-[hsl(var(--mission-text-faint))] hover:text-[hsl(var(--mission-text))]">
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
