// Card de Diagnóstico Comercial Automático (IA Comercial V1.1)
// Aparece acima da timeline de interações quando `lead.autoDiagnosis` existe.
import { Flame, Thermometer, Snowflake, Sparkles, AlertTriangle, ArrowRightCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type Lead, isAutoDiagnosisStale } from "@/lib/store";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const TEMP_META = {
  quente: { label: "QUENTE", icon: Flame, cls: "text-orange-500", bar: "bg-orange-500" },
  morno:  { label: "MORNO",  icon: Thermometer, cls: "text-yellow-500", bar: "bg-yellow-500" },
  frio:   { label: "FRIO",   icon: Snowflake, cls: "text-sky-400", bar: "bg-sky-400" },
} as const;

export default function AutoDiagnosisCard({ lead }: { lead: Lead }) {
  const diag = lead.autoDiagnosis;
  if (!diag) return null;
  const meta = TEMP_META[diag.temperature] ?? TEMP_META.morno;
  const Icon = meta.icon;
  const pct = Math.max(0, Math.min(100, Math.round(diag.probability || 0)));
  const stale = isAutoDiagnosisStale(lead);

  return (
    <div className="relative rounded-lg border-2 border-accent/40 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent p-4 space-y-3 shadow-sm">
      <div className="absolute -top-2 left-3 px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1">
        <Sparkles className="h-3 w-3" /> Diagnóstico Comercial
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap pt-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-xs ${meta.cls} border-current/40 font-semibold`}>
            <Icon className="h-3.5 w-3.5 mr-1" /> {meta.label}
          </Badge>
          {stale && (
            <Badge variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/40">
              Desatualizado
            </Badge>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">
          Atualizado {format(new Date(diag.generatedAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
          <span>Probabilidade de fechamento</span>
          <span className="font-semibold text-foreground">{pct}%</span>
        </div>
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div className={`h-full ${meta.bar} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {diag.summary && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Resumo</p>
          <p className="text-sm whitespace-pre-wrap text-foreground/90">{diag.summary}</p>
        </div>
      )}

      {diag.next_action && (
        <div className="rounded-md border border-accent/40 bg-background/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-0.5 flex items-center gap-1">
            <ArrowRightCircle className="h-3 w-3" /> 🎯 O que fazer agora
          </p>
          <p className="text-sm font-medium text-foreground">{diag.next_action}</p>
        </div>
      )}

      {diag.attention && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-yellow-600 font-semibold mb-0.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> ⚠ Atenção
          </p>
          <p className="text-sm text-foreground/90">{diag.attention}</p>
        </div>
      )}
    </div>
  );
}

