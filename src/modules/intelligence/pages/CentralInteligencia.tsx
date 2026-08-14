import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { IntelligenceRepository } from "../services/IntelligenceRepository";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import {
  Plus, Send, Trash2, Sparkles, Brain, User, Library, Loader2, Pencil, ChevronDown, Bot, Copy, RefreshCw, Info, ShieldAlert, MoreVertical
} from "lucide-react";
import { cn } from "@/shared/utils/utils";
import { 
  getLeads, getPipelineForStage, type Lead, 
  COLD_CALL_STAGES, OPORTUNIDADES_STAGES, getGoalsSettings 
} from "@/shared/services/store";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type Specialist = "diretor_comercial" | "consultor_leads" | "mentor_p21";

interface Conversation {
  id: string; title: string; updated_at: string;
}
interface ChatMessage {
  id: string; role: "user" | "assistant" | "system"; content: string;
  specialist?: Specialist | null;
  citations?: Array<{ documentId: string; titulo: string; categoria: string; versao: number; similarity: number }> | null;
  observability?: Record<string, any> | null;
  created_at?: string;
}

const SPECIALIST_META: Record<Specialist, { label: string; icon: typeof Brain }> = {
  diretor_comercial: { label: "Diretor Comercial", icon: Brain },
  consultor_leads:   { label: "Consultor de Leads", icon: User },
  mentor_p21:        { label: "Mentor P21",        icon: Library },
};

function MessageInspector({ observability }: { observability?: Record<string, any> | null }) {
  if (!observability) return <div className="text-xs text-muted-foreground p-2">Nenhum metadado.</div>;
  return (
    <div className="space-y-4 text-xs font-mono p-2">
      <div>Intenção: {observability.intention}</div>
      <div>Especialista: {observability.specialist}</div>
      <div>Dados Operacionais: {Array.isArray(observability.operational_data) ? observability.operational_data.join(", ") : "nenhum"}</div>
      <div>Knowledge: {observability.knowledge_result}</div>
      <div>Latência: {observability.latency_ms}ms</div>
    </div>
  );
}


function useOpenLeadContext(): Lead | null {
  const [lead, setLead] = useState<Lead | null>(null);
  useEffect(() => {
    try { const raw = sessionStorage.getItem("intel:openLead"); if (raw) setLead(JSON.parse(raw)); } catch {}
  }, []);
  return lead;
}

function buildLeadContext(lead: Lead | null) {
  if (!lead) return null;
  return { id: lead.id, empresa: lead.company, contato: lead.contact, telefone: lead.phone, cidade: lead.city, niche: lead.niche, icp: lead.icpStars, stage: lead.stage };
}

function buildDashboardSnapshot() {
  try {
    const leads = getLeads();
    const goals = getGoalsSettings();
    const byStage: Record<string, number> = {};
    leads.forEach((l) => { byStage[l.stage] = (byStage[l.stage] ?? 0) + 1; });
    const oportunidades = leads.filter((l) => OPORTUNIDADES_STAGES.includes(l.stage as any));
    const coldCall = leads.filter((l) => COLD_CALL_STAGES.includes(l.stage as any));
    const pipelineValue = oportunidades.reduce((s, l) => s + (l.contractValue ?? 0), 0);
    
    return {
      totalLeads: leads.length,
      coldCall: coldCall.length,
      oportunidades: oportunidades.length,
      pipelineValueBRL: pipelineValue,
      distribuicaoPorEtapa: byStage,
      metaMensal: goals.monthlyRevenueGoal,
    };
  } catch { return null; }
}


