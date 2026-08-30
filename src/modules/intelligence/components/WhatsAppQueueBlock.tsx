// Fila diária de WhatsApp (Parte 3) — até 25 contatos priorizados no
// número pessoal do vendedor, decididos numa janela fixa de fim de dia.
// Antes da janela: mostra rascunho local (sem custo de IA). Depois: lista
// travada, contador de uso, ação rápida wa.me por lead.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Loader2, Lock, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  getQueueState, shouldGenerateNewQueue, generateAndLockQueue,
  buildDraftPreview, markQueueItemContacted, usedCount, LOCK_HOUR, DAILY_LIMIT,
  WHATSAPP_QUEUE_UPDATED_EVENT,
  type WhatsAppQueueState, type DraftPreviewItem,
} from "@/modules/intelligence/services/whatsappQueue";

const TIER_LABEL: Record<number, { label: string; cls: string }> = {
  1: { label: "1 · Decisor interessado", cls: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  2: { label: "2 · Reunião sem confirmar", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  3: { label: "3 · No-show recente", cls: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  4: { label: "4 · 1ª tentativa hoje", cls: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
  5: { label: "5 · Tentativa repetida", cls: "bg-muted text-muted-foreground border-border" },
};

/**
 * Diagnóstico 30/08: o bloco desapareceu sem erro visível em produção, sem
 * ErrorBoundary nenhum no app pra denunciar. Reescrito pra NUNCA sumir por
 * completo: qualquer exceção nas funções de whatsappQueue.ts é capturada
 * aqui e vira uma mensagem visível dentro do próprio card (com o título já
 * sempre presente, isso dá um sinal inequívoco pra distinguir "componente
 * não montou" — nem o título aparece, é deploy — de "montou mas quebrou" —
 * título aparece com aviso de erro embaixo). console.info de montagem
 * ajuda a confirmar pelo DevTools se o componente sequer chegou a rodar.
 */
export default function WhatsAppQueueBlock() {
  const [state, setState] = useState<WhatsAppQueueState | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [blockError, setBlockError] = useState<string | null>(null);

  useEffect(() => {
    console.info("[WhatsAppQueueBlock] montado");
    try {
      setState(getQueueState());
    } catch (e) {
      console.error("[WhatsAppQueueBlock] falha ao ler estado salvo", e);
      setBlockError((e as Error)?.message || "Falha ao ler o estado salvo da fila.");
    }
  }, []);

  useEffect(() => {
    const refresh = () => {
      try { setState(getQueueState()); } catch (e) { console.error("[WhatsAppQueueBlock] refresh falhou", e); }
    };
    window.addEventListener(WHATSAPP_QUEUE_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(WHATSAPP_QUEUE_UPDATED_EVENT, refresh);
  }, []);

  // Revalida a cada 5 min — cobre o caso do vendedor deixar o CRM aberto
  // atravessando a hora da janela, sem precisar recarregar a página.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 5 * 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (loading) return;
    try {
      if (!shouldGenerateNewQueue(state, new Date())) return;
    } catch (e) {
      console.error("[WhatsAppQueueBlock] shouldGenerateNewQueue falhou", e);
      setBlockError((e as Error)?.message || "Falha ao avaliar a janela de geração.");
      return;
    }
    setLoading(true);
    generateAndLockQueue(false)
      .then((res) => {
        setLoading(false);
        if (res.ok && res.state) {
          setState(res.state);
          if (res.state.items.length > 0) toast.success(`Fila de WhatsApp de hoje pronta — ${res.state.items.length} contato(s) priorizado(s).`);
        } else if (!res.ok) {
          toast.error(res.errorMessage || "Não foi possível calcular a fila de WhatsApp de hoje.");
        }
      })
      .catch((e) => {
        setLoading(false);
        console.error("[WhatsAppQueueBlock] generateAndLockQueue falhou", e);
        setBlockError(e?.message || "Falha inesperada ao calcular a fila.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const draft = useMemo<DraftPreviewItem[]>(() => {
    if (state) return [];
    try {
      return buildDraftPreview();
    } catch (e) {
      // Não chama setState aqui dentro (estamos em fase de render) — só
      // loga; os outros pontos (efeitos) já cobrem o aviso visível.
      console.error("[WhatsAppQueueBlock] buildDraftPreview falhou", e);
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, tick]);
  const used = usedCount(state);

  const handleSend = (item: WhatsAppQueueState["items"][number]) => {
    if (!item.waLink) {
      toast.error(`${item.empresa} não tem telefone válido cadastrado.`);
      return;
    }
    markQueueItemContacted(item.leadId);
    window.open(item.waLink, "_blank", "noopener,noreferrer");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <MessageCircle className="h-4 w-4 text-emerald-500" />
          Fila de WhatsApp do Dia
          {state && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Lock className="h-2.5 w-2.5" /> {used}/{state.limit} usados hoje
            </Badge>
          )}
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {blockError && (
          <p className="text-[11px] text-rose-500 flex items-start gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Este bloco encontrou um erro e não conseguiu calcular a fila: {blockError}</span>
          </p>
        )}
        {!state && !loading && (
          <>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pb-1">
              <Clock className="h-3 w-3" />
              Rascunho — a lista trava às {LOCK_HOUR}h (depois da maior parte das ligações do dia). Não é decisão final ainda.
            </p>
            {draft.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Nenhum candidato com sinal relevante até agora.</p>
            ) : (
              <ul className="space-y-1.5">
                {draft.slice(0, 8).map((d) => (
                  <li key={d.leadId} className="rounded-md border border-dashed border-border/60 px-2.5 py-1.5 text-xs">
                    <span className="font-medium">{d.empresa}</span>
                    <span className="text-muted-foreground"> — {d.motivoRascunho}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {state && state.items.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            Nenhum lead priorizado para WhatsApp hoje ({new Date(state.generatedAt).toLocaleDateString("pt-BR")}).
          </p>
        )}

        {state && state.items.length > 0 && (
          <ul className="space-y-1.5">
            {state.items.map((it) => {
              const tierStyle = TIER_LABEL[it.tier];
              const contacted = Boolean(it.contactedAt);
              return (
                <li
                  key={it.leadId}
                  className={`rounded-md border px-2.5 py-2 flex items-start gap-2 ${contacted ? "opacity-50" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium truncate">{it.empresa}</span>
                      <Badge variant="outline" className={`text-[9px] ${tierStyle.cls}`}>{tierStyle.label}</Badge>
                      {contacted && <Badge variant="outline" className="text-[9px]">Link aberto</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{it.motivo}</p>
                  </div>
                  <button
                    onClick={() => handleSend(it)}
                    disabled={!it.waLink}
                    className="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-md border border-emerald-500/30 text-emerald-500 text-[11px] font-medium hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <MessageCircle className="h-3 w-3" /> WhatsApp
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {state && state.items.length > 0 && used >= state.limit && (
          <p className="text-[11px] text-amber-600 pt-1">
            Limite de {DAILY_LIMIT} contatos de hoje atingido — os demais ficam sinalizados pra amanhã.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
