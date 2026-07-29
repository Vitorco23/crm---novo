// Faixa de prioridade do lead — responde "o que eu devo fazer agora?"
// diretamente no topo do card, com UMA única ação recomendada.

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import type { Lead } from "@/shared/services/store";
import { computeLeadPriority, TIER_META } from "@/modules/intelligence/services/priorityEngine";
import { ACTION_META, URGENCY_META } from "@/modules/intelligence/services/nextBestAction";

export default function LeadPriorityStrip({ lead }: { lead: Lead }) {
  const p = useMemo(() => computeLeadPriority(lead), [lead]);
  if (!p) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-accent/25 bg-accent/5 px-3 py-2">
      <Badge variant="outline" className={`text-[10px] ${TIER_META[p.tier].cls}`}>
        Prioridade {TIER_META[p.tier].label}
      </Badge>
      <span className="text-xs font-semibold text-foreground">
        {ACTION_META[p.action].icon} {p.actionLabel}
      </span>
      <Badge variant="outline" className={`text-[10px] ${URGENCY_META[p.urgency].color}`}>
        {URGENCY_META[p.urgency].label}
      </Badge>
      {p.source === "ia" && (
        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30 gap-1">
          <Sparkles className="h-2.5 w-2.5" /> IA
        </Badge>
      )}
      <span className="text-[11px] text-muted-foreground flex-1 min-w-[180px] truncate">
        {p.actionReason || p.reasons[0]?.label}
      </span>
      <span className="text-[10px] text-muted-foreground tabular-nums">~{p.estimatedMinutes} min</span>
    </div>
  );
}
