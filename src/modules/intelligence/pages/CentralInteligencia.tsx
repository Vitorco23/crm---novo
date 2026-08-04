import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { IntelligenceRepository } from "../services/IntelligenceRepository";
import { PageContainer } from "@/shared/components/shell/PageContainer";
import { PageHeader } from "@/shared/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import {
  MessageCircle, Plus, Send, Trash2, Sparkles, Brain, User, Library, Loader2, ChevronRight, Pencil,
} from "lucide-react";
import { cn } from "@/shared/utils/utils";
import { getLeads, getPipelineForStage, type Lead } from "@/shared/services/store";
import { COLD_CALL_STAGES, OPORTUNIDADES_STAGES } from "@/shared/services/store";

type Specialist = "diretor_comercial" | "consultor_leads" | "mentor_p21";

interface Conversation {
  id: string; title: string; updated_at: string;
}
interface ChatMessage {
  id: string; role: "user" | "assistant" | "system"; content: string;
  specialist?: Specialist | null;
  citations?: Array<{ documentId: string; titulo: string; categoria: string; versao: number; similarity: number }> | null;
  model_used?: string | null;
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
    const handler = (e: StorageEvent) => {
      if (e.key === "intel:openLead") {
        try { setLead(e.newValue ? JSON.parse(e.newValue) : null); } catch { /* noop */ }
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
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
  const [includeLead, setIncludeLead] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const openLead = useOpenLeadContext();

  const refreshConversations = useCallback(async () => {
    let data: Awaited<ReturnType<typeof IntelligenceRepository.listConversations>>;
    try {
      data = await IntelligenceRepository.listConversations();
    } catch (e) {
      toast({ title: "Erro ao carregar conversas", description: (e as Error).message, variant: "destructive" });
      return;
    }
    setConversations(data ?? []);
    if (!activeId && data && data.length) setActiveId(data[0].id);
  }, [activeId]);

  useEffect(() => { refreshConversations(); }, [refreshConversations]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    setLoading(true);
    IntelligenceRepository.listMessages(activeId)
      .then((data) => setMessages((data ?? []) as ChatMessage[]))
      .catch((e: Error) => toast({ title: "Erro ao carregar mensagens", description: e.message, variant: "destructive" }))
      .finally(() => {
        setLoading(false);
        requestAnimationFrame(() => inputRef.current?.focus());
      });
  }, [activeId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const newConversation = useCallback(async () => {
    let data: Conversation;
    try {
      data = (await IntelligenceRepository.createConversation("Nova conversa")) as Conversation;
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
      return;
    }
    setConversations((prev) => [data as Conversation, ...prev]);
    setActiveId(data.id);
    setMessages([]);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const renameConversation = useCallback(async (id: string, title: string) => {
    const clean = title.trim().slice(0, 120);
    setEditingId(null);
    if (!clean) return;
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: clean } : c)));
    try {
      await IntelligenceRepository.renameConversation(id, clean);
    } catch (e) {
      toast({ title: "Erro ao renomear", description: (e as Error).message, variant: "destructive" });
      refreshConversations();
    }
  }, [refreshConversations]);

  const deleteConversation = useCallback(async (id: string) => {
    if (!confirm("Excluir esta conversa?")) return;
    try {
      // Optimistic UI update
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
      
      await IntelligenceRepository.deleteConversation(id);
      toast({ title: "Conversa excluída" });
    } catch (e) {
      toast({ title: "Erro ao excluir", description: (e as Error).message, variant: "destructive" });
      refreshConversations(); // Rollback on error
    }
  }, [activeId, refreshConversations]);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || sending) return;
    let convId = activeId;
    if (!convId) {
      const title = q.slice(0, 60);
      let data: Conversation;
      try {
        data = (await IntelligenceRepository.createConversation(title)) as Conversation;
      } catch (e) {
        toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
        return;
      }
      convId = data.id;
      setConversations((prev) => [data as Conversation, ...prev]);
      setActiveId(convId);
    }
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`, role: "user", content: q, created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setSending(true);

    try {
      const leadCtx = includeLead ? buildLeadContext(openLead) : null;
      const dashSnap = buildDashboardSnapshot();
      const history = messages
        .slice(-10)
        .map((m) => ({ role: m.role, content: (m.content ?? "").slice(0, 2000) }));
      const data = await IntelligenceRepository.ask({
        question: q,
        conversationId: convId,
        specialistOverride: override === "auto" ? undefined : override,
        history,
        context: {
          page: window.location.pathname,
          leadContext: leadCtx,
          dashboardSnapshot: dashSnap,
        },
      });
      const reply: ChatMessage = {
        id: `tmp-a-${Date.now()}`, role: "assistant",
        content: data?.content ?? "(sem resposta)",
        specialist: (data?.specialist ?? null) as ChatMessage["specialist"],
        citations: (data?.citations ?? null) as ChatMessage["citations"],
        model_used: data?.model ?? null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, reply]);
      // Refresh conversations to bump updated_at ordering
      refreshConversations();
    } catch (e) {
      const msg = (e as Error).message ?? "Falha ao consultar a IA.";
      toast({ title: "Erro na Central de Inteligência", description: msg, variant: "destructive" });
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`, role: "assistant",
        content: `⚠️ Não consegui responder agora (${msg}). Tente novamente em instantes.`,
      }]);
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [input, sending, activeId, override, includeLead, openLead, refreshConversations, messages]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  return (
    <PageContainer>
      <PageHeader
        title="Central de Inteligência"
        description="Converse com 3 especialistas de IA da Performance21"
        icon={MessageCircle}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 min-h-[calc(100vh-220px)]">
        {/* Sidebar */}
        <Card className="p-3 flex flex-col">
          <Button onClick={newConversation} className="mb-3 gap-2" size="sm">
            <Plus className="h-4 w-4" /> Nova conversa
          </Button>
          <ScrollArea className="flex-1 w-full">
            <div className="flex w-full min-w-0 flex-col gap-1">

              {conversations.length === 0 && (
                <p className="text-xs text-muted-foreground p-2">Nenhuma conversa ainda.</p>
              )}
              {conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    if (editingId !== c.id) setActiveId(c.id);
                  }}
                  className={cn(
                    "group relative flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 cursor-pointer text-sm hover:bg-muted transition-colors",
                    activeId === c.id && "bg-muted",
                  )}
                >
                  <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                  {editingId === c.id ? (
                    <div className="flex-1 min-w-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                        autoFocus
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => renameConversation(c.id, editingTitle)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            renameConversation(c.id, editingTitle);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingId(null);
                          }
                        }}
                        className="h-7 min-w-0 flex-1 text-xs px-2"
                        maxLength={120}
                      />
                    </div>
                  ) : (
                    <>
                      <span
                        className="min-w-0 flex-1 truncate pr-14"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingId(c.id);
                          setEditingTitle(c.title || "");
                        }}
                      >
                        {c.title || "Conversa"}
                      </span>
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-muted/90 pl-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(c.id);
                            setEditingTitle(c.title || "");
                          }}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Renomear"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversation(c.id);
                          }}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Excluir"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>

        {/* Chat */}
        <Card className="flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium truncate flex-1">
              {activeConversation?.title ?? "Escolha uma conversa ou envie uma pergunta"}
            </span>
            {openLead && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox" checked={includeLead}
                  onChange={(e) => setIncludeLead(e.target.checked)}
                  className="accent-primary"
                />
                Incluir contexto de <strong className="text-foreground truncate max-w-[140px]">{openLead.company}</strong>
              </label>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            )}
            {!loading && messages.length === 0 && (
              <EmptyChat onQuickAsk={(q) => setInput(q)} />
            )}
            {messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
            {sending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground pl-1">
                <Loader2 className="h-4 w-4 animate-spin" /> Pensando…
              </div>
            )}
          </div>

          <div className="border-t p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Especialista:</span>
              <SpecPill active={override === "auto"} onClick={() => setOverride("auto")}>
                Auto
              </SpecPill>
              {(Object.keys(SPECIALIST_META) as Specialist[]).map((s) => {
                const meta = SPECIALIST_META[s];
                return (
                  <SpecPill key={s} active={override === s} onClick={() => setOverride(s)}>
                    <meta.icon className="h-3 w-3" /> {meta.label}
                  </SpecPill>
                );
              })}
            </div>
            <div className="flex gap-2 items-end">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder="Pergunte sobre um lead, indicadores ou metodologia P21…"
                className="min-h-[60px] resize-none"
                disabled={sending}
              />
              <Button onClick={send} disabled={sending || !input.trim()} className="h-[60px] w-[60px] p-0">
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}

