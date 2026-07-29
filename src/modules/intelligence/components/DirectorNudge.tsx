// Diretor Comercial proativo — sugestão discreta e contextual.
// Não é pop-up: é uma linha embutida no fluxo, dispensável pelo usuário.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Lightbulb } from "lucide-react";
import { openLead } from "@/modules/leads/services/openLead";
import type { DirectorSuggestion } from "@/modules/intelligence/services/priorityEngine";

const toneCls: Record<DirectorSuggestion["tone"], string> = {
  critical: "border-rose-500/30 bg-rose-500/5 text-rose-500",
  warn: "border-amber-500/30 bg-amber-500/5 text-amber-600",
  info: "border-sky-500/30 bg-sky-500/5 text-sky-500",
};

export default function DirectorNudge({ suggestion }: { suggestion: DirectorSuggestion | null }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!suggestion || dismissed === suggestion.key) return null;

  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 ${toneCls[suggestion.tone]}`}>
      <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <p className="text-xs text-foreground/90 flex-1 leading-relaxed">
        <span className="font-semibold">Diretor Comercial: </span>
        {suggestion.message}
      </p>
      {suggestion.cta?.leadId && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[11px] shrink-0"
          onClick={() => openLead(suggestion.cta!.leadId!, { tab: "interacoes" })}
        >
          {suggestion.cta.label}
        </Button>
      )}
      <button
        onClick={() => setDismissed(suggestion.key)}
        className="text-muted-foreground hover:text-foreground shrink-0"
        aria-label="Dispensar sugestão"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
