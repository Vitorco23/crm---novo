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

      <div className="max-w-2xl mx-auto space-y-12 py-8">
        {/* 1. MISSÃO DO DIA (Indicadores Estáticos) */}
        <div className="text-center space-y-8">
          <h2 className="text-4xl font-black tracking-tighter text-foreground flex items-center justify-center gap-3 italic">
            🎯 MISSÃO DO DIA
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-6 rounded-2xl bg-card/40 border border-border/60 shadow-sm transition-all">
              <p className="text-4xl font-black text-accent">112</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">Ligações</p>
            </div>
            <div className="p-6 rounded-2xl bg-card/40 border border-border/60 shadow-sm transition-all">
              <p className="text-4xl font-black text-accent">24</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">Follow-ups pendentes</p>
            </div>
            <div className="p-6 rounded-2xl bg-card/40 border border-border/60 shadow-sm transition-all">
              <p className="text-4xl font-black text-accent">4</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">Reuniões</p>
            </div>
            <div className="p-6 rounded-2xl bg-card/40 border border-border/60 shadow-sm transition-all">
              <p className="text-4xl font-black text-accent">0</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">Propostas</p>
            </div>
          </div>
        </div>

        {/* 2. DIRETOR COMERCIAL IA (CTA Único) */}
        <div className="flex flex-col items-center gap-8 py-4">
          <div className="space-y-2 text-center">
            <h3 className="text-2xl font-black text-foreground tracking-tighter italic uppercase flex items-center justify-center gap-2">
              🧠 DIRETOR COMERCIAL IA
            </h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium opacity-60">
              Próxima Melhor Ação Baseada em Dados Reais
            </p>
          </div>

          <Button 
            size="lg" 
            className="h-24 px-16 text-2xl gap-4 bg-accent text-accent-foreground hover:bg-accent/90 shadow-[0_20px_50px_rgba(154,189,51,0.2)] rounded-3xl font-black uppercase tracking-tighter transition-all hover:scale-[1.02] active:scale-95 border-b-4 border-black/20"
            onClick={handleUpdatePriorities}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <RotateCcw className="h-8 w-8 animate-spin" />
            ) : (
              <Target className="h-8 w-8" />
            )}
            Gerar Próxima Missão
          </Button>
          
          <div className="flex items-center gap-2 text-muted-foreground/40">
            <div className="h-px w-8 bg-current" />
            <p className="text-[9px] uppercase tracking-widest font-bold">A tela termina aqui</p>
            <div className="h-px w-8 bg-current" />
          </div>
        </div>

        {/* 
          As listas de pendentes e ações detalhadas foram removidas seguindo a nova filosofia 2.0.
          A missão agora é um processo de "pull" onde o usuário solicita o próximo lote
          através do Diretor Comercial IA, evitando fadiga de decisão por excesso de listas.
        */}
      </div>
    </PageContainer>

  );
}