function SpecPill({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border",
      )}
    >
      {children}
    </button>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const meta = msg.specialist ? SPECIALIST_META[msg.specialist] : null;
  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      {!isUser && meta && (
        <div className={cn("mb-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", meta.color)}>
          <meta.icon className="h-3 w-3" /> {meta.label}
          {msg.model_used && <span className="text-muted-foreground/70 ml-1">· {msg.model_used}</span>}
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm",
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{msg.content}</div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-headings:mt-3 prose-headings:mb-2">
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        )}
      </div>
      {!isUser && msg.citations && msg.citations.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 max-w-[85%]">
          {msg.citations.map((c, i) => (
            <Badge key={i} variant="outline" className="text-[10px] font-normal">
              📚 {c.titulo} v{c.versao} · {(c.similarity * 100).toFixed(0)}%
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyChat({ onQuickAsk }: { onQuickAsk: (q: string) => void }) {
  const suggestions: { label: string; q: string; spec: Specialist }[] = [
    { spec: "diretor_comercial", label: "📊 Como está minha operação hoje?", q: "Como está minha operação hoje? Onde devo focar agora?" },
    { spec: "diretor_comercial", label: "🎯 Consigo bater a meta do mês?", q: "Considerando o ritmo atual, consigo bater a meta do mês? Onde está o gargalo?" },
    { spec: "consultor_leads",   label: "👤 Como abordar esse lead?",       q: "Como devo abordar esse lead na próxima interação? Qual a melhor entrada?" },
    { spec: "mentor_p21",        label: "📚 O que é SPIN Selling?",          q: "Me explique como aplicar SPIN Selling na abordagem inicial de um lead frio." },
  ];
  return (
    <div className="max-w-2xl mx-auto text-center py-8 space-y-6">
      <div>
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-4">
          <Sparkles className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-semibold">Central de Inteligência Performance21</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Pergunte sobre um lead, seus indicadores ou a metodologia. O roteador escolhe o especialista certo automaticamente.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-left">
        {suggestions.map((s, i) => {
          const meta = SPECIALIST_META[s.spec];
          return (
            <button
              key={i}
              onClick={() => onQuickAsk(s.q)}
              className="group flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted transition"
            >
              <div className={cn("rounded-md border px-1.5 py-0.5 text-[10px]", meta.color)}>
                <meta.icon className="h-3 w-3 inline" />
              </div>
              <span className="flex-1">{s.label}</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
