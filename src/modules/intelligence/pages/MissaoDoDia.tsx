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
import { computePriorityLeads } from "@/modules/intelligence/services/priorityLeads";
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

  const handleUpdatePriorities = async () => {
    setIsUpdating(true);
    try {
      // SPRINT 2: Chama a IA de Priorização para calcular o cenário comercial atual
      const result = await computePriorityLeads(true); // true força recálculo total (ignore cache)
      
      // Mapeia os picks da IA para tarefas na missão
      if (!result.leads || result.leads.length === 0) {
        toast({ title: "Tudo atualizado", description: "O Diretor Comercial IA não identificou novas urgências no momento." });
      } else {
        // O missionPlanner/missionStore já lida com a persistência e deduplicação via ref
        result.leads.forEach(pick => {
          // Busca o pick correspondente nas sugestões do plano para manter consistência de dados
          const suggestion = plan.followups.find(f => f.leadId === pick.leadId);
          if (suggestion) {
            addFollowupTask(suggestion);
          }
        });
        
        toast({ title: "Missão Atualizada", description: `O Diretor Comercial IA selecionou os ${result.leads.length} leads mais prioritários.` });
        bump();
      }
    } catch (error) {
      console.error("Erro na priorização IA:", error);
      toast({ 
        variant: "destructive", 
        title: "Erro na priorização", 
        description: "Não foi possível conectar com o Diretor Comercial IA agora." 
      });
    } finally {
      setIsUpdating(false);
    }
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
        <div className="text-center space-y-6">
          <h2 className="text-3xl font-black tracking-tighter text-foreground flex items-center justify-center gap-2 italic">
            🎯 MISSÃO DO DIA
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-6 rounded-2xl bg-card/50 border border-border shadow-sm">
              <p className="text-3xl font-black text-accent">{plan.callsGoal + (plan.items.find(i => i.kind === 'calls')?.estimatedMinutes ? 0 : 0)}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">novas ligações</p>
            </div>
            <div className="p-6 rounded-2xl bg-card/50 border border-border shadow-sm">
              <p className="text-3xl font-black text-accent">{plan.followupTarget}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">follow-ups</p>
            </div>
            <div className="p-6 rounded-2xl bg-card/50 border border-border shadow-sm">
              <p className="text-3xl font-black text-accent">{plan.meetingsGoal}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">reuniões</p>
            </div>
            <div className="p-6 rounded-2xl bg-card/50 border border-border shadow-sm">
              <p className="text-3xl font-black text-accent">{proposalCount}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">propostas</p>
            </div>
          </div>
        </div>

        {/* 4. BOTÃO PRINCIPAL (CTA) — Só aparece se a missão não começou ou se foi concluída */}
        {pending.length === 0 && (
          <div className="flex flex-col items-center gap-6 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {isMissionComplete && (
              <div className="text-center space-y-6 mb-4">
                <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-accent/10 text-accent mb-2">
                  <Check className="h-10 w-10" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-black text-foreground tracking-tighter italic uppercase">✅ Missão concluída.</h3>
                  <p className="text-muted-foreground uppercase text-[10px] tracking-widest font-bold opacity-70">
                    Ainda existem {followupSuggestions.length} follow-ups disponíveis na base.
                  </p>
                </div>
              </div>
            )}

            <Button 
              size="lg" 
              className="h-20 px-12 text-xl gap-3 bg-accent text-accent-foreground hover:bg-accent/90 shadow-2xl shadow-accent/30 rounded-full font-black uppercase tracking-tighter transition-all hover:scale-105 active:scale-95"
              onClick={handleUpdatePriorities}
              disabled={isUpdating}
            >
              <RotateCcw className={`h-6 w-6 ${isUpdating ? 'animate-spin' : ''}`} />
              🧠 {isMissionComplete ? 'Recalcular Prioridades' : 'Atualizar Prioridades'}
            </Button>
            
            <p className="text-xs text-muted-foreground text-center max-w-sm leading-relaxed uppercase tracking-widest font-medium opacity-70">
              O Diretor Comercial IA irá analisar todo o CRM e selecionar os 8 leads mais prioritários para este momento.
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
                <div key={e.id} className="group rounded-2xl border border-border/40 bg-card/30 p-5 flex items-center justify-between gap-4 hover:border-accent/40 transition-all shadow-sm hover:shadow-md">
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

        {/* 6. CONCLUSÃO DA MISSÃO — Removido daqui e integrado ao bloco CTA acima para evitar duplicidade */}
      </div>
    </PageContainer>
  );
}
