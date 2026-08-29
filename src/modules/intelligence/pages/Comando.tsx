// Comando — Sprint 3: nova Home conversacional do CRM.
// Read-only: só conversa sobre a operação, nunca executa ações (Sprint 4).
// Sem widgets da Missão do Dia (sem cards de meta/progresso/produtividade) —
// essas informações aparecem só quando forem relevantes dentro da conversa.

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Send, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageContainer } from "@/shared/components/shell";
import P21Signal from "@/modules/intelligence/components/P21Signal";
import { useProfile, resolveDisplayName } from "@/shared/hooks/useProfile";
import { useAuth } from "@/contexts/AuthContext";
import { getCommercialContext } from "@/shared/services/commercialContext";
import {
  getMessages,
  sendMessage,
  getOrCreateDailyState,
  clearConversation,
  HOME_CHAT_UPDATED_EVENT,
  type ChatMessage,
  type DailyChatState,
  type HomeChatProfile,
} from "@/modules/intelligence/services/homeChat";
import { HOME_AREA_LABEL } from "@/modules/intelligence/constants/homeArea";

export default function Comando() {
  // Não usar useAIUserContext() direto aqui: precisamos saber quando o
  // perfil TERMINOU de carregar antes de gravar a saudação/sugestões do dia
  // — gravar cedo demais (perfil ainda undefined) congelaria "Bom dia."
  // sem nome pelo resto do dia (getOrCreateDailyState só recalcula amanhã).
  const { profile: rawProfile, isLoading: profileLoading } = useProfile();
  const { user } = useAuth();
  const profile = useMemo<HomeChatProfile | undefined>(() => {
    const name = resolveDisplayName(rawProfile, user);
    const role = rawProfile?.job_title?.trim() || undefined;
    const company = rawProfile?.company_name?.trim() || undefined;
    if (!name && !role && !company) return undefined;
    return { name: name || undefined, role, company };
  }, [rawProfile, user]);

  const [messages, setMessages] = useState<ChatMessage[]>(() => getMessages());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyChatState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sugestões/saudação: calculadas 1x ao abrir a experiência do dia (só
  // depois do perfil resolver), permanecem estáveis durante a conversa.
  useEffect(() => {
    if (profileLoading) return;
    const ctx = getCommercialContext({ profile });
    setDaily(getOrCreateDailyState(ctx, profile?.name));
  }, [profileLoading, profile]);

  useEffect(() => {
    const refresh = () => setMessages(getMessages());
    window.addEventListener(HOME_CHAT_UPDATED_EVENT, refresh);
    window.addEventListener("p21:storage-synced", refresh);
    return () => {
      window.removeEventListener(HOME_CHAT_UPDATED_EVENT, refresh);
      window.removeEventListener("p21:storage-synced", refresh);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  const submit = async (text: string) => {
    if (sending || !text.trim()) return;
    setSending(true);
    setError(null);
    setInput("");
    const res = await sendMessage(text, profile);
    setSending(false);
    if (!res.ok) {
      setError(res.errorMessage || "Não foi possível obter resposta agora.");
      toast.error((res.errorMessage || "Não foi possível obter resposta agora.").slice(0, 220));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  };

  const handleReset = () => {
    clearConversation();
    setError(null);
    toast.success("Conversa reiniciada. Nenhum dado comercial foi alterado.");
  };

  const lastFailedText = error ? messages[messages.length - 1]?.content : undefined;

  if (!daily) {
    return (
      <PageContainer>
        <div className="mission-os -mx-1 rounded-3xl px-4 py-4 md:px-7 md:py-5">
          <P21Signal label={HOME_AREA_LABEL} />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="mission-os -mx-1 rounded-3xl px-4 py-4 md:px-7 md:py-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <P21Signal label={HOME_AREA_LABEL} />
          {messages.length > 0 && (
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-[11px] text-[hsl(var(--mission-text-faint))] hover:text-[hsl(var(--mission-text))] transition-colors"
            >
              <RotateCcw className="h-3 w-3" /> Nova conversa
            </button>
          )}
        </div>

        <div className="grid gap-5 md:grid-cols-[minmax(200px,28%)_1fr] md:items-start">
          {/* Sugestões — coluna lateral no desktop, compacta acima no mobile */}
          <aside className="space-y-1.5 md:sticky md:top-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--mission-text-faint))] mb-2">
              Para começar
            </p>
            <div className="flex flex-wrap gap-1.5 md:flex-col md:gap-1.5">
              {daily.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  disabled={sending}
                  className="text-left text-[13px] leading-snug rounded-lg border border-[hsl(var(--mission-border))] bg-[hsl(var(--mission-surface))]/40 px-3 py-2 text-[hsl(var(--mission-text-muted))] hover:text-[hsl(var(--mission-text))] hover:bg-[hsl(var(--mission-surface))]/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {s}
                </button>
              ))}
            </div>
          </aside>

          {/* Conversa */}
          <div className="flex flex-col min-h-[60vh] md:min-h-[70vh]">
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
              {messages.length === 0 && (
                <p className="text-xl md:text-2xl font-semibold text-[hsl(var(--mission-text))] [text-wrap:balance] pt-2">
                  {daily.greeting}
                </p>
              )}

              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] rounded-2xl rounded-br-sm bg-[hsl(var(--mission-accent))] text-[hsl(var(--mission-bg))] px-4 py-2.5 text-sm"
                        : "max-w-[85%] rounded-2xl rounded-bl-sm bg-[hsl(var(--mission-surface))]/60 border border-[hsl(var(--mission-border))] px-4 py-3 text-sm text-[hsl(var(--mission-text))]"
                    }
                  >
                    {m.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{m.content}</span>
                    )}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-[hsl(var(--mission-surface))]/60 border border-[hsl(var(--mission-border))] px-4 py-3">
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--mission-accent))] animate-pulse-green" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--mission-accent))] animate-pulse-green [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--mission-accent))] animate-pulse-green [animation-delay:300ms]" />
                    </span>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                <span>{error}</span>
                {lastFailedText && (
                  <button
                    onClick={() => submit(lastFailedText)}
                    className="shrink-0 font-medium underline underline-offset-2 hover:no-underline"
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            )}

            <div className="flex items-end gap-2 rounded-xl border border-[hsl(var(--mission-border))] bg-[hsl(var(--mission-surface))]/50 p-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite uma pergunta..."
                disabled={sending}
                rows={1}
                className="min-h-[40px] max-h-40 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
              />
              <Button
                onClick={() => submit(input)}
                disabled={sending || !input.trim()}
                size="icon"
                className="shrink-0 bg-[hsl(var(--mission-accent))] text-[hsl(var(--mission-bg))] hover:brightness-110"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
