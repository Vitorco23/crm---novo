// Histórico versionado da inteligência do lead.
// Cada geração de Diagnóstico Completo cria uma nova versão — nada é sobrescrito.
import { useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { getDiagnosisHistory, type Lead } from "@/shared/services/store";

const TEMP_LABEL: Record<string, string> = { quente: "Quente", morno: "Morno", frio: "Frio" };

export default function DiagnosisHistoryBlock({ lead }: { lead: Lead }) {
  const history = getDiagnosisHistory(lead);
  const [open, setOpen] = useState<string | null>(null);
  if (history.length === 0) return null;

  return (
    <div className="rounded-md border border-border/50 bg-card/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
        <History className="h-3 w-3" /> Histórico de Inteligência ({history.length} versão(ões))
      </p>
      <ul className="space-y-1.5">
        {history.map((v, idx) => {
          const isOpen = open === v.id;
          return (
            <li key={v.id} className="rounded border border-border/40 bg-background/50">
              <button
                onClick={() => setOpen(isOpen ? null : v.id)}
                className="w-full text-left p-2 flex items-center gap-2"
                aria-expanded={isOpen}
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                <span className="text-xs font-semibold">Diagnóstico v{v.version}</span>
                {idx === 0 && <Badge variant="outline" className="text-[10px] border-accent/40 text-accent">Atual</Badge>}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {format(new Date(v.at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    Origem: {v.origin} · Contexto: {v.context}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {TEMP_LABEL[v.diagnosis.temperature] ?? v.diagnosis.temperature}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {Math.round(v.diagnosis.probability || 0)}% probabilidade
                    </Badge>
                  </div>
                  {v.diagnosis.summary && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Resumo executivo</p>
                      <p className="text-xs text-foreground/90 whitespace-pre-wrap">{v.diagnosis.summary}</p>
                    </div>
                  )}
                  {v.changes.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Alterações identificadas</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {v.changes.map((c, i) => (
                          <li key={i} className="text-xs text-foreground/90">{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
