// Faixa de prioridade do lead — responde "o que eu devo fazer agora?"
// diretamente no topo do card, com UMA única ação recomendada.

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Instagram, MessageCircle, Phone, Sparkles } from "lucide-react";
import type { Lead } from "@/shared/services/store";
import { computeLeadPriority, TIER_META } from "@/modules/intelligence/services/priorityEngine";
import { ACTION_META, URGENCY_META } from "@/modules/intelligence/services/nextBestAction";

function mapsUrlFor(lead: Lead) {
  if (lead.gmnLink) return lead.gmnLink;
  const q = encodeURIComponent(`${lead.company} ${lead.city || ""}`.trim());
  return q ? `https://www.google.com/maps/search/?api=1&query=${q}` : "";
}

function quickWhatsappUrl(lead: Lead) {
  const phone = lead.whatsapp || lead.phone;
  return phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : "";
}

function QuickAction({
  href, label, children, tone = "default",
}: {
  href?: string;
  label: string;
  children: React.ReactNode;
  tone?: "default" | "whatsapp" | "instagram";
}) {
  if (!href) return null;

  const toneClass =
    tone === "whatsapp"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15"
      : tone === "instagram"
        ? "border-pink-500/30 bg-pink-500/10 text-pink-500 hover:bg-pink-500/15"
        : "border-border/70 bg-background/70 text-muted-foreground hover:bg-accent/10 hover:text-accent";

  return (
    <Button asChild size="sm" variant="outline" className={`h-7 px-2 text-[10px] ${toneClass}`}>
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noopener noreferrer" : undefined} aria-label={label} title={label}>
        {children}
      </a>
    </Button>
  );
}

export default function LeadPriorityStrip({ lead }: { lead: Lead }) {
  const p = useMemo(() => computeLeadPriority(lead), [lead]);
  if (!p) return null;

  const mapsUrl = mapsUrlFor(lead);
  const whatsappUrl = quickWhatsappUrl(lead);

  return (
    <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[220px] flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`text-[10px] ${TIER_META[p.tier].cls}`}>
              Prioridade {TIER_META[p.tier].label}
            </Badge>
            <Badge variant="outline" className={`text-[10px] ${URGENCY_META[p.urgency].color}`}>
              {URGENCY_META[p.urgency].label}
            </Badge>
            {p.source === "ia" && (
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30 gap-1">
                <Sparkles className="h-2.5 w-2.5" /> IA
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground tabular-nums">~{p.estimatedMinutes} min</span>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-accent">Próximo melhor passo</p>
            <p className="text-sm font-semibold text-foreground">
              {ACTION_META[p.action].icon} {p.actionLabel}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {p.actionReason || p.reasons[0]?.label || "Prioridade calculada a partir do estágio, histórico e dados do lead."}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <QuickAction href={lead.phone ? `tel:${lead.phone}` : ""} label="Ligar para o lead">
            <Phone className="h-3.5 w-3.5" />
          </QuickAction>
          <QuickAction href={whatsappUrl} label="Abrir WhatsApp" tone="whatsapp">
            <MessageCircle className="h-3.5 w-3.5" />
          </QuickAction>
          <QuickAction href={mapsUrl} label="Abrir Google/Maps">
            <ExternalLink className="h-3.5 w-3.5" />
          </QuickAction>
          <QuickAction href={lead.instagramLink} label="Abrir Instagram" tone="instagram">
            <Instagram className="h-3.5 w-3.5" />
          </QuickAction>
        </div>
      </div>
    </div>
  );
}
