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
  Check, Clock, Compass, ExternalLink, Phone, Users, Target, FileText,
  Flame, ListChecks, RotateCcw, Undo2, Plus,
} from "lucide-react";
import { PageContainer, PageHeader } from "@/shared/components/shell";
import {
  getMissionEntries, getMissionProgress, completeMissionEntry, reopenMissionEntry,
  removeMissionEntry, resetMissionDay, runOneTimeMissionReset,
  MISSION_UPDATED_EVENT, type MissionEntry,
} from "@/modules/intelligence/services/missionStore";
import { buildMissionPlan, addMissionTask, addFollowupTask } from "@/modules/intelligence/services/missionPlanner";
import { OperationalCapacityCard } from "@/modules/intelligence/components/OperationalCapacityCard";
import ColdCallOpsPanel from "@/modules/cold-call/components/ColdCallOpsPanel";
import { openLead } from "@/modules/leads/services/openLead";
import { on } from "@/shared/services/eventBus";
import { PRIORITY_CLASSES, PRIORITY_LABEL } from "@/modules/leads/services/leadTasks";
import { formatMinutes } from "@/modules/intelligence/services/priorityEngine";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

const KIND_ICON: Record<MissionEntry["kind"], JSX.Element> = {
  calls: <Phone className="h-4 w-4" />,
  followups: <ListChecks className="h-4 w-4" />,
  meetings: <Users className="h-4 w-4" />,
  prospect: <Target className="h-4 w-4" />,
  script: <FileText className="h-4 w-4" />,
  lead: <Flame className="h-4 w-4" />,
};

export default function MissaoDoDia() {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => { runOneTimeMissionReset(); }, []);

  // TEMPORÁRIO — teste da Edge Function matteline-create-contact
  const [testPhone, setTestPhone] = useState("55");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const runMattelineTest = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("matteline-create-contact", {
        body: { name: "Teste P21", phone: testPhone },
      });
      let httpStatus: number | string = error?.context?.status ?? (error ? "erro" : 200);
      let errorBody: unknown = null;
      if (error?.context && typeof error.context.text === "function") {
        try { errorBody = await error.context.clone().json(); }
        catch { try { errorBody = await error.context.clone().text(); } catch { /* ignore */ } }
      }
      setTestResult(JSON.stringify({
        statusHTTP: httpStatus,
        resposta: data ?? errorBody,
        erro: error ? error.message : null,
      }, null, 2));
    } catch (e) {
      setTestResult(JSON.stringify({ statusHTTP: "exception", resposta: null, erro: String(e) }, null, 2));
    } finally {
      setTestLoading(false);
    }
  };


  useEffect(() => {
    const offs = [
      on("TarefaCriada", bump), on("TarefaConcluida", bump), on("TarefaAtualizada", bump),
      on("LigacaoRegistrada", bump), on("MensagemRegistrada", bump),
      on("LeadAtualizado", bump), on("LeadMovido", bump), on("MetaAtualizada", bump),
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


  const handleComplete = (e: MissionEntry) => {
    completeMissionEntry(e.id);
    toast({ title: "Atividade concluída", description: e.title });
    bump();
  };

  const handleReset = () => {
    resetMissionDay();
    toast({ title: "Missão do dia reiniciada", description: "Nenhum dado comercial foi alterado." });
    bump();
  };

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
            <Button variant="ghost" size="sm" className="gap-1" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" /> Reiniciar missão
            </Button>
          </div>
        }
      />

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
          {pending.map((e) => (
            <div key={e.id} className="rounded-md border border-border/60 bg-card/50 px-3 py-2.5 flex items-start gap-3">
              <span className="mt-0.5 text-accent shrink-0">{KIND_ICON[e.kind]}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">{e.title}</p>
                  <Badge variant="outline" className={`text-[10px] ${PRIORITY_CLASSES[e.priority]}`}>
                    {PRIORITY_LABEL[e.priority]}
                  </Badge>
                  {e.recommendedTime && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Clock className="h-2.5 w-2.5" /> {e.recommendedTime}
                    </Badge>
                  )}
                  {e.niche && <Badge variant="outline" className="text-[10px]">{e.niche}</Badge>}
                  {e.city && <Badge variant="outline" className="text-[10px]">{e.city}</Badge>}
                </div>
                {e.company && <p className="text-xs text-muted-foreground mt-0.5">Empresa: {e.company}</p>}
                {e.bullets.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">Priorizar: {e.bullets.join(" · ")}</p>
                )}
                {e.reason && <p className="text-xs text-muted-foreground/80 mt-0.5">Motivo: {e.reason}</p>}
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Tempo estimado: {formatMinutes(e.estimatedMinutes)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {e.leadId && (
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-xs gap-1"
                    onClick={() => openLead(e.leadId!, { tab: "interacoes" })}>
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir Lead
                  </Button>
                )}
                <Button size="sm" className="h-8 px-2 text-xs gap-1 bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={() => handleComplete(e)}>
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
                  onClick={() => { addMissionTask(item); bump(); }}>
                  <Plus className="h-3 w-3" /> Adicionar à Missão
                </Button>
              </div>
            ))}
            {followupSuggestions.map((f) => (
              <div key={f.leadId} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-muted/50">
                <span className="text-xs">{f.temperature.emoji}</span>
                <button className="text-xs font-medium text-foreground truncate flex-1 text-left hover:underline"
                  onClick={() => openLead(f.leadId, { tab: "interacoes" })}>
                  {f.company}
                </button>
                <span className="text-[11px] text-muted-foreground truncate hidden md:block max-w-[35%]">{f.motivo}</span>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1"
                  onClick={() => { addFollowupTask(f); bump(); }}>
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
            {done.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span className="text-xs text-muted-foreground line-through truncate flex-1">{e.title}</span>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] gap-1"
                  onClick={() => { reopenMissionEntry(e.id); bump(); }}>
                  <Undo2 className="h-3 w-3" /> Reabrir
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]"
                  onClick={() => { removeMissionEntry(e.id); bump(); }}>
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
