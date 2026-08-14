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
import { getLeads, getPipelineForStage, type Lead } from "@/shared/services/store";
import { COLD_CALL_STAGES, OPORTUNIDADES_STAGES } from "@/shared/services/store";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

export default function CentralInteligencia() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [override, setOverride] = useState<Specialist | "auto">("auto");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const openLead = useOpenLeadContext();

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setIsAdmin(data.user?.email === "vitorco23@gmail.com")); }, []);

  const refreshConversations = useCallback(async () => {
    const data = await IntelligenceRepository.listConversations();
    setConversations(data ?? []);
  }, []);

  useEffect(() => { refreshConversations(); }, [refreshConversations]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    IntelligenceRepository.listMessages(activeId).then(data => setMessages((data ?? []) as ChatMessage[]));
  }, [activeId]);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || sending) return;
    
    let convId = activeId;
    const optimistic: ChatMessage = { id: `tmp-${Date.now()}`, role: "user", content: q, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    setInput("");
    setSending(true);

    try {
      if (!convId) {
        const newConv = await IntelligenceRepository.createConversation(q.slice(0, 30));
        convId = newConv.id;
        setActiveId(convId);
        refreshConversations();
      }

      const data = await IntelligenceRepository.ask({
        question: q,
        conversationId: convId,
        specialistOverride: override === "auto" ? undefined : override,
        history: messages.map(m => ({ role: m.role, content: m.content })),
        context: { page: window.location.pathname, leadContext: buildLeadContext(openLead) },
      });
      
      const visibleContent = typeof data?.content === 'string' ? data.content : "(sem resposta)";

      const reply: ChatMessage = {
        id: `tmp-a-${Date.now()}`, role: "assistant", content: visibleContent,
        specialist: (data?.specialist ?? null) as ChatMessage["specialist"],
        observability: (data?.observability ?? null) as ChatMessage["observability"],
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, reply]);
    } finally { setSending(false); }
  }, [input, sending, activeId, override, openLead, messages, refreshConversations]);

  return (
    <div className="flex h-[calc(100vh-64px)] bg-background">
      <aside className="w-[220px] flex-shrink-0 border-r bg-background p-3 flex flex-col gap-3 hidden md:flex">
        <Button onClick={() => setActiveId(null)} variant="outline" className="w-full justify-start gap-2 h-9 text-xs">
          <Plus className="h-3.5 w-3.5" /> Nova conversa
        </Button>
        <ScrollArea className="flex-1">
           <div className="space-y-1">
             {conversations.map(c => (
               <div key={c.id} className={cn("group flex items-center w-full rounded-md text-xs px-2 py-1.5 cursor-pointer hover:bg-muted", activeId === c.id ? "bg-muted" : "")}>
                 <button className="flex-1 text-left truncate" onClick={() => setActiveId(c.id)}>{c.title}</button>
                 <div className="opacity-0 group-hover:opacity-100"><MoreVertical className="h-3 w-3" /></div>
               </div>
             ))}
           </div>
        </ScrollArea>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-background">
        <ScrollArea className="flex-1 p-6" ref={scrollRef}>
          <div className="max-w-[800px] mx-auto space-y-8">
            {messages.length === 0 ? (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center opacity-60 space-y-4">
                <Sparkles className="h-10 w-10 text-primary" />
                <h2 className="text-xl font-bold">Performance21 IA</h2>
                <p className="text-sm">Como posso ajudar na operação hoje?</p>
              </div>
            ) : (
               <div className="space-y-8">
                  {messages.map(m => (
                    <div key={m.id} className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
                      {m.role === "assistant" && (
                        <div className="flex items-center gap-2 text-xs font-semibold opacity-70 mb-1">
                          {m.specialist && <Bot className="h-3.5 w-3.5" />} {m.specialist ? SPECIALIST_META[m.specialist].label : "Diretor Comercial"}
                        </div>
                      )}
                      <div className={cn("px-5 py-4 rounded-2xl max-w-[85%] text-sm leading-relaxed", m.role === "user" ? "bg-primary text-primary-foreground shadow-sm" : "bg-transparent -ml-5 p-0")}>
                        {m.role === "user" ? m.content : <div className="prose prose-sm dark:prose-invert"><ReactMarkdown>{m.content}</ReactMarkdown></div>}
                      </div>
                      {m.role === "assistant" && (
                        <div className="flex gap-2 text-[10px] text-muted-foreground opacity-50">
                           <button className="hover:text-foreground">Copiar</button>
                           {debugMode && <button className="hover:text-foreground" onClick={() => alert(JSON.stringify(m.observability, null, 2))}>Debug</button>}
                        </div>
                      )}
                    </div>
                  ))}
                  {sending && <div className="text-sm opacity-50 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Processando...</div>}
               </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-background">
           <div className="max-w-[800px] mx-auto relative border rounded-xl bg-card shadow-lg p-2">
              <div className="flex items-center justify-between px-2 pb-2">
                <DropdownMenu>
                   <DropdownMenuTrigger asChild>
                     <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1.5 uppercase font-bold text-muted-foreground">
                       <Sparkles className="h-3 w-3" /> {override === "auto" ? "✨ Auto" : SPECIALIST_META[override].label} <ChevronDown className="h-3 w-3" />
                     </Button>
                   </DropdownMenuTrigger>
                   <DropdownMenuContent>
                     <DropdownMenuItem onClick={() => setOverride("auto")}>✨ Auto</DropdownMenuItem>
                     {Object.keys(SPECIALIST_META).map(s => <DropdownMenuItem key={s} onClick={() => setOverride(s as Specialist)}>{SPECIALIST_META[s as Specialist].label}</DropdownMenuItem>)}
                   </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pergunte sobre sua operação..."
                className="border-none shadow-none focus-visible:ring-0 min-h-[40px] max-h-[200px] resize-none"
              />
              <div className="flex justify-end pt-2">
                <Button onClick={send} size="sm" className="rounded-lg h-8 px-4" disabled={sending}>Enviar <Send className="h-3 w-3 ml-2" /></Button>
              </div>
           </div>
        </div>
      </main>
    </div>
  );
}
