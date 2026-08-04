import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import {
  Check, Compass, ExternalLink, Phone, Users, Target, FileText,
  Flame, ListChecks, RotateCcw, ArrowRight, SkipForward
} from "lucide-react";
import { PageContainer, PageHeader } from "@/shared/components/shell";
import {
  getMissionEntries, getMissionProgress, completeMissionEntry,
  resetMissionDay, runOneTimeMissionReset, saveMissionMemory,
  MISSION_UPDATED_EVENT, type MissionEntry,

} from "@/modules/intelligence/services/missionStore";
import { buildMissionPlan } from "@/modules/intelligence/services/missionPlanner";
import { computePriorityLeads, getCache } from "@/modules/intelligence/services/priorityLeads";
import { openLead } from "@/modules/leads/services/openLead";
import { on } from "@/shared/services/eventBus";
import { getLeads } from "@/shared/services/store";

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

  const plan = useMemo(() => buildMissionPlan(), [tick]);
  const cache = useMemo(() => getCache(), [tick]);
  const currentMission = cache?.leads?.[0] || null;

  const proposalCount = useMemo(() => {
    return getLeads().filter(l => /proposta/i.test(l.stage)).length;
  }, [tick]);

  const handleUpdatePriorities = async () => {
    setIsUpdating(true);
    try {
      const result = await computePriorityLeads(true);
      if (!result.leads || result.leads.length === 0) {
        toast({ title: "Tudo atualizado", description: "O Diretor Comercial IA não identificou novas urgências no momento." });
      } else {
        toast({ title: "Missão Gerada", description: "Foco total nesta oportunidade." });
      }
      bump();
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

  const handleSkip = () => {
    if (currentMission) {
      saveMissionMemory({
        leadId: currentMission.leadId,
        timestamp: new Date().toISOString(),
        actionTaken: currentMission.proximaAcao,
        outcome: "Pulado pelo usuário"
      });
    }
    handleUpdatePriorities();
    toast({ title: "Missão pulada", description: "Buscando a próxima melhor ação..." });
  };

  const handleComplete = () => {
    if (currentMission) {
      saveMissionMemory({
        leadId: currentMission.leadId,
        timestamp: new Date().toISOString(),
        actionTaken: currentMission.proximaAcao,
        outcome: "Concluído"
      });
    }
    resetMissionDay();
    localStorage.removeItem("p21_priority_leads_cache");
    toast({ title: "Ação registrada", description: "Missão concluída com sucesso." });
    bump();
  };


  const handleReset = () => {
    resetMissionDay();
    localStorage.removeItem("p21_priority_leads_cache");
    toast({ title: "Missão do dia reiniciada", description: "Nenhum dado comercial foi alterado." });
    bump();
  };

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
        {!currentMission && (
          <div className="text-center space-y-8 animate-in fade-in duration-500">
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
        )}

        {/* 2. DIRETOR COMERCIAL IA (Estado: Gerar ou Missão Atual) */}
        <div className="flex flex-col items-center gap-8 py-4">
          {!currentMission ? (
            <>
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
            </>
          ) : (
            <div className="w-full animate-in zoom-in-95 fade-in duration-500">
              <Card className="border-none bg-card/30 overflow-hidden rounded-[2.5rem] shadow-2xl">
                <CardContent className="p-0">
                  <div className="bg-accent/10 p-8 border-b border-accent/20">
                    <div className="flex justify-between items-start mb-6">
                      <h2 className="text-4xl font-black tracking-tighter text-foreground italic">
                        🎯 MISSÃO #1
                      </h2>
                      <div className="bg-accent text-accent-foreground px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                        Foco Total
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-accent uppercase tracking-widest opacity-80">
                        {currentMission.proximaAcao}
                      </p>
                      <h3 className="text-5xl font-black tracking-tighter text-foreground uppercase">
                        {getLeads().find(l => l.id === currentMission.leadId)?.company || "Lead Selecionado"}
                      </h3>
                    </div>
                  </div>

                  <div className="p-10 space-y-10">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <h4 className="text-xs font-black text-muted-foreground uppercase tracking-[0.3em] flex items-center gap-2">
                          <FileText className="h-3 w-3" /> Por que este lead?
                        </h4>
                        <p className="text-xl font-medium leading-relaxed text-foreground/90">
                          {currentMission.motivo}
                        </p>
                      </div>

                      {/* Explicabilidade Detalhada (Sinais) */}
                      {currentMission.impacto && (
                        <div className="flex flex-wrap gap-2">
                          {getLeads().find(l => l.id === currentMission.leadId)?.temperature === 'Quente' && (
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-[10px] font-bold text-orange-500 uppercase tracking-wider">
                              <Flame className="h-3 w-3" /> Temperatura Alta
                            </div>
                          )}
                          {(getLeads().find(l => l.id === currentMission.leadId)?.contractValue || 0) > 5000 && (
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                              <Target className="h-3 w-3" /> Ticket Elevado
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-[10px] font-bold text-accent uppercase tracking-wider">
                            <Check className="h-3 w-3" /> Prioridade {currentMission.impacto}
                          </div>
                        </div>
                      )}
                    </div>


                    <div className="grid grid-cols-3 gap-4">
                      <Button 
                        size="lg" 
                        className="h-20 bg-foreground text-background hover:bg-foreground/90 rounded-2xl font-black uppercase tracking-tighter gap-2 transition-transform hover:scale-[1.03]"
                        onClick={() => openLead(currentMission.leadId, { tab: "interacoes" })}
                      >
                        <Phone className="h-5 w-5" /> Ligar
                      </Button>
                      
                      <Button 
                        size="lg" 
                        variant="outline"
                        className="h-20 border-2 rounded-2xl font-black uppercase tracking-tighter gap-2 hover:bg-accent/5 transition-transform hover:scale-[1.03]"
                        onClick={() => openLead(currentMission.leadId)}
                      >
                        <ExternalLink className="h-5 w-5" /> Abrir Card
                      </Button>

                      <Button 
                        size="lg" 
                        variant="ghost"
                        className="h-20 rounded-2xl font-black uppercase tracking-tighter gap-2 text-muted-foreground hover:text-foreground transition-all"
                        onClick={handleSkip}
                      >
                        <SkipForward className="h-5 w-5" /> Pular
                      </Button>
                    </div>

                    <div className="pt-4 flex justify-center">
                      <Button 
                        variant="link" 
                        className="text-accent font-black uppercase tracking-widest text-[10px] gap-2 h-auto p-0"
                        onClick={handleComplete}
                      >
                        <Check className="h-3 w-3" /> Marcar como concluída e buscar próxima
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
