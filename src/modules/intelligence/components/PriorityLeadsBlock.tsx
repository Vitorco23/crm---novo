// Bloco "Leads Prioritários do Dia" — usado dentro da Central de Decisão.
// Consome src/lib/priorityLeads.ts (heurística + IA) e renderiza cards
// enxutos com ações rápidas. Recalcula sob demanda e ao receber eventos
// relevantes do barramento.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, RefreshCw, Sparkles, Target, Flame, TrendingUp,
  TrendingDown, ArrowRight, MessageCircle, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  computePriorityLeads, getCache, isCacheFresh,
  type PriorityLeadPick, type PriorityLeadsCache,
} from "@/modules/intelligence/services/priorityLeads";
import { getLeads, getPipelineForStage, type Lead, type CallAuditData } from "@/shared/services/store";
import NextBestActionCard from "@/modules/intelligence/components/NextBestActionCard";

function latestAudit(l: Lead): CallAuditData | null {
  const notes = l.callNotes || [];
  for (let i = notes.length - 1; i >= 0; i--) {
    const a = notes[i]?.analysis?.data;
    if (a) return a;
  }
  return null;
}

function pipelineHref(stage: string): string {
  const p = getPipelineForStage(stage);
  if (p === "oportunidades") return "/oportunidades";
  if (p === "onboarding") return "/onboarding";
  return "/";
}

function waLink(l: Lead): string | null {
  const raw = (l.whatsapp || l.phone || "").replace(/\D/g, "");
  if (!raw) return null;
  const num = raw.startsWith("55") ? raw : `55${raw}`;
  return `https://wa.me/${num}`;
}

const IMPACT_STYLE: Record<PriorityLeadPick["impacto"], { label: string; badge: string; ring: string }> = {
  critico: { label: "🔴 Impacto crítico", badge: "bg-rose-500/15 text-rose-500 border-rose-500/30", ring: "border-l-rose-500" },
  alto:    { label: "🟠 Alto impacto",    badge: "bg-amber-500/15 text-amber-600 border-amber-500/30", ring: "border-l-amber-500" },
  medio:   { label: "🟡 Médio impacto",   badge: "bg-sky-500/15 text-sky-500 border-sky-500/30",       ring: "border-l-sky-500" },
};

function TrendBadge({ t }: { t?: string }) {
  if (!t) return null;
  if (t === "Evoluindo") return <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">📈 Evoluindo</Badge>;
  if (t === "Esfriando") return <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-500 border-rose-500/30">📉 Esfriando</Badge>;
  return <Badge variant="outline" className="text-[10px]">➡ Estável</Badge>;
}

export default function PriorityLeadsBlock() {
  const [cache, setCache] = useState<PriorityLeadsCache | null>(() => getCache());
  const [loading, setLoading] = useState(false);
  const autoRan = useRef(false);

  const refreshFromStore = useCallback(() => setCache(getCache()), []);

  const run = useCallback(async (force: boolean) => {
    if (loading) return;
    setLoading(true);
    try {
      const r = await computePriorityLeads(force);
      setCache(r);
      if (force) toast.success("Prioridades atualizadas");
    } catch (e: any) {
      console.error("[priority-leads]", e);
      toast.error((e?.message || "Falha ao calcular prioridades").slice(0, 220));
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // Auto-run 1x se o cache estiver frio/inexistente.
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (!isCacheFresh(cache)) run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escuta eventos que invalidam a lista (novas ligações, movimentações etc.)
  useEffect(() => {
    const bump = () => refreshFromStore();
    const evs = [
      "p21:priority-leads-updated",
      "p21:storage-synced",
      "storage",
    ];
    evs.forEach((e) => window.addEventListener(e, bump as EventListener));
    return () => evs.forEach((e) => window.removeEventListener(e, bump as EventListener));
  }, [refreshFromStore]);

  // Enriquecimento com o snapshot atual do lead.
  const enriched = useMemo(() => {
    const leads = getLeads();
    const byId = new Map(leads.map((l) => [l.id, l]));
    const picks = cache?.leads ?? [];
    return picks
      .map((p) => {
        const lead = byId.get(p.leadId);
        if (!lead) return null;
        const audit = latestAudit(lead);
        return { pick: p, lead, audit };
      })
      .filter(Boolean) as Array<{ pick: PriorityLeadPick; lead: Lead; audit: CallAuditData | null }>;
  }, [cache]);

  const stale = cache && !isCacheFresh(cache);

  return (
    <Card className="border-l-4 border-l-accent">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-accent" />
            🎯 Leads Prioritários do Dia
            {enriched.length > 0 && (
              <Badge variant="outline" className="text-[10px] ml-1">{enriched.length}</Badge>
            )}
            {stale && (
              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                desatualizado
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {cache?.generatedAt && (
              <span className="text-[10px] text-muted-foreground">
                atualizado às {new Date(cache.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => run(true)}
              disabled={loading}
            >
              {loading
                ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Analisando</>
                : <><RefreshCw className="h-3 w-3 mr-1" /> Recalcular</>}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {loading && !cache && (
          <div className="rounded-md border bg-muted/20 p-6 text-center">
            <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Selecionando leads que merecem atenção…</p>
          </div>
        )}

        {!loading && enriched.length === 0 && (
          <div className="rounded-md border border-dashed bg-muted/10 p-5 text-center">
            <Sparkles className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Nenhum lead exige atenção imediata agora. A operação está fluindo — foque em prospecção nova.
            </p>
          </div>
        )}

        {enriched.map(({ pick, lead, audit }) => {
          const style = IMPACT_STYLE[pick.impacto];
          const wa = waLink(lead);
          const href = pipelineHref(lead.stage);
          const score = audit?.scoreComercial;
          const trend = audit?.tendencia;
          return (
            <div key={pick.leadId} className={`rounded-md border border-l-4 ${style.ring} p-3 space-y-2`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold truncate">{lead.company}</span>
                    <Badge variant="outline" className="text-[10px]">{lead.stage}</Badge>
                    {typeof score === "number" && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        Score {Math.round(score)}
                      </Badge>
                    )}
                    <TrendBadge t={trend} />
                    <Badge variant="outline" className={`${style.badge} border text-[10px]`}>
                      {style.label}
                    </Badge>
                  </div>
                  <p className="text-[12px] text-foreground/90 mt-1.5 leading-snug">
                    <span className="font-semibold text-foreground">Motivo: </span>
                    {pick.motivo}
                  </p>
                  {pick.proximaAcao && (
                    <p className="text-[12px] text-foreground/90 mt-1 leading-snug">
                      <span className="font-semibold text-foreground">Próxima ação: </span>
                      {pick.proximaAcao}
                    </p>
                  )}
                </div>
              </div>

              {pick.nextBestAction ? (
                <div className="pt-1">
                  <NextBestActionCard nba={pick.nextBestAction} lead={lead} compact />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <Link to={href}>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]">
                      Abrir Lead <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="h-7 text-[11px]">
                        <MessageCircle className="h-3 w-3 mr-1" /> WhatsApp
                      </Button>
                    </a>
                  )}
                  <Link to={href}>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]">
                      <Flame className="h-3 w-3 mr-1" /> Registrar interação
                    </Button>
                  </Link>
                  {lead.gmnLink && (
                    <a href={lead.gmnLink} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost" className="h-7 text-[11px]">
                        <ExternalLink className="h-3 w-3 mr-1" /> Google
                      </Button>
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {cache?.model && enriched.length > 0 && (
          <p className="text-[10px] text-muted-foreground text-right pt-1">
            Seleção feita pela IA · {cache.model}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
