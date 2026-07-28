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
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold">Diagnóstico Comercial</span>
          <Badge variant="outline" className={`text-[10px] ${meta.cls} border-current/40`}>
            <Icon className="h-3 w-3 mr-1" /> {meta.label}
          </Badge>
          {stale && (
            <Badge variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/40">
              Diagnóstico desatualizado
            </Badge>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">
          Atualizado {format(new Date(diag.generatedAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
          <span>Probabilidade</span>
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
        <div className="rounded-md border border-accent/30 bg-background/60 p-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5 flex items-center gap-1">
            <ArrowRightCircle className="h-3 w-3" /> Próxima ação
          </p>
          <p className="text-sm text-foreground/90">{diag.next_action}</p>
        </div>
      )}

      {diag.attention && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2">
          <p className="text-[10px] uppercase tracking-wider text-yellow-600 mb-0.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Atenção
          </p>
          <p className="text-sm text-foreground/90">{diag.attention}</p>
        </div>
      )}
    </div>
  );
}
