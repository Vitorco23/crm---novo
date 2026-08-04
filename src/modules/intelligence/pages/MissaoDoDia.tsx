import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Target, RotateCcw, Brain, Phone, ExternalLink, SkipForward, Check, FileText } from "lucide-react";
import { PageContainer } from "@/shared/components/shell";
import { getLeads } from "@/shared/services/store";
import { computePriorityLeads, getCache } from "@/modules/intelligence/services/priorityLeads";
import { openLead } from "@/modules/leads/services/openLead";
import { resetMissionDay } from "@/modules/intelligence/services/missionStore";

export default function MissaoDoDia() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [tick, setTick] = useState(0);

  const bump = () => setTick(t => t + 1);

  const stats = useMemo(() => {
    const allLeads = getLeads();
    const newCalls = allLeads.filter(l => l.stage === "Novo Lead").length;
    const followups = allLeads.filter(l => l.stage.startsWith("Tentativa")).length;
    const meetings = allLeads.filter(l => 
      l.stage.includes("Reunião Marcada") || 
      l.stage.includes("Reunião Realizada")
    ).length;
    const proposals = allLeads.filter(l => l.stage.includes("Proposta")).length;

    return { newCalls, followups, meetings, proposals };
  }, [tick]);

  const missionCache = useMemo(() => getCache(), [tick]);
  const activeMission = missionCache?.leads?.[0] || null;

  const handleGenerateMission = async () => {
    setIsUpdating(true);
    try {
      const result = await computePriorityLeads(true);
      if (!result.leads || result.leads.length === 0) {
        toast({ 
          title: "Tudo em dia", 
          description: "O Diretor Comercial IA não encontrou ações prioritárias agora." 
        });
      }
      bump();
    } catch (error) {
      console.error("Erro IA:", error);
      toast({ 
        variant: "destructive", 
        title: "Erro na análise", 
        description: "Não foi possível conectar com a Inteligência no momento." 
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleComplete = () => {
    resetMissionDay();
    // Limpamos o cache local para forçar o estado de "Gerar"
    const CACHE_KEY = "p21_priority_leads_cache";
    localStorage.removeItem(CACHE_KEY);
    toast({ title: "Missão Concluída", description: "Buscando próxima melhor ação..." });
    bump();
  };

  const handleSkip = () => {
    handleGenerateMission();
    toast({ title: "Missão pulada", description: "Buscando outra oportunidade..." });
  };

  return (
    <PageContainer>
      <div className="max-w-2xl mx-auto space-y-12 py-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* HEADER: 🎯 MISSÃO DO DIA */}
        <div className="text-center space-y-8">
          <h1 className="text-4xl font-black tracking-tighter text-foreground italic uppercase flex items-center justify-center gap-3">
            🎯 MISSÃO DO DIA
          </h1>

          {/* INDICADORES PEQUENOS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-card/40 border border-border/50 text-center">
              <p className="text-2xl font-black text-accent">{stats.newCalls}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Novas ligações</p>
            </div>
            <div className="p-4 rounded-xl bg-card/40 border border-border/50 text-center">
              <p className="text-2xl font-black text-accent">{stats.followups}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Follow-ups</p>
            </div>
            <div className="p-4 rounded-xl bg-card/40 border border-border/50 text-center">
              <p className="text-2xl font-black text-accent">{stats.meetings}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Reuniões</p>
            </div>
            <div className="p-4 rounded-xl bg-card/40 border border-border/50 text-center">
              <p className="text-2xl font-black text-accent">{stats.proposals}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Propostas</p>
            </div>
          </div>
        </div>

        {/* ESTADO ATIVO OU GERAR */}
        {!activeMission ? (
          <Card className="border-none bg-card/30 rounded-[2rem] shadow-xl overflow-hidden border border-white/5">
            <CardContent className="p-10 text-center space-y-8">
              <div className="space-y-3">
                <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Brain className="h-8 w-8 text-accent" />
                </div>
                <h2 className="text-2xl font-black text-foreground tracking-tighter italic uppercase">
                  🧠 Diretor Comercial IA
                </h2>
                <div className="space-y-1 max-w-sm mx-auto">
                  <p className="text-lg font-bold text-foreground/90 leading-tight">
                    Sua operação está pronta para análise.
                  </p>
                  <p className="text-sm text-muted-foreground font-medium">
                    Clique abaixo para que a IA analise toda a operação e escolha qual deve ser sua próxima ação.
                  </p>
                </div>
              </div>

              <Button 
                size="lg" 
                className="h-20 px-10 text-xl gap-4 bg-accent text-accent-foreground hover:bg-accent/90 shadow-[0_15px_40px_rgba(154,189,51,0.2)] rounded-2xl font-black uppercase tracking-tighter transition-all hover:scale-[1.02] active:scale-95 border-b-4 border-black/20 w-full md:w-auto"
                onClick={handleGenerateMission}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <RotateCcw className="h-6 w-6 animate-spin" />
                ) : (
                  <Target className="h-6 w-6" />
                )}
                Gerar Missão Inteligente
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="w-full animate-in zoom-in-95 fade-in duration-500">
            <Card className="border-none bg-card/30 overflow-hidden rounded-[2.5rem] shadow-2xl border border-white/5">
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
                      {activeMission.proximaAcao}
                    </p>
                    <h3 className="text-5xl font-black tracking-tighter text-foreground uppercase">
                      {getLeads().find(l => l.id === activeMission.leadId)?.company || "Lead Selecionado"}
                    </h3>
                  </div>
                </div>

                <div className="p-10 space-y-10">
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-muted-foreground uppercase tracking-[0.3em] flex items-center gap-2">
                      <FileText className="h-3 w-3" /> Motivo da Decisão
                    </h4>
                    <p className="text-xl font-medium leading-relaxed text-foreground/90">
                      {activeMission.motivo}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <Button 
                      size="lg" 
                      className="h-20 bg-foreground text-background hover:bg-foreground/90 rounded-2xl font-black uppercase tracking-tighter gap-2 transition-transform hover:scale-[1.03]"
                      onClick={() => openLead(activeMission.leadId, { tab: "interacoes" })}
                    >
                      <Phone className="h-5 w-5" /> Ligar
                    </Button>
                    
                    <Button 
                      size="lg" 
                      variant="outline"
                      className="h-20 border-2 rounded-2xl font-black uppercase tracking-tighter gap-2 hover:bg-accent/5 transition-transform hover:scale-[1.03]"
                      onClick={() => openLead(activeMission.leadId)}
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

        <div className="text-center opacity-20 flex flex-col items-center gap-2">
          <div className="h-px w-20 bg-muted-foreground" />
          <p className="text-[8px] uppercase tracking-[0.4em] font-black">Fim da Interface Operacional</p>
        </div>
      </div>
    </PageContainer>
  );
}