export default function CentralInteligencia() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [override, setOverride] = useState<Specialist | "auto">("auto");
  const [debugMode, setDebugMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastFetchId = useRef<string | null>(null);
  const openLead = useOpenLeadContext();

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setIsAdmin(data.user?.email === "vitorco23@gmail.com")); }, []);

  const refreshConversations = useCallback(async () => {
    const data = await IntelligenceRepository.listConversations();
    setConversations(data ?? []);
  }, []);

  useEffect(() => { refreshConversations(); }, [refreshConversations]);

  useEffect(() => {
    if (!activeId) { 
      setMessages([]); 
      lastFetchId.current = null;
      return; 
    }
    
    lastFetchId.current = activeId;
    const currentFetchId = activeId;
    
    IntelligenceRepository.listMessages(activeId).then(data => {
      // Proteção contra fetch fora de ordem
      if (lastFetchId.current === currentFetchId) {
        setMessages((data ?? []) as ChatMessage[]);
      }
    });
  }, [activeId]);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || sending) return;
    
    let convId = activeId;
    const optimisticUser: ChatMessage = { 
      id: `tmp-u-${Date.now()}`, 
      role: "user", 
      content: q, 
      created_at: new Date().toISOString() 
    };
    
    // Mantém as mensagens atuais e adiciona a otimista
    setMessages(prev => [...prev, optimisticUser]);
    setInput("");
    setSending(true);

    try {
      if (!convId) {
        // Gera título curto (aprox 50 chars)
        const newTitle = q.length > 50 ? q.slice(0, 47) + "..." : q;
        const newConv = await IntelligenceRepository.createConversation(newTitle);
        convId = newConv.id;
        
        // Protegemos o estado: dizemos que o último fetch foi para este novo ID
        // assim o useEffect que vai rodar após o setActiveId não limpará o estado.
        lastFetchId.current = convId;
        setActiveId(convId);
        
        // Atualiza a lista lateral para incluir a nova conversa
        setConversations(prev => [newConv, ...prev]);
      }

      const data = await IntelligenceRepository.ask({
        question: q,
        conversationId: convId,
        specialistOverride: override === "auto" ? undefined : override,
        // History: somente mensagens anteriores da conversa atual, ignorando a otimista que acabamos de adicionar
        history: messages.map(m => ({ role: m.role, content: m.content })),
        context: { 
          page: window.location.pathname, 
          leadContext: buildLeadContext(openLead),
          dashboardSnapshot: buildDashboardSnapshot()
        },
      });
      
      const visibleContent = typeof data?.content === 'string' ? data.content : "(sem resposta)";

      const reply: ChatMessage = {
        id: `tmp-a-${Date.now()}`, 
        role: "assistant", 
        content: visibleContent,
        specialist: (data?.specialist ?? null) as ChatMessage["specialist"],
        observability: (data?.observability ?? null) as ChatMessage["observability"],
        created_at: new Date().toISOString(),
      };
      
      setMessages(prev => [...prev, reply]);
    } catch (error: any) {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    } finally { 
      setSending(false); 
    }
  }, [input, sending, activeId, override, openLead, messages, refreshConversations]);

  const handleRename = async (id: string) => {
    const title = editTitle.trim();
    console.log(`[ConversationCRUD] rename_clicked id=${id} new_title=${title}`);
    
    if (!title) {
      console.log("[ConversationCRUD] rename canceled: empty title");
      setEditingId(null);
      return;
    }

    try {
      console.log("[ConversationCRUD] mutation_started: rename");
      await IntelligenceRepository.renameConversation(id, title);
      console.log("[ConversationCRUD] mutation_success: rename");
      setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
      setEditingId(null);
      toast({ title: "Conversa renomeada" });
    } catch (error: any) {
      console.error("[ConversationCRUD] mutation_error: rename", error);
      toast({
        title: "Erro ao renomear",
        description: error.message,
        variant: "destructive",
      });
      // Importante: resetar o estado de edição mesmo em erro para não travar a UI
      setEditingId(null);
    }
  };

  const handleDelete = async () => {
    const id = deleteId;
    console.log(`[ConversationCRUD] delete_clicked id=${id}`);
    if (!id) return;

    try {
      console.log("[ConversationCRUD] mutation_started: delete");
      await IntelligenceRepository.deleteConversation(id);
      console.log("[ConversationCRUD] mutation_success: delete");
      
      const remaining = conversations.filter(c => c.id !== id);
      setConversations(remaining);
      
      if (activeId === id) {
        setActiveId(remaining.length > 0 ? remaining[0].id : null);
      }
      
      setDeleteId(null);
      toast({ title: "Conversa excluída" });
    } catch (error: any) {
      console.error("[ConversationCRUD] mutation_error: delete", error);
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
      setDeleteId(null);
    }
  };


  return (
    <div className="flex h-[calc(100vh-64px)] bg-background">
      <aside className="w-[220px] flex-shrink-0 border-r bg-background p-3 flex flex-col gap-3 hidden md:flex">
        <Button onClick={() => setActiveId(null)} variant="outline" className="w-full justify-start gap-2 h-9 text-xs">
          <Plus className="h-3.5 w-3.5" /> Nova conversa
        </Button>
        <ScrollArea className="flex-1">
          <div className="space-y-1">
            {conversations.map(c => (
              <div 
                key={c.id} 
                className={cn(
                  "group flex items-center w-full rounded-md text-xs px-2 py-1.5 cursor-pointer hover:bg-muted relative", 
                  activeId === c.id ? "bg-muted font-medium" : ""
                )}
              >
                {editingId === c.id ? (
                  <Input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(c.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={() => handleRename(c.id)}
                    className="h-6 py-0 px-1 text-xs border-primary focus-visible:ring-0"
                  />
                ) : (
                  <>
                    <button 
                      className="flex-1 text-left truncate pr-6" 
                      onClick={() => setActiveId(c.id)}
                    >
                      {c.title}
                    </button>
                    <div className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-5 w-5 hover:bg-background/50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-32">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(c.id);
                            setEditTitle(c.title);
                          }}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Renomear
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteId(c.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir conversa?</DialogTitle>
              <DialogDescription>
                Essa conversa e suas mensagens serão removidas. Essa ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-background relative">
        <ScrollArea className="flex-1 p-6" ref={scrollRef}>
          <div className="max-w-[800px] mx-auto space-y-8">
            {messages.length === 0 ? (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center opacity-60 space-y-4">
                <Sparkles className="h-10 w-10 text-primary" />
                <h2 className="text-xl font-bold">Performance21 IA</h2>
                <p className="text-sm">Como posso ajudar na operação hoje?</p>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {["Analisar funil", "Avaliar lead", "Dúvida comercial", "Consultar metodologia"].map(t => (
                    <Button key={t} variant="ghost" size="sm" className="text-[10px]" onClick={() => setInput(t)}>{t}</Button>
                  ))}
                </div>
              </div>
            ) : (
               <div className="space-y-10 pb-20">
                  {messages.map(m => (
                    <div key={m.id} className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
                      {m.role === "assistant" && (
                        <div className="flex items-center gap-2 text-xs font-semibold opacity-70 mb-1">
                          <Bot className="h-3.5 w-3.5" /> {m.specialist ? SPECIALIST_META[m.specialist].label : "Diretor Comercial"}
                        </div>
                      )}
                      <div className={cn("rounded-2xl max-w-[85%] text-sm leading-relaxed", m.role === "user" ? "bg-primary text-primary-foreground px-5 py-3 shadow-sm" : "bg-transparent w-full")}>
                        {m.role === "user" ? m.content : (
                          <div className="prose prose-sm dark:prose-invert prose-p:my-2 prose-headings:mb-2 prose-headings:mt-4 prose-ul:my-2">
                            <ReactMarkdown>{m.content}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                      {m.role === "assistant" && (
                        <div className="flex gap-3 text-[10px] text-muted-foreground opacity-50 mt-1">
                           <button className="hover:text-foreground flex items-center gap-1"><Copy className="h-3 w-3" /> Copiar</button>
                           {isAdmin && <button className="hover:text-foreground" onClick={() => setDebugMode(!debugMode)}>{debugMode ? "Debug ON" : "Debug"}</button>}
                           {debugMode && m.observability && (
                             <Dialog>
                               <DialogTrigger asChild><button className="hover:text-foreground underline">Metadados</button></DialogTrigger>
                               <DialogContent><MessageInspector observability={m.observability} /></DialogContent>
                             </Dialog>
                           )}
                        </div>
                      )}
                    </div>
                  ))}
                  {sending && <div className="text-sm opacity-50 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Processando...</div>}
               </div>
            )}
          </div>
        </ScrollArea>

        <div className="absolute bottom-6 left-0 right-0 px-6">
           <div className="max-w-[800px] mx-auto border rounded-2xl bg-card shadow-2xl p-2 focus-within:ring-1 focus-within:ring-primary/50 transition-all">
              <div className="flex items-center gap-2 px-2 pb-1">
                <DropdownMenu>
                   <DropdownMenuTrigger asChild>
                     <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1 px-2 text-muted-foreground hover:bg-muted rounded-full">
                       <Sparkles className="h-3 w-3" /> {override === "auto" ? "✨ Auto" : SPECIALIST_META[override].label} <ChevronDown className="h-2.5 w-2.5" />
                     </Button>
                   </DropdownMenuTrigger>
                   <DropdownMenuContent>
                     <DropdownMenuItem onClick={() => setOverride("auto")}>✨ Auto</DropdownMenuItem>
                     {Object.keys(SPECIALIST_META).map(s => <DropdownMenuItem key={s} onClick={() => setOverride(s as Specialist)}>{SPECIALIST_META[s as Specialist].label}</DropdownMenuItem>)}
                   </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-end gap-2 pr-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Pergunte sobre sua operação..."
                  className="border-none shadow-none focus-visible:ring-0 min-h-[44px] max-h-[200px] resize-none py-2 text-sm"
                />
                <Button onClick={send} size="icon" className="h-8 w-8 rounded-xl shrink-0 mb-1" disabled={sending}><Send className="h-4 w-4" /></Button>
              </div>
           </div>
        </div>
      </main>
    </div>
  );
}
