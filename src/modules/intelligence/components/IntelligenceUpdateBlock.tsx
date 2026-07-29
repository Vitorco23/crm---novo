// "Última Atualização da IA" — bloco no topo do Briefing Comercial.
// Mostra quando a IA recalculou o lead e exatamente o que mudou.
import { Sparkles, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Lead } from "@/shared/services/store";
import { getDiagnosisHistory } from "@/shared/services/store";

export default function IntelligenceUpdateBlock({
  lead,
  running,
  noChange,
}: {
  lead: Lead;
  running?: boolean;
  /** true quando a última execução não encontrou mudanças relevantes. */
  noChange?: boolean;
}) {
  const history = getDiagnosisHistory(lead);
  const latest = history[0];

  if (running) {
    return (
      <div className="rounded-md border border-accent/40 bg-accent/5 p-3 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
        <p className="text-xs text-muted-foreground">A IA está recalculando o estado comercial deste lead…</p>
      </div>
    );
  }

  if (!latest && !noChange) {
    return (
      <div className="rounded-md border border-dashed border-border/60 p-3">
        <p className="text-xs text-muted-foreground">
          Nenhuma inteligência gerada ainda. Use <span className="font-medium text-foreground">Atualizar Inteligência</span> para
          recalcular todo o estado comercial deste lead.
        </p>
      </div>
    );
  }

  const when = latest ? formatDistanceToNow(new Date(latest.at), { locale: ptBR, addSuffix: true }) : "agora";

  return (
    <div className="rounded-md border border-accent/40 bg-gradient-to-br from-accent/10 to-transparent p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-accent flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Última Atualização da IA
        </p>
        {latest && (
          <span className="text-[10px] text-muted-foreground">v{latest.version} · {when}</span>
        )}
      </div>

      {noChange ? (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-px" />
          Nenhuma alteração relevante identificada desde a última análise.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">A IA analisou novas informações {when}.</p>
          {latest && latest.changes.length > 0 ? (
            <ul className="space-y-1">
              {latest.changes.map((c, i) => (
                <li key={i} className="text-xs text-foreground/90 flex items-start gap-1.5">
                  <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-accent" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Primeira análise completa do lead registrada.</p>
          )}
        </>
      )}
    </div>
  );
}
