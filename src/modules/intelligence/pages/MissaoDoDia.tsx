import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import {
  Check, Compass, ExternalLink, Phone, Users, Target, FileText,
  Flame, ListChecks, RotateCcw,
} from "lucide-react";
import { PageContainer, PageHeader } from "@/shared/components/shell";
import {
  getMissionEntries, getMissionProgress, completeMissionEntry,
  resetMissionDay, runOneTimeMissionReset,
  MISSION_UPDATED_EVENT, type MissionEntry,
} from "@/modules/intelligence/services/missionStore";
import { buildMissionPlan, addFollowupTask } from "@/modules/intelligence/services/missionPlanner";
import { openLead } from "@/modules/leads/services/openLead";
import { on } from "@/shared/services/eventBus";
import { getLeads } from "@/shared/services/store";

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
  const [isUpdating, setIsUpdating] = useState(false);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => { runOneTimeMissionReset(); }, []);

  useEffect(() => {
    const offs = [
      on("TarefaCriada", bump), on("TarefaConcluida", bump), on("TarefaAtualizada", bump),
      on("LigacaoRegistrada", bump), on("MensagemRegistrada", bump),
      on("LeadAtualizado", bump), on("LeadMovido", bump), on("MetaAtualizada", bump),
    ];
    window.addEventListener(MISSION_UPDATED_EVENT, bump);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener(MISSION_UPDATED_EVENT, bump);
    };
  }, [bump]);

  const entries = useMemo(() => getMissionEntries(), [tick]);
  const progress = useMemo(() => getMissionProgress(), [tick]);
  const plan = useMemo(() => buildMissionPlan(), [tick]);

  const inMission = useMemo(() => new Set(entries.map((e) => e.ref)), [entries]);
  const pending = entries.filter((e) => e.status === "pendente");
  
  const followupSuggestions = plan.followups.filter(
    (f) => !inMission.has(`${plan.generatedAt.slice(0, 10)}:followup:${f.leadId}`),
  );

  const proposalCount = useMemo(() => {
    return getLeads().filter(l => /proposta/i.test(l.stage)).length;
  }, [tick]);

  const handleUpdatePriorities = () => {
    setIsUpdating(true);
    // Simula processamento da IA para "gerar o lote"
    setTimeout(() => {
      // Adiciona o primeiro lote de follow-ups sugeridos à missão
      const batchSize = 8;
      const batch = followupSuggestions.slice(0, batchSize);
      
      if (batch.length === 0) {
        toast({ title: "Tudo atualizado", description: "Não há novos follow-ups recomendados no momento." });
      } else {
        batch.forEach(f => addFollowupTask(f));
        toast({ title: "Prioridades atualizadas", description: `${batch.length} novos itens adicionados.` });
        bump();
      }
      setIsUpdating(false);
    }, 800);
  };

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

  const isMissionComplete = pending.length === 0 && progress.total > 0;

  return (
    <PageContainer>
      <PageHeader
        title="Missão do Dia"
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-1">
              <Link to="/central"><Compass className="h-4 w-4" /> Central de Decisão</Link>
            </Button>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" /> Reiniciar
            </Button>
          </div>
        }
      />

      <div className="max-w-2xl mx-auto space-y-8 py-4">
        {/* 1. MISSÃO DO DIA (Resumo Drástico) */}
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center justify-center gap-2">
            🎯 MISSÃO DO DIA
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
              <p className="text-2xl font-bold text-accent">{plan.callsGoal}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">novas ligações</p>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
              <p className="text-2xl font-bold text-accent">{plan.followupTarget}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">follow-ups</p>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
              <p className="text-2xl font-bold text-accent">{plan.meetingsGoal}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">reuniões</p>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
              <p className="text-2xl font-bold text-accent">3</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">propostas</p>
            </div>
          </div>
        </div>

        {/* 4. BOTÃO PRINCIPAL (CTA) */}
        {!isMissionComplete && pending.length === 0 && (
          <div className="flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Button 
              size="lg" 
              className="h-16 px-10 text-lg gap-2 bg-accent text-accent-foreground hover:bg-accent/90 shadow-xl shadow-accent/20"
              onClick={handleUpdatePriorities}
              disabled={isUpdating}
            >
              <RotateCcw className={`h-5 w-5 ${isUpdating ? 'animate-spin' : ''}`} />
              🧠 Atualizar Prioridades
            </Button>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              O sistema irá analisar sua base e gerar as melhores ações para este momento.
            </p>
          </div>
        )}

        {/* 5. EXIBIÇÃO DE AÇÕES (Somente após clique/quando houver pendentes) */}
        {pending.length > 0 && (
          <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                FOLLOW-UPS PRIORITÁRIOS ({pending.length})
              </h3>
              <div className="w-32">
                <Progress value={progress.pct} className="h-1" />
              </div>
            </div>

            <div className="space-y-3">
              {pending.map((e) => (
                <div key={e.id} className="group rounded-xl border border-border/60 bg-card/40 p-4 flex items-center justify-between gap-4 hover:border-accent/50 transition-colors shadow-sm">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-xl shrink-0">
                      {e.priority === 'urgente' || e.priority === 'alta' ? '🔥' : e.priority === 'media' ? '🟠' : '🟡'}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-foreground truncate group-hover:text-accent transition-colors">
                        {e.company || e.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {e.reason || e.title}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {e.leadId && (
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0 rounded-full"
                        onClick={() => openLead(e.leadId!, { tab: "interacoes" })}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      className="h-9 px-4 gap-2 bg-foreground text-background hover:bg-foreground/90 rounded-full font-bold"
                      onClick={() => handleComplete(e)}
                    >
                      <Check className="h-4 w-4" /> Concluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. CONCLUSÃO DA MISSÃO */}
        {isMissionComplete && (
          <div className="text-center space-y-6 animate-in zoom-in duration-500 py-10">
            <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-emerald-500/10 text-emerald-500 mb-2">
              <Check className="h-10 w-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-foreground">✅ Missão concluída.</h3>
              <p className="text-muted-foreground">
                Restam {followupSuggestions.length} follow-ups disponíveis na base.
              </p>
            </div>
            <Button 
              size="lg" 
              variant="outline"
              className="gap-2 border-accent text-accent hover:bg-accent/10"
              onClick={handleUpdatePriorities}
              disabled={isUpdating}
            >
              <RotateCcw className={`h-4 w-4 ${isUpdating ? 'animate-spin' : ''}`} />
              🧠 Atualizar Prioridades
            </Button>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
