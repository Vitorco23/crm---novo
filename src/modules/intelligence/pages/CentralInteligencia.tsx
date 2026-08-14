import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { IntelligenceRepository } from "../services/IntelligenceRepository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import {
  MessageCircle, Plus, Send, Trash2, Sparkles, Brain, User, Library, Loader2, ChevronRight, Pencil, ChevronDown, Bot, Copy, RefreshCw, ThumbsUp, ThumbsDown, Info, ShieldAlert
} from "lucide-react";
import { cn } from "@/shared/utils/utils";
import { getLeads, getPipelineForStage, type Lead } from "@/shared/services/store";
import { COLD_CALL_STAGES, OPORTUNIDADES_STAGES } from "@/shared/services/store";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

type Specialist = "diretor_comercial" | "consultor_leads" | "mentor_p21";

interface Conversation {
  id: string; title: string; updated_at: string;
}
interface ChatMessage {
  id: string; role: "user" | "assistant" | "system"; content: string;
  specialist?: Specialist | null;
  citations?: Array<{ documentId: string; titulo: string; categoria: string; versao: number; similarity: number }> | null;
  model_used?: string | null;
  observability?: Record<string, any> | null;
  created_at?: string;
}

const SPECIALIST_META: Record<Specialist, { label: string; icon: typeof Brain; color: string; description: string }> = {
  diretor_comercial: { label: "Diretor Comercial", icon: Brain,      color: "bg-blue-500/15 text-blue-500 border-blue-500/30",   description: "Indicadores, metas, forecast" },
  consultor_leads:   { label: "Consultor de Leads", icon: User,       color: "bg-green-500/15 text-green-600 border-green-500/30", description: "Análise do lead aberto" },
  mentor_p21:        { label: "Mentor P21",        icon: Library,    color: "bg-purple-500/15 text-purple-500 border-purple-500/30", description: "Metodologia P21 (RAG)" },
};

function useOpenLeadContext(): Lead | null {
  const [lead, setLead] = useState<Lead | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("intel:openLead");
      if (raw) setLead(JSON.parse(raw));
    } catch { /* noop */ }
    return () => {};
  }, []);
  return lead;
}

function buildLeadContext(lead: Lead | null) {
  if (!lead) return null;
  return {
    id: lead.id,
    empresa: lead.company,
    contato: lead.contact,
    telefone: lead.phone,
    cidade: lead.city,
    nicho: lead.niche,
    icp: lead.icpStars,
    pipeline: getPipelineForStage(lead.stage),
    stage: lead.stage,
    serviceType: lead.serviceType ?? null,
    contractValue: lead.contractValue ?? null,
    observacoes: lead.notes ?? null,
    ultimasInteracoes: (lead.interactions ?? []).slice(-8).map((i) => ({
      tipo: i.type, quando: i.date, titulo: i.title, resumo: i.summary,
    })),
  };
}

function buildDashboardSnapshot() {
  try {
    const leads = getLeads();
    const byStage: Record<string, number> = {};
    leads.forEach((l) => { byStage[l.stage] = (byStage[l.stage] ?? 0) + 1; });
    const oportunidades = leads.filter((l) => OPORTUNIDADES_STAGES.includes(l.stage as never));
    const coldCall = leads.filter((l) => COLD_CALL_STAGES.includes(l.stage as never));
    const pipelineValue = oportunidades.reduce((s, l) => s + (l.contractValue ?? 0), 0);
    return {
      totalLeads: leads.length,
      coldCall: coldCall.length,
      oportunidades: oportunidades.length,
      pipelineValueBRL: pipelineValue,
      distribuicaoPorEtapa: byStage,
    };
  } catch { return null; }
}

