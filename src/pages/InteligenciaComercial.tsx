import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Clock, FlaskConical, TrendingUp } from "lucide-react";
import { getSessions } from "@/lib/store";

const MIN_SAMPLE = 30; // mínimo de ligações para considerar a faixa como referência

interface HourBucket {
  hour: number;
  label: string;
  calls: number;
  connections: number;
  decisionMakers: number;
  meetings: number;
  connRate: number;
  dmRate: number;
  meetingRate: number;
  sufficient: boolean;
}

function buildBuckets(): HourBucket[] {
  const sessions = getSessions();
  const map = new Map<number, HourBucket>();
  for (let h = 8; h <= 18; h++) {
    map.set(h, {
      hour: h,
      label: `${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00`,
      calls: 0,
      connections: 0,
      decisionMakers: 0,
      meetings: 0,
      connRate: 0,
      dmRate: 0,
      meetingRate: 0,
      sufficient: false,
    });
  }
  for (const s of sessions) {
    const d = new Date(s.startTime);
    if (isNaN(d.getTime())) continue;
    const h = d.getHours();
    const b = map.get(h);
    if (!b) continue;
    b.calls += s.calls || 0;
    b.connections += s.connections || 0;
    b.decisionMakers += s.decisionMakers || 0;
    b.meetings += s.meetings || 0;
  }
  const buckets = Array.from(map.values());
  for (const b of buckets) {
    b.connRate = b.calls > 0 ? (b.connections / b.calls) * 100 : 0;
    b.dmRate = b.connections > 0 ? (b.decisionMakers / b.connections) * 100 : 0;
    b.meetingRate = b.calls > 0 ? (b.meetings / b.calls) * 100 : 0;
    b.sufficient = b.calls >= MIN_SAMPLE;
  }
  return buckets;
}

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export default function InteligenciaComercial() {
  const buckets = useMemo(buildBuckets, []);
  const ranked = useMemo(
    () => [...buckets].sort((a, b) => {
      // faixas com amostra suficiente primeiro, ordenadas por taxa de reunião
      if (a.sufficient !== b.sufficient) return a.sufficient ? -1 : 1;
      return b.meetingRate - a.meetingRate;
    }),
    [buckets]
  );
  const best = ranked.find((b) => b.sufficient);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <header className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-accent/15 text-accent flex items-center justify-center">
          <Brain className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inteligência Comercial</h1>
          <p className="text-sm text-muted-foreground">
            Análises históricas e comparativas para apoiar decisões estratégicas da operação.
          </p>
        </div>
      </header>

      {/* Módulo: Análise de Horários */}
      <section className="grid gap-4">
        <Card className="border-l-4 border-l-accent">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-md bg-accent/15 text-accent flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-lg">Análise de Horários</CardTitle>
                <CardDescription>
                  Desempenho por faixa de horário com base nas sessões de prospecção já registradas.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Resumo do melhor horário */}
            <div className="rounded-lg border bg-muted/30 p-4">
              {best ? (
                <div className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-accent mt-0.5" />
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      Melhor horário até o momento
                    </div>
                    <div className="text-xl font-semibold mt-0.5">{best.label}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Taxa de reuniões: <span className="text-foreground font-medium">{fmtPct(best.meetingRate)}</span>
                      {" · "}Base: <span className="text-foreground font-medium">{best.calls} ligações</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Ainda não existe amostragem suficiente para eleger um melhor horário. Registre pelo menos {MIN_SAMPLE} ligações em alguma faixa.
                </div>
              )}
            </div>

            {/* Tabela */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 pr-4">Faixa</th>
                    <th className="py-2 pr-4 text-right">Ligações</th>
                    <th className="py-2 pr-4 text-right">Conexões</th>
                    <th className="py-2 pr-4 text-right">Decisores</th>
                    <th className="py-2 pr-4 text-right">Reuniões</th>
                    <th className="py-2 pr-4 text-right">Tx. Conexão</th>
                    <th className="py-2 pr-4 text-right">Tx. Decisores</th>
                    <th className="py-2 pr-4 text-right">Tx. Reuniões</th>
                    <th className="py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((b) => (
                    <tr key={b.hour} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 font-medium">{b.label}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{b.calls}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{b.connections}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{b.decisionMakers}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{b.meetings}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {b.calls > 0 ? fmtPct(b.connRate) : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {b.connections > 0 ? fmtPct(b.dmRate) : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {b.calls > 0 ? fmtPct(b.meetingRate) : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {b.sufficient ? (
                          <Badge variant="outline" className="text-[10px]">OK</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Amostra insuficiente</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Faixas com menos de {MIN_SAMPLE} ligações são exibidas, mas não são consideradas como referência confiável até acumularem mais dados.
            </p>
          </CardContent>
        </Card>

        {/* Placeholder do módulo futuro */}
        <Card className="border-l-4 border-l-muted">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                <FlaskConical className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Teste A/B de Scripts</CardTitle>
                <CardDescription>
                  Compare variações de script de abordagem para identificar qual gera mais conexões, decisores e reuniões.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">Em breve</Badge>
          </CardHeader>
        </Card>
      </section>
    </div>
  );
}
