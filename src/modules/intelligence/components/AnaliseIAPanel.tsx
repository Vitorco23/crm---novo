// Sprint 2 — apresentação modular da análise OPCIONAL por IA.
// Nunca dispara chamadas: recebe o resultado já persistido e o callback do botão.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import type { AiAnalysis } from "@/modules/intelligence/services/dailyMetricsReport";

interface Props {
  ai: AiAnalysis | null;
  loading: boolean;
  canRun: boolean;
  error: string | null;
  onRun: () => void;
}

function Module({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/50 p-3 space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export default function AnaliseIAPanel({ ai, loading, canRun, error, onRun }: Props) {
  const d = ai?.data ?? null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">Análise complementar por IA (opcional)</CardTitle>
          <Button size="sm" variant="outline" onClick={onRun} disabled={loading || !canRun}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {ai ? "Gerar novamente" : "Gerar análise complementar com IA"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[11px] text-muted-foreground">
          Nada é enviado à IA até você clicar. O envio contém apenas os números e textos deste fechamento.
        </p>
        {!canRun && (
          <p className="text-[11px] text-muted-foreground">Salve o fechamento antes de gerar a análise opcional.</p>
        )}
        {error && (
          <p className="text-xs text-destructive">{error} O diagnóstico por regras acima permanece válido.</p>
        )}

        {d && (
          <div className="space-y-2">
            <Module title="Leitura executiva">
              <p className="text-xs text-foreground">{d.executiveSummary}</p>
            </Module>

            {d.strengths.length > 0 && (
              <Module title="Pontos fortes">
                <ul className="space-y-1">
                  {d.strengths.map((s) => (
                    <li key={s.title} className="text-xs">
                      <span className="font-medium">{s.title}</span>
                      <span className="text-muted-foreground"> — {s.evidence}</span>
                    </li>
                  ))}
                </ul>
              </Module>
            )}

            {d.bottlenecks.length > 0 && (
              <Module title="Gargalos">
                <ul className="space-y-1">
                  {d.bottlenecks.map((b) => (
                    <li key={b.stage} className="text-xs">
                      <span className="font-medium">{b.stage}</span>
                      <span className="text-muted-foreground"> — {b.evidence}</span>
                      {b.interpretation && <span className="block text-[11px] text-muted-foreground">{b.interpretation}</span>}
                    </li>
                  ))}
                </ul>
              </Module>
            )}

            <Module title="Próximas ações">
              <div className="grid gap-2 md:grid-cols-3">
                {d.nextActions.map((a) => (
                  <div key={a.title} className="rounded border border-border/40 p-2 space-y-0.5">
                    <p className="text-xs font-medium">{a.title}</p>
                    <p className="text-[11px] text-muted-foreground">{a.reason}</p>
                    {a.suggestedTime && <p className="text-[11px] text-muted-foreground">Horário: {a.suggestedTime}</p>}
                  </div>
                ))}
              </div>
            </Module>

            {d.attentionPoint && (
              <Module title="Ponto de atenção">
                <p className="text-xs text-foreground">{d.attentionPoint}</p>
              </Module>
            )}
          </div>
        )}

        {ai?.text && !d && (
          <Module title="Análise anterior (formato antigo)">
            <p className="text-xs whitespace-pre-wrap text-muted-foreground">{ai.text}</p>
          </Module>
        )}

        {ai && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">Análise opcional por IA</Badge>
            <span className="text-[11px] text-muted-foreground">
              {new Date(ai.generatedAt).toLocaleString("pt-BR")}{ai.model ? ` · ${ai.model}` : ""}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