export default function CentralInteligencia() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [override, setOverride] = useState<Specialist | "auto">("auto");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const openLead = useOpenLeadContext();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setIsAdmin(data.user?.email === "vitorco23@gmail.com");
    });
  }, []);

  const refreshConversations = useCallback(async () => {
    let data = await IntelligenceRepository.listConversations();
    setConversations(data ?? []);
    if (!activeId && data && data.length) setActiveId(data[0].id);
  }, [activeId]);

  useEffect(() => { refreshConversations(); }, [refreshConversations]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    setLoading(true);
    IntelligenceRepository.listMessages(activeId)
      .then((data) => setMessages((data ?? []) as ChatMessage[]))
      .finally(() => setLoading(false));
  }, [activeId]);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || sending) return;
    let convId = activeId;
    if (!convId) {
      const title = q.slice(0, 60);
      let data = await IntelligenceRepository.createConversation(title);
      convId = data.id;
      setConversations((prev) => [data, ...prev]);
      setActiveId(convId);
    }
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`, role: "user", content: q, created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setSending(true);

    try {
      const data = await IntelligenceRepository.ask({
        question: q,
        conversationId: convId,
        specialistOverride: override === "auto" ? undefined : override,
        history: messages.map(m => ({ role: m.role, content: m.content })),
        context: {
          page: window.location.pathname,
          leadContext: buildLeadContext(openLead),
          dashboardSnapshot: buildDashboardSnapshot(),
        },
      });
      const reply: ChatMessage = {
        id: `tmp-a-${Date.now()}`, role: "assistant",
        content: data?.content ?? "(sem resposta)",
        specialist: (data?.specialist ?? null) as ChatMessage["specialist"],
        citations: (data?.citations ?? null) as ChatMessage["citations"],
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, reply]);
    } finally {
      setSending(false);
    }
  }, [input, sending, activeId, override, openLead]);

  return (
    <div className="flex h-[calc(100vh-120px)] bg-background">
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="w-[240px] flex-shrink-0 border-r bg-muted/20 p-3 flex flex-col gap-3">
          <Button onClick={() => setActiveId(null)} variant="outline" className="w-full justify-start gap-2">
            <Plus className="h-4 w-4" /> Nova conversa
          </Button>
          <ScrollArea className="flex-1">
             <div className="space-y-1">
               {conversations.map(c => (
                 <button key={c.id} onClick={() => setActiveId(c.id)} className={cn("w-full text-left px-3 py-2 text-sm rounded-md truncate hover:bg-muted", activeId === c.id && "bg-muted")}>
                   {c.title}
                 </button>
               ))}
             </div>
          </ScrollArea>
        </aside>
      )}

      {/* Main Chat */}
      <main className="flex-1 flex flex-col min-w-0 max-w-[900px] mx-auto w-full relative">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
              <Sparkles className="h-12 w-12 mb-4" />
              <h2 className="text-xl font-bold">Como posso ajudar na operação hoje?</h2>
              <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
                <Button variant="ghost" onClick={() => setInput("Analise meu funil")}>Analisar meu funil</Button>
                <Button variant="ghost" onClick={() => setInput("Avalie um lead")}>Avaliar um lead</Button>
              </div>
            </div>
          ) : (
             <div className="space-y-6">
                {messages.map(m => (
                  <div key={m.id} className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}>
                    {m.role === "assistant" && m.specialist && (
                      <div className="text-[10px] font-bold uppercase flex items-center gap-1.5 opacity-70">
                         <Bot className="h-3 w-3" /> {SPECIALIST_META[m.specialist].label}
                      </div>
                    )}
                    <div className={cn("px-4 py-3 rounded-2xl max-w-[90%] prose prose-sm dark:prose-invert", m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
                {sending && <div className="text-sm opacity-50 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {override !== "auto" ? SPECIALIST_META[override].label : "Especialista"} analisando...</div>}
             </div>
          )}
        </ScrollArea>

        {/* Composer */}
        <div className="p-4 border-t bg-background/80 backdrop-blur">
          <div className="relative border rounded-xl bg-card focus-within:ring-2 focus-within:ring-primary shadow-sm">
             <div className="flex items-center gap-2 px-3 py-2 border-b">
                <DropdownMenu>
                   <DropdownMenuTrigger asChild>
                     <Button variant="ghost" size="sm" className="h-6 text-xs gap-1.5 px-2">
                       <Sparkles className="h-3 w-3" /> {override === "auto" ? "Auto" : SPECIALIST_META[override].label} <ChevronDown className="h-3 w-3" />
                     </Button>
                   </DropdownMenuTrigger>
                   <DropdownMenuContent>
                     <DropdownMenuItem onClick={() => setOverride("auto")}>Auto</DropdownMenuItem>
                     {Object.keys(SPECIALIST_META).map(s => (
                       <DropdownMenuItem key={s} onClick={() => setOverride(s as Specialist)}>{SPECIALIST_META[s as Specialist].label}</DropdownMenuItem>
                     ))}
                   </DropdownMenuContent>
                </DropdownMenu>
             </div>
             <Textarea
               value={input}
               onChange={(e) => setInput(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
               placeholder="Pergunte sobre leads, operação ou metodologia P21..."
               className="border-none shadow-none focus-visible:ring-0 min-h-[80px]"
             />
             <div className="p-2 flex justify-end">
               <Button onClick={send} size="sm" disabled={sending}>Enviar</Button>
             </div>
          </div>
        </div>
      </main>
    </div>
  );
}
