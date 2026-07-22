import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Clock, FlaskConical, MapPin, Building2, Megaphone, TrendingUp } from "lucide-react";
import { getSessions, getLeads, getMovementEvents, getMeetings, getStagesForPipeline } from "@/lib/store";

const MIN_SAMPLE = 30; // amostra mínima para considerar como referência confiável

const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const dash = "—";

// ============================================================
// Tipos e helpers compartilhados
// ============================================================

interface AnalysisRow {
  key: string;
  label: string;
  leads?: number;
  calls: number;
  connections?: number;
  decisionMakers?: number;
  meetings: number;
  remaining?: number;
  connRate?: number;
  dmRate?: number;
  meetingRate: number;
  sufficient: boolean;
}

interface ColumnDef {
  header: string;
  render: (r: AnalysisRow) => React.ReactNode;
  align?: "left" | "right";
}

function AnalysisCard({
  icon,
  title,
  description,
  rows,
  columns,
  summaryLabel,
  emptyMessage = "Ainda não existem dados suficientes para uma conclusão confiável.",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  rows: AnalysisRow[];
  columns: ColumnDef[];
  summaryLabel: string;
  emptyMessage?: string;
}) {
  const best = rows.find((r) => r.sufficient);
  return (
    <Card className="border-l-4 border-l-accent">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-md bg-accent/15 text-accent flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border bg-muted/30 p-4">
          {best ? (
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-accent mt-0.5" />
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {summaryLabel}
                </div>
                <div className="text-xl font-semibold mt-0.5">{best.label}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Taxa de reuniões:{" "}
                  <span className="text-foreground font-medium">{fmtPct(best.meetingRate)}</span>
                  {" · "}Base:{" "}
                  <span className="text-foreground font-medium">{best.calls} ligações</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{emptyMessage}</div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                {columns.map((c, i) => (
                  <th
                    key={i}
                    className={`py-2 pr-4 ${c.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {c.header}
                  </th>
                ))}
                <th className="py-2 text-right">Confiabilidade</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    Sem dados registrados.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.key} className="border-b last:border-b-0">
                  {columns.map((c, i) => (
                    <td
                      key={i}
                      className={`py-2 pr-4 ${
                        c.align === "right" ? "text-right tabular-nums" : ""
                      } ${i === 0 ? "font-medium" : "text-muted-foreground"}`}
                    >
                      {c.render(r)}
                    </td>
                  ))}
                  <td className="py-2 text-right">
                    {r.sufficient ? (
                      <Badge variant="outline" className="text-[10px]">
                        OK
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Amostra insuficiente
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Faixas com menos de {MIN_SAMPLE} ligações são exibidas, mas não são consideradas como
          referência confiável até acumularem mais dados.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
// MÓDULO — Análise de Horários (pomodoro sessions)
// ============================================================

function useHourRows(): AnalysisRow[] {
  return useMemo(() => {
    const sessions = getSessions();
    const map = new Map<number, AnalysisRow>();
    for (let h = 8; h <= 18; h++) {
      map.set(h, {
        key: String(h),
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
      const b = map.get(d.getHours());
      if (!b) continue;
      b.calls += s.calls || 0;
      b.connections = (b.connections || 0) + (s.connections || 0);
      b.decisionMakers = (b.decisionMakers || 0) + (s.decisionMakers || 0);
      b.meetings += s.meetings || 0;
    }
    const rows = [...map.values()].map(finalizeRates);
    return sortRows(rows);
  }, []);
}

// ============================================================
// MÓDULO — Análise por Cidade
// ============================================================

function useCityRows(): AnalysisRow[] {
  return useMemo(() => {
    const leads = getLeads();
    const events = getMovementEvents();
    const meetings = getMeetings();
    const leadById = new Map(leads.map((l) => [l.id, l]));

    const map = new Map<string, AnalysisRow>();
    const ensure = (city: string) => {
      const key = city || "(sem cidade)";
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: key,
          leads: 0,
          calls: 0,
          meetings: 0,
          meetingRate: 0,
          sufficient: false,
        });
      }
      return map.get(key)!;
    };

    for (const l of leads) ensure((l.city || "").trim()).leads! += 1;
    for (const e of events.filter((x) => x.type === "call")) {
      const l = leadById.get(e.leadId);
      if (!l) continue;
      ensure((l.city || "").trim()).calls += 1;
    }
    for (const m of meetings) {
      const l = leadById.get(m.leadId);
      if (!l) continue;
      ensure((l.city || "").trim()).meetings += 1;
    }
    const rows = [...map.values()].map(finalizeRates);
    return sortRows(rows);
  }, []);
}

// ============================================================
// MÓDULO — Análise por Nicho
// ============================================================

function useNicheRows(): AnalysisRow[] {
  return useMemo(() => {
    const leads = getLeads();
    const sessions = getSessions();
    const events = getMovementEvents();
    const meetings = getMeetings();
    const leadById = new Map(leads.map((l) => [l.id, l]));

    const map = new Map<string, AnalysisRow>();
    const ensure = (niche: string) => {
      const key = niche || "(sem nicho)";
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: key,
          leads: 0,
          calls: 0,
          connections: 0,
          decisionMakers: 0,
          meetings: 0,
          connRate: 0,
          meetingRate: 0,
          sufficient: false,
        });
      }
      return map.get(key)!;
    };

    for (const l of leads) ensure((l.niche || "").trim()).leads! += 1;

    // Sessões de pomodoro carregam o nicho trabalhado → alimenta conexões/decisores/reuniões agregados
    for (const s of sessions) {
      const key = (s.niche || "").trim();
      if (!key) continue;
      const row = ensure(key);
      row.calls += s.calls || 0;
      row.connections = (row.connections || 0) + (s.connections || 0);
      row.decisionMakers = (row.decisionMakers || 0) + (s.decisionMakers || 0);
      row.meetings += s.meetings || 0;
    }
    // Movement events + meetings cobrem casos em que não houve pomodoro registrado
    for (const e of events.filter((x) => x.type === "call")) {
      const l = leadById.get(e.leadId);
      if (!l) continue;
      const key = (l.niche || "").trim();
      const row = ensure(key);
      // só soma se não veio de pomodoro (evita duplicidade quando ambos existem)
      if (!sessions.some((s) => (s.niche || "").trim() === key)) row.calls += 1;
    }
    for (const m of meetings) {
      const l = leadById.get(m.leadId);
      if (!l) continue;
      const key = (l.niche || "").trim();
      const row = ensure(key);
      if (!sessions.some((s) => (s.niche || "").trim() === key)) row.meetings += 1;
    }

    const rows = [...map.values()].map(finalizeRates);
    return sortRows(rows);
  }, []);
}

// ============================================================
// MÓDULO — Análise por Campanha (Cidade + Nicho)
// ============================================================

function useCampaignRows(): AnalysisRow[] {
  return useMemo(() => {
    const leads = getLeads();
    const events = getMovementEvents();
    const meetings = getMeetings();
    const leadById = new Map(leads.map((l) => [l.id, l]));
    const coldStages = new Set(getStagesForPipeline("cold_call"));

    const map = new Map<string, AnalysisRow>();
    const ensure = (city: string, niche: string) => {
      const key = `${city}||${niche}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: `${niche || "(sem nicho)"} — ${city || "(sem cidade)"}`,
          leads: 0,
          calls: 0,
          meetings: 0,
          remaining: 0,
          meetingRate: 0,
          sufficient: false,
        });
      }
      return map.get(key)!;
    };

    for (const l of leads) {
      const row = ensure((l.city || "").trim(), (l.niche || "").trim());
      row.leads! += 1;
      if (coldStages.has(l.stage) && l.stage === "Novo Lead") row.remaining! += 1;
    }
    for (const e of events.filter((x) => x.type === "call")) {
      const l = leadById.get(e.leadId);
      if (!l) continue;
      ensure((l.city || "").trim(), (l.niche || "").trim()).calls += 1;
    }
    for (const m of meetings) {
      const l = leadById.get(m.leadId);
      if (!l) continue;
      ensure((l.city || "").trim(), (l.niche || "").trim()).meetings += 1;
    }
    // Remove pares totalmente vazios (sem leads e sem ligações) — não são campanhas reais
    const rows = [...map.values()]
      .filter((r) => (r.leads || 0) > 0 || r.calls > 0)
      .map(finalizeRates);
    return sortRows(rows);
  }, []);
}

// ============================================================
// Helpers de linha
// ============================================================

function finalizeRates(r: AnalysisRow): AnalysisRow {
  const calls = r.calls || 0;
  const conns = r.connections || 0;
  r.connRate = calls > 0 && r.connections !== undefined ? (conns / calls) * 100 : undefined;
  r.dmRate =
    conns > 0 && r.decisionMakers !== undefined ? ((r.decisionMakers || 0) / conns) * 100 : undefined;
  r.meetingRate = calls > 0 ? (r.meetings / calls) * 100 : 0;
  r.sufficient = calls >= MIN_SAMPLE;
  return r;
}

function sortRows(rows: AnalysisRow[]): AnalysisRow[] {
  return [...rows].sort((a, b) => {
    if (a.sufficient !== b.sufficient) return a.sufficient ? -1 : 1;
    if (b.meetingRate !== a.meetingRate) return b.meetingRate - a.meetingRate;
    return b.calls - a.calls;
  });
}

// ============================================================
// Página
// ============================================================

export default function InteligenciaComercial() {
  const hourRows = useHourRows();
  const cityRows = useCityRows();
  const nicheRows = useNicheRows();
  const campaignRows = useCampaignRows();

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

      <section className="grid gap-4">
        <AnalysisCard
          icon={<Clock className="h-5 w-5" />}
          title="Análise de Horários"
          description="Desempenho por faixa de horário com base nas sessões de prospecção já registradas."
          summaryLabel="Melhor horário até o momento"
          rows={hourRows}
          columns={[
            { header: "Faixa", render: (r) => r.label },
            { header: "Ligações", align: "right", render: (r) => r.calls },
            { header: "Conexões", align: "right", render: (r) => r.connections ?? dash },
            { header: "Decisores", align: "right", render: (r) => r.decisionMakers ?? dash },
            { header: "Reuniões", align: "right", render: (r) => r.meetings },
            {
              header: "Tx. Conexão",
              align: "right",
              render: (r) => (r.connRate !== undefined ? fmtPct(r.connRate) : dash),
            },
            {
              header: "Tx. Decisores",
              align: "right",
              render: (r) => (r.dmRate !== undefined ? fmtPct(r.dmRate) : dash),
            },
            {
              header: "Tx. Reuniões",
              align: "right",
              render: (r) => (r.calls > 0 ? fmtPct(r.meetingRate) : dash),
            },
          ]}
        />

        <AnalysisCard
          icon={<MapPin className="h-5 w-5" />}
          title="Análise por Cidade"
          description="Desempenho comercial agrupado por cidade dos leads."
          summaryLabel="Cidade com melhor desempenho até o momento"
          rows={cityRows}
          columns={[
            { header: "Cidade", render: (r) => r.label },
            { header: "Leads", align: "right", render: (r) => r.leads ?? 0 },
            { header: "Ligações", align: "right", render: (r) => r.calls },
            { header: "Conexões", align: "right", render: (r) => r.connections ?? dash },
            { header: "Decisores", align: "right", render: (r) => r.decisionMakers ?? dash },
            { header: "Reuniões", align: "right", render: (r) => r.meetings },
            {
              header: "Tx. Conexão",
              align: "right",
              render: (r) => (r.connRate !== undefined ? fmtPct(r.connRate) : dash),
            },
            {
              header: "Tx. Decisores",
              align: "right",
              render: (r) => (r.dmRate !== undefined ? fmtPct(r.dmRate) : dash),
            },
            {
              header: "Tx. Reuniões",
              align: "right",
              render: (r) => (r.calls > 0 ? fmtPct(r.meetingRate) : dash),
            },
          ]}
        />

        <AnalysisCard
          icon={<Building2 className="h-5 w-5" />}
          title="Análise por Nicho"
          description="Desempenho comercial agrupado por nicho de mercado."
          summaryLabel="Nicho com melhor desempenho"
          rows={nicheRows}
          columns={[
            { header: "Nicho", render: (r) => r.label },
            { header: "Leads", align: "right", render: (r) => r.leads ?? 0 },
            { header: "Ligações", align: "right", render: (r) => r.calls },
            { header: "Conexões", align: "right", render: (r) => r.connections ?? dash },
            { header: "Decisores", align: "right", render: (r) => r.decisionMakers ?? dash },
            { header: "Reuniões", align: "right", render: (r) => r.meetings },
            {
              header: "Tx. Conexão",
              align: "right",
              render: (r) => (r.connRate !== undefined ? fmtPct(r.connRate) : dash),
            },
            {
              header: "Tx. Reuniões",
              align: "right",
              render: (r) => (r.calls > 0 ? fmtPct(r.meetingRate) : dash),
            },
          ]}
        />

        <AnalysisCard
          icon={<Megaphone className="h-5 w-5" />}
          title="Análise por Campanha"
          description="Desempenho por campanha (par Cidade + Nicho) registrada no CRM."
          summaryLabel="Campanha mais eficiente"
          rows={campaignRows}
          columns={[
            { header: "Campanha", render: (r) => r.label },
            { header: "Leads", align: "right", render: (r) => r.leads ?? 0 },
            { header: "Ligações", align: "right", render: (r) => r.calls },
            { header: "Conexões", align: "right", render: (r) => r.connections ?? dash },
            { header: "Decisores", align: "right", render: (r) => r.decisionMakers ?? dash },
            { header: "Reuniões", align: "right", render: (r) => r.meetings },
            {
              header: "Tx. Conversão",
              align: "right",
              render: (r) => (r.calls > 0 ? fmtPct(r.meetingRate) : dash),
            },
            { header: "Restantes", align: "right", render: (r) => r.remaining ?? 0 },
          ]}
        />

        <Card className="border-l-4 border-l-muted">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                <FlaskConical className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Teste A/B de Scripts</CardTitle>
                <CardDescription>
                  Compare variações de script de abordagem para identificar qual gera mais
                  conexões, decisores e reuniões.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              Em breve
            </Badge>
          </CardHeader>
        </Card>
      </section>
    </div>
  );
}
