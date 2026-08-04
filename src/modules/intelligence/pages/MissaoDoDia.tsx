import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Target, RotateCcw, Brain, Phone, ExternalLink, SkipForward, Check, FileText, Flame } from "lucide-react";
import { PageContainer } from "@/shared/components/shell";
import { getLeads } from "@/shared/services/store";
import { computePriorityLeads, getCache } from "@/modules/intelligence/services/priorityLeads";
import { openLead } from "@/modules/leads/services/openLead";
import { resetMissionDay } from "@/modules/intelligence/services/missionStore";

export default function MissaoDoDia() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
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
  const activeMission = !showCompletion ? (missionCache?.leads?.[0] || null) : null;

  const handleGenerateMission = async () => {
    setIsUpdating(true);
    setShowCompletion(false);
    try {
      // SPRINT 5: Recalcula toda a operação do zero limpando cache primeiro
      localStorage.removeItem("p21_priority_leads_cache");
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
    // SPRINT 5: Mostra tela de conclusão em vez de buscar próxima automaticamente
    resetMissionDay();
    localStorage.removeItem("p21_priority_leads_cache");
    setShowCompletion(true);
    toast({ title: "Missão Concluída", description: "Operação atualizada." });
    bump();
  };

  const handleSkip = () => {
    handleGenerateMission();
  };

  const lead = useMemo(() => {
    if (!activeMission) return null;
    return getLeads().find(l => l.id === activeMission.leadId);
  }, [activeMission, tick]);

  // Sinais de prioridade para a lista de "Por que essa empresa?"
  const prioritySinais = useMemo(() => {
    if (!lead) return [];
    
    // Tenta pegar sinais da heurística do buildCandidates ou deriva do lead
    const audit = lead.callNotes?.find(n => n.analysis?.data)?.analysis?.data;
    const signs: string[] = [];
    
    if (lead.stage === "Novo Lead") signs.push("Novo Lead aguardando contato");
    if (lead.stage.includes("Proposta")) signs.push("Proposta enviada sem retorno");
    if (lead.temperature === "Quente" || audit?.temperatura === "Quente") signs.push("Lead altamente aquecido");
    if (lead.contractValue && lead.contractValue > 5000) signs.push("Alto potencial financeiro");
    
    // Fallback para o motivo da IA se a lista estiver vazia
    if (signs.length === 0 && activeMission?.motivo) {
      return activeMission.motivo.split(/[.;]|\n/).filter(s => s.trim().length > 5).slice(0, 5);
    }
    
    return signs.slice(0, 5);
  }, [lead, activeMission]);

  return (
    <PageContainer>
      <div className="max-w-2xl mx-auto space-y-12 py-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* HEADER: 🎯 MISSÃO DO DIA */}
        <div className="text-center space-y-8">
          <h1 className="text-4xl font-black tracking-tighter text-foreground italic uppercase flex items-center justify-center gap-3">
            🎯 {activeMission ? "SUA PRÓXIMA MISSÃO" : "MISSÃO DO DIA"}
          </h1>

          {!activeMission && (
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
          )}
        </div>

        {/* CARD CENTRAL OU CONCLUSÃO */}
        {!activeMission ? (
          <Card className="border-none bg-card/30 rounded-[2rem] shadow-xl overflow-hidden border border-white/5">
            <CardContent className="p-10 text-center space-y-8">
              <div className="space-y-3">
                <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  {showCompletion ? <Check className="h-8 w-8 text-accent" /> : <Brain className="h-8 w-8 text-accent" />}
                </div>
                
                {showCompletion ? (
                  <div className="space-y-4">
                    <h2 className="text-3xl font-black text-foreground tracking-tighter italic uppercase">
                      ✅ Missão concluída.
                    </h2>
                    <p className="text-lg font-bold text-accent leading-tight uppercase tracking-widest">
                      Operação atualizada.
                    </p>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
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
                {showCompletion ? "Gerar Próxima Missão Inteligente" : "Gerar Missão Inteligente"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="w-full animate-in zoom-in-95 fade-in duration-500">
            <Card className="border-none bg-card/30 overflow-hidden rounded-[2.5rem] shadow-2xl border border-white/5">
              <CardContent className="p-0">
                {/* Cabeçalho da Missão */}
                <div className="bg-accent/10 p-10 border-b border-accent/20 text-center space-y-4">
                  <h3 className="text-5xl md:text-6xl font-black tracking-tighter text-foreground uppercase italic break-words leading-none">
                    {lead?.company || "Lead Selecionado"}
                  </h3>
                  
                  <div className="flex items-center justify-center gap-2">
                    <div className="bg-accent text-accent-foreground px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                      <Flame className="h-3 w-3 fill-current" />
                      Prioridade {activeMission.impacto === "critico" ? "Crítica" : activeMission.impacto === "alto" ? "Alta" : "Média"}
                    </div>
                  </div>
                </div>

                <div className="p-10 space-y-10">
                  {/* Justificativa */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-accent uppercase tracking-[0.3em] flex items-center gap-2">
                      Por que essa empresa?
                    </h4>
                    <ul className="space-y-3">
                      {prioritySinais.length > 0 ? (
                        prioritySinais.map((sinal, i) => (
                          <li key={i} className="text-lg font-bold text-foreground/90 flex items-start gap-3">
                            <span className="text-accent mt-1.5">•</span>
                            {sinal}
                          </li>
                        ))
                      ) : (
                        <li className="text-lg font-bold text-foreground/90 flex items-start gap-3">
                          <span className="text-accent mt-1.5">•</span>
                          {activeMission.motivo}
                        </li>
                      )}
                    </ul>
                  </div>

                  {/* Ação Recomendada */}
                  <div className="space-y-3 bg-foreground/5 p-6 rounded-2xl border border-foreground/5">
                    <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">
                      Próxima ação recomendada
                    </h4>
                    <p className="text-xl font-black text-foreground uppercase tracking-tight">
                      {activeMission.proximaAcao}
                    </p>
                  </div>

                  {/* Ações */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Button 
                      size="lg" 
                      className="h-20 bg-accent text-accent-foreground hover:bg-accent/90 rounded-2xl font-black uppercase tracking-tighter gap-3 transition-transform hover:scale-[1.03] text-lg shadow-[0_10px_30px_rgba(154,189,51,0.2)]"
                      onClick={() => openLead(activeMission.leadId, { tab: "interacoes" })}
                    >
                      <Phone className="h-6 w-6" /> Ligar
                    </Button>
                    
                    <Button 
                      size="lg" 
                      variant="outline"
                      className="h-20 border-2 border-foreground/10 rounded-2xl font-black uppercase tracking-tighter gap-3 hover:bg-foreground/5 transition-transform hover:scale-[1.03] text-lg"
                      onClick={() => openLead(activeMission.leadId)}
                    >
                      <ExternalLink className="h-6 w-6" /> Abrir Card
                    </Button>

                    <Button 
                      size="lg" 
                      variant="ghost"
                      className="h-20 rounded-2xl font-black uppercase tracking-tighter gap-3 text-muted-foreground hover:text-foreground transition-all text-lg"
                      onClick={handleSkip}
                    >
                      <RotateCcw className="h-6 w-6" /> Gerar Outra Missão
                    </Button>
                  </div>

                  <div className="pt-2 flex justify-center">
                    <Button 
                      variant="link" 
                      className="text-muted-foreground hover:text-accent font-black uppercase tracking-[0.2em] text-[10px] gap-2 h-auto p-0 transition-colors"
                      onClick={handleComplete}
                    >
                      <Check className="h-3 w-3" /> Concluir e buscar próxima melhor ação
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* RODAPÉ ESTRUTURAL */}
        <div className="text-center opacity-20 flex flex-col items-center gap-2">
          <div className="h-px w-20 bg-muted-foreground" />
          <p className="text-[8px] uppercase tracking-[0.4em] font-black">Fim da Interface Operacional</p>
        </div>
      </div>
    </PageContainer>
  );
}
