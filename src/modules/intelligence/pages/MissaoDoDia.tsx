import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Target, RotateCcw, Brain, Phone, ExternalLink, Check, Flame, Activity, UserCheck, CalendarCheck, FileText, Pencil, Sparkles, AlertCircle } from "lucide-react";
import { PageContainer } from "@/shared/components/shell";
import { getLeads, getSessions, getGoalsSettings, type Lead } from "@/shared/services/store";
import { computePriorityLeads, getCache } from "@/modules/intelligence/services/priorityLeads";
import { openLead, OPEN_LEAD_EVENT, type PendingOpenLead } from "@/modules/leads/services/openLead";
import { resetMissionDay } from "@/modules/intelligence/services/missionStore";
import { isToday } from "date-fns";
import LeadDetailDrawer from "@/modules/leads/components/LeadDetailDrawer";

export default function MissaoDoDia() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [tick, setTick] = useState(0);
  const [missionIndex, setMissionIndex] = useState(0);

  // Estado do Modal Inteligente (SPRINT 6)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [drawerTab, setDrawerTab] = useState<any>(undefined);
  const [drawerAction, setDrawerAction] = useState<any>(undefined);

  const bump = () => setTick(t => t + 1);

  const handleNextInQueue = () => {
    const cache = getCache();
    if (cache && cache.leads && missionIndex < cache.leads.length - 1) {
      setMissionIndex(prev => prev + 1);
    } else {
      setShowCompletion(true);
    }
  };

  const handleComplete = () => {
    // Ao concluir, avançamos automaticamente na fila
    handleNextInQueue();
    setDrawerOpen(false); 
    toast({ title: "Missão Concluída", description: "Operação atualizada." });
    
    // Pequeno delay para a animação de fechar o drawer terminar
    setTimeout(() => {
      setDrawerLead(null);
      setDrawerTab(undefined);
      setDrawerAction(undefined);
      bump();
    }, 300);
  };

  // Escuta evento global de abertura de lead para interceptar na Missão do Dia
  useEffect(() => {
    const handler = (e: any) => {
      const payload = e.detail as PendingOpenLead;
      const targetLead = getLeads().find(l => l.id === payload.leadId);
      if (targetLead) {
        setDrawerLead(targetLead);
        setDrawerTab(payload.tab);
        setDrawerAction(payload.action);
        setDrawerOpen(true);
      }
    };
    window.addEventListener(OPEN_LEAD_EVENT, handler);
    return () => window.removeEventListener(OPEN_LEAD_EVENT, handler);
  }, [tick]);

  useEffect(() => {
    const handler = () => handleComplete();
    window.addEventListener("p21:complete-mission", handler);
    return () => window.removeEventListener("p21:complete-mission", handler);
  }, [tick]);

  // Metas e Progresso (SPRINT 5)
  const g = useMemo(() => getGoalsSettings(), [tick]);
  const progressData = useMemo(() => {
    const sessions = getSessions().filter((s) => isToday(new Date(s.startTime)));
    
    // Engenharia reversa das metas (mesma lógica de Metas.tsx)
    const workingDaysPerMonth = g.workingDaysPerWeek * 4.33;
    const closes = g.averageTicket > 0 ? g.monthlyRevenueGoal / g.averageTicket : 0;
    const r = (n: number) => Math.max(n, 0.0001) / 100;
    const meetingsHeld = closes / r(g.meetingHeldToClose);
    const meetingsScheduled = meetingsHeld / r(g.meetingScheduledToHeld);
    const decisionMakers = meetingsScheduled / r(g.decisionMakerToMeetingScheduled);
    const connections = decisionMakers / r(g.connectionToDecisionMaker);
    const calls = connections / r(g.callToConnection);
    
    const callsGoal = workingDaysPerMonth > 0 ? calls / workingDaysPerMonth : 0;
    const decisionMakersGoal = workingDaysPerMonth > 0 ? decisionMakers / workingDaysPerMonth : 0;
    const meetingsGoal = workingDaysPerMonth > 0 ? meetingsScheduled / workingDaysPerMonth : 0;
    const proposalsGoal = meetingsGoal * 0.7; // Estimativa para propostas

    return [
      { 
        label: "Ligações", 
        real: sessions.reduce((a, s) => a + (s.calls || 0), 0), 
        goal: Math.ceil(callsGoal),
        icon: Phone 
      },
      { 
        label: "Follow-ups", 
        real: sessions.reduce((a, s) => a + (s.decisionMakers || 0), 0), 
        goal: Math.ceil(decisionMakersGoal),
        icon: UserCheck 
      },
      { 
        label: "Reuniões", 
        real: sessions.reduce((a, s) => a + (s.meetings || 0), 0), 
        goal: Math.ceil(meetingsGoal),
        icon: CalendarCheck 
      },
      { 
        label: "Propostas", 
        real: sessions.reduce((a, s) => a + ((s as any).proposals || 0), 0), 
        goal: Math.ceil(proposalsGoal),
        icon: FileText 
      },
    ];
  }, [g, tick]);

  const stats = useMemo(() => {
    const allLeads = getLeads();
    const IGNORE_STAGES = new Set(["Novos Leads", "Importados"]);
    const CLOSED = new Set(["Ganho", "Perdido"]);
    
    // Oportunidades ativas: não fechadas e não ignoradas
    const activeLeads = allLeads.filter(l => !CLOSED.has(l.stage) && !IGNORE_STAGES.has(l.stage));
    
    const followups = allLeads.filter(l => l.stage.startsWith("Tentativa")).length;
    const meetings = allLeads.filter(l => 
      l.stage.includes("Reunião Marcada") || 
      l.stage.includes("Reunião Realizada")
    ).length;
    const proposals = allLeads.filter(l => l.stage.includes("Proposta")).length;
    
    return { 
      totalActive: activeLeads.length, 
      followups, 
      meetings, 
      proposals 
    };
  }, [tick]);

  // Memoiza o cache para evitar cálculos desnecessários a cada render
  const missionCache = useMemo(() => getCache(), [tick]);
  const activeMission = useMemo(() => {
    if (showCompletion) return null;
    return missionCache?.leads?.[missionIndex] || null;
  }, [missionCache, showCompletion, missionIndex]);

  const handleGenerateMission = async () => {
    if (isUpdating) return;
    
    setIsUpdating(true);
    setShowCompletion(false);
    setMissionIndex(0);
    
    try {
      // Limpa o cache para forçar uma nova análise
      localStorage.removeItem("p21_priority_leads_cache");
      
      const result = await computePriorityLeads(true);
      
      if (!result.leads || result.leads.length === 0) {
        toast({ title: "Tudo em dia", description: "O Diretor Comercial IA não encontrou ações prioritárias agora." });
      }
      bump();
    } catch (error) {
      console.error("Erro IA:", error);
      toast({ variant: "destructive", title: "Erro na análise", description: "Não foi possível conectar com a Inteligência no momento." });
    } finally {
      setIsUpdating(false);
    }
  };


  const lead = useMemo(() => {
    if (!activeMission) return null;
    return getLeads().find(l => l.id === activeMission.leadId);
  }, [activeMission, tick]);

  const prioritySinais = useMemo(() => {
    if (!activeMission) return [];
    if (activeMission.motivo) {
      // Divide o motivo em sentenças para mostrar como bullets
      return activeMission.motivo
        .split(/[.;]|\n/)
        .map(s => s.trim())
        .filter(s => s.length > 5);
    }
    return [];
  }, [activeMission]);


  return (
    <PageContainer>
      <div className="max-w-xl mx-auto space-y-6 py-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        <div className="text-center">
          <h1 className="text-3xl font-black tracking-tighter text-foreground italic uppercase flex items-center justify-center gap-2">
            🎯 MISSÃO DO DIA
          </h1>
        </div>

        {/* 1. Progresso do Dia */}
        <Card className="border-none bg-card/40 rounded-3xl shadow-sm border border-white/5">
          <CardContent className="p-5 space-y-4">
            <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Activity className="h-3 w-3" /> Progresso do Dia
            </h4>
            <div className="grid grid-cols-1 gap-3">
              {progressData.map((p) => {
                const pct = p.goal > 0 ? Math.min((p.real / p.goal) * 100, 100) : 0;
                const barColor = pct < 60 ? "bg-destructive" : pct < 85 ? "bg-yellow-500" : "bg-accent";
                return (
                  <div key={p.label} className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <p.icon className="h-3 w-3" /> {p.label}
                      </span>
                      <span className="text-foreground">{p.real} / {p.goal} <span className="ml-1 opacity-50">({Math.round(pct)}%)</span></span>
                    </div>
                    <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} transition-all duration-1000`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* 2. Resumo da Análise IA */}
        <div className="px-4 space-y-2">
          <div className="flex items-center gap-2 text-accent">
            <Brain className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-[0.2em]">Diretor Comercial IA</span>
          </div>
          <div className="bg-accent/5 border border-accent/10 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Operação analisada</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <span className="text-[10px] font-black text-foreground">✔ {stats.totalActive} OPORTUNIDADES ATIVAS</span>
              <span className="text-[10px] font-black text-foreground">✔ {stats.followups} FOLLOW-UPS</span>
              <span className="text-[10px] font-black text-foreground">✔ {stats.meetings} REUNIÕES</span>
              <span className="text-[10px] font-black text-foreground">✔ {stats.proposals} PROPOSTAS</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed font-medium">
              Após analisar toda a operação, esta foi considerada a ação de maior impacto para este momento.
            </p>
          </div>
        </div>

        {/* 3. Card de Missão Central */}
        {!activeMission ? (
          <Card className="border-none bg-card/30 rounded-[2rem] shadow-xl overflow-hidden border border-white/5">
            <CardContent className="p-8 text-center space-y-6">
              <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto">
                {showCompletion ? <Check className="h-6 w-6 text-accent" /> : <Brain className="h-6 w-6 text-accent" />}
              </div>
              
              {showCompletion ? (
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-foreground tracking-tighter italic uppercase">✅ Todas as prioridades deste ciclo foram concluídas.</h2>
                  <p className="text-sm font-bold text-accent uppercase tracking-widest">Operação atualizada.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-foreground tracking-tighter italic uppercase">Pronto para começar?</h2>
                  <p className="text-xs text-muted-foreground font-medium">O Diretor IA aguarda sua instrução para definir o próximo alvo.</p>
                </div>
              )}

              <Button 
                size="lg" 
                className="h-16 px-8 text-sm gap-3 bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg rounded-2xl font-black uppercase tracking-tighter transition-all hover:scale-[1.02] active:scale-95 w-full md:w-auto"
                onClick={handleGenerateMission}
                disabled={isUpdating}
              >
                {isUpdating ? <RotateCcw className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                {showCompletion ? "Gerar Próxima Missão" : "Gerar Missão Inteligente"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-none bg-card shadow-2xl rounded-[1.5rem] overflow-hidden border border-border/50">
            <CardContent className="p-0">
              <div className="p-6 border-b border-border/50">
                <div className="flex justify-between items-start mb-1">
                  <h4 className="text-[10px] font-black text-accent uppercase tracking-[0.3em]">🎯 SUA PRÓXIMA MISSÃO</h4>
                  <div className="flex items-center gap-1.5 bg-accent/10 text-accent px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
                    <Flame className="h-2.5 w-2.5 fill-current" />
                    Prioridade {activeMission.score || (activeMission.impacto === "critico" ? 90 : 70)}
                  </div>
                </div>
                <h3 className="text-3xl font-black tracking-tighter text-foreground uppercase italic leading-none">
                  {lead?.company || "Empresa Selecionada"}
                </h3>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <h4 className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-3">POR QUE ESSA EMPRESA?</h4>
                  <ul className="space-y-2">
                    {prioritySinais.map((sinal, i) => (
                      <li key={i} className="text-sm font-bold text-foreground/90 flex items-start gap-2">
                        <span className="text-accent mt-1">•</span> {sinal}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="h-px bg-border/50" />

                <div>
                  <h4 className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-2">PRÓXIMA AÇÃO</h4>
                  <p className="text-lg font-black text-foreground uppercase tracking-tight leading-tight">
                    {activeMission.proximaAcao}
                  </p>
                </div>

                <div className="h-px bg-border/50" />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Button 
                    className="h-14 bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl font-black uppercase tracking-tighter gap-2 text-sm shadow-md"
                    onClick={() => openLead(activeMission.leadId, { tab: "interacoes", action: "new-interaction" })}
                  >
                    <Phone className="h-4 w-4" /> Ligar
                  </Button>
                  <Button 
                    variant="outline"
                    className="h-14 border-2 rounded-xl font-black uppercase tracking-tighter gap-2 text-sm"
                    onClick={() => openLead(activeMission.leadId)}
                  >
                    <ExternalLink className="h-4 w-4" /> Abrir Card
                  </Button>
                  <Button 
                    variant="ghost"
                    className="h-14 rounded-xl font-black uppercase tracking-tighter gap-2 text-muted-foreground text-sm"
                    onClick={handleNextInQueue}
                  >
                    <RotateCcw className="h-4 w-4" /> Outra Missão
                  </Button>
                </div>

                <div className="pt-2 flex justify-center">
                  <Button 
                    variant="link" 
                    className="text-muted-foreground hover:text-accent font-black uppercase tracking-[0.2em] text-[9px] gap-2 h-auto p-0"
                    onClick={handleComplete}
                  >
                    <Check className="h-3 w-3" /> Concluir e buscar próxima
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-center opacity-10 flex flex-col items-center gap-1 pt-4">
          <div className="h-px w-12 bg-muted-foreground" />
          <p className="text-[7px] uppercase tracking-[0.3em] font-black">Interface Executiva SOC</p>
        </div>

        {/* Modal Inteligente do Lead (SPRINT 6) */}
        <LeadDetailDrawer 
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          lead={drawerLead}
          initialTab={drawerTab}
          initialAction={drawerAction}
          onRefresh={() => {
            bump();
            if (drawerLead) {
              const updated = getLeads().find(l => l.id === drawerLead.id);
              if (updated) setDrawerLead(updated);
            }
          }}
        />
      </div>
    </PageContainer>
  );
}
