import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Target, RotateCcw, Brain, Phone, MessageSquare, Users, FileText } from "lucide-react";
import { PageContainer } from "@/shared/components/shell";
import { getLeads } from "@/shared/services/store";
import { computePriorityLeads, getCache } from "@/modules/intelligence/services/priorityLeads";
import { openLead } from "@/modules/leads/services/openLead";

export default function MissaoDoDia() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [tick, setTick] = useState(0);

  const bump = () => setTick(t => t + 1);

  // 1. Indicadores (Dados reais do CRM)
  const stats = useMemo(() => {
    const allLeads = getLeads();
    
    // Novas ligações: Leads em "Novo Lead"
    const newCalls = allLeads.filter(l => l.stage === "Novo Lead").length;
    
    // Follow-ups pendentes: Leads em qualquer etapa de "Tentativa X"
    const followups = allLeads.filter(l => l.stage.startsWith("Tentativa")).length;
    
    // Reuniões: Leads em etapas de reunião
    const meetings = allLeads.filter(l => 
      l.stage.includes("Reunião Marcada") || 
      l.stage.includes("Reunião Realizada")
    ).length;
    
    // Propostas: Leads em "Proposta Enviada"
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
      } else {
        toast({ title: "Missão Identificada", description: "Foco total na próxima ação." });
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

        {/* CARD CENTRAL: 🧠 DIRETOR COMERCIAL IA */}
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

        {/* RODAPÉ ESTRUTURAL (Elimina poluição visual) */}
        <div className="text-center opacity-20 flex flex-col items-center gap-2">
          <div className="h-px w-20 bg-muted-foreground" />
          <p className="text-[8px] uppercase tracking-[0.4em] font-black">Fim da Interface Operacional</p>
        </div>
      </div>
    </PageContainer>
  );
}
