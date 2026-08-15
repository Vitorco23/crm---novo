// Sprint 2 — apresentação modular do diagnóstico por REGRAS (sem IA).
// Componente puramente de apresentação: não altera formulário, fórmulas nem persistência.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CLASSIFICATION_LABEL, IMPACT_LABEL, RATING_LABEL,
  type Classification, type DailyDiagnosis, type Rating,
} from "@/modules/intelligence/services/dailyDiagnosis";

const ratingClass: Record<Rating, string> = {
  critico: "bg-destructive/15 text-destructive border-destructive/30",
  atencao: "bg-destructive/10 text-destructive border-destructive/20",
  moderado: "bg-muted text-foreground border-border",
  bom: "bg-accent/15 text-accent border-accent/30",
  excelente: "bg-accent/25 text-accent border-accent/40",
};

const classClass: Record<Classification, string> = {
  "sem-dados": "bg-muted text-muted-foreground border-border",
  critico: "bg-destructive/15 text-destructive border-destructive/30",
  atencao: "bg-destructive/10 text-destructive border-destructive/20",
  esperado: "bg-muted text-foreground border-border",
  destaque: "bg-accent/20 text-accent border-accent/40",
};

const dash = (v: number | null, suffix = "") => (v === null ? "—" : `${v}${suffix}`);

export function RatingBadge({ rating, className = "" }: { rating: Rating | null; className?: string }) {
  if (!rating) return <Badge variant="outline" className={`text-[11px] ${className}`}>Sem avaliação</Badge>;
  return (
    <Badge variant="outline" className={`text-[11px] ${ratingClass[rating]} ${className}`}>
      {RATING_LABEL[rating]}
    </Badge>
  );
}

export default function DiagnosticoDiarioPanel({ diagnosis }: { diagnosis: DailyDiagnosis }) {
  const d = diagnosis;
  const channels: DailyDiagnosis["steps"][number]["channel"][] = ["Ligações", "Disparos", "Follow-ups"];

  return (
    <div className="space-y-4">
      {/* 2. Cabeçalho */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Diagnóstico do dia</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <RatingBadge rating={d.rating} />
              <Badge variant="outline" className="text-[11px]">
                Meta atingida: <span className="ml-1 font-semibold">{d.goalPct === null ? "—" : `${Math.round(d.goalPct)}%`}</span>
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-sm text-foreground">{d.summary}</p>
          {d.comparison && <p className="text-xs text-muted-foreground">{d.comparison}</p>}
          <p className="text-[11px] text-muted-foreground">Avaliação calculada por regras — sem IA.</p>
        </CardContent>
      </Card>

      {/* 3. Análise por canal */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Onde o processo funciona — e onde trava</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {channels.map((ch) => {
            const steps = d.steps.filter((s) => s.channel === ch);
            return (
              <div key={ch} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ch}</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {steps.map((s) => (
                    <div key={s.key} className="rounded-md border border-border/50 p-3 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{s.label}</span>
                        <span className="text-sm font-semibold">{dash(s.value, "%")}</span>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${classClass[s.classification]}`}>
                        {CLASSIFICATION_LABEL[s.classification]}
                      </Badge>
                      <p className="text-[11px] text-muted-foreground">{s.explanation}</p>
                      <p className="text-[11px] text-foreground">{s.recommendation}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground">Referência operacional configurável — não é benchmark absoluto.</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 4. Oportunidades */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Onde ainda existe oportunidade</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {d.opportunities.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum decisor registrado neste fechamento.</p>
            ) : d.opportunities.map((o) => (
              <div key={o.channel} className="rounded-md border border-border/50 p-3 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium">{o.channel}</span>
                  <span className="text-[11px] text-muted-foreground">
                    Decisores {o.decisionMakers ?? "—"} · Reuniões/R1 {o.converted ?? "—"} · Diferença {o.gap ?? "—"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">{o.note}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 5. Eficiência */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Eficiência do período</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {d.efficiency.map((e) => (
                <div key={e.label} className="rounded-md border border-border/50 p-3">
                  <p className="text-[11px] text-muted-foreground">{e.label}</p>
                  <p className="text-lg font-semibold">{dash(e.value)}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Calculado apenas quando o tempo prospectando é maior que zero.</p>
          </CardContent>
        </Card>
      </div>

      {/* 6. O que funcionou */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">O que funcionou</CardTitle></CardHeader>
        <CardContent>
          {d.whatWorked.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem dados suficientes para destacar pontos positivos.</p>
          ) : (
            <ul className="space-y-1">
              {d.whatWorked.map((w) => (
                <li key={w} className="text-xs text-foreground flex gap-2">
                  <span className="text-accent">•</span><span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 7. Prioridades */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Prioridades de correção</CardTitle></CardHeader>
        <CardContent>
          {d.priorities.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma etapa abaixo da referência operacional.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-3">
              {d.priorities.map((p, i) => (
                <div key={p.stage + p.channel} className="rounded-md border border-border/50 p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Prioridade {i + 1}</span>
                    <Badge variant="outline" className="text-[10px]">Impacto {IMPACT_LABEL[p.impact]}</Badge>
                  </div>
                  <p className="text-xs font-medium">{p.stage} · {p.channel}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Taxa atual {dash(p.value, "%")} · {p.deltaToReference > 0 ? "+" : ""}{p.deltaToReference} p.p. vs referência
                  </p>
                  <p className="text-[11px] text-muted-foreground">{p.explanation}</p>
                  <p className="text-[11px] text-foreground">{p.action}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 8. Plano do próximo dia */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Três ações para o próximo dia</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          {d.plan.map((a, i) => (
            <div key={a.id} className="rounded-md border border-border/50 p-3 space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ação {i + 1}</span>
              <p className="text-xs font-medium">{a.title}</p>
              <p className="text-[11px] text-muted-foreground">{a.reason}</p>
              <p className="text-[11px] text-foreground">{a.expected}</p>
              {a.suggestedTime && <p className="text-[11px] text-muted-foreground">Horário sugerido: {a.suggestedTime}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
