import { useEffect, useMemo, useState } from "react";
import { Phone, Users, UserCheck, CalendarCheck, DollarSign, Timer, Target } from "lucide-react";
import StatCard from "./StatCard";
import {
  computeDailyGoals,
  computeDailyTotals,
  computeCampaignSummary,
  type DailyGoals,
  type DailyTotals,
  type CampaignSummary,
} from "@/lib/coldCallMetrics";
import { uload } from "@/lib/userStorage";

const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

interface ColdCallOpsPanelProps {
  refreshKey?: number; // bump from parent when leads/stages change
}

export default function ColdCallOpsPanel({ refreshKey = 0 }: ColdCallOpsPanelProps) {
  const [tick, setTick] = useState(0);

  // Auto-refresh on: local storage writes, focus, and every 30s
  useEffect(() => {
    const onStorage = () => setTick((t) => t + 1);
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    const iv = window.setInterval(() => setTick((t) => t + 1), 30000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(iv);
    };
  }, []);

  // Read filters (persisted by PipelineBoard) to drive Campaign panel
  const filters = uload<{ niches?: string[]; cities?: string[]; search?: string }>(
    "p21_filters_cold_call",
    {}
  );

  const goals: DailyGoals = useMemo(computeDailyGoals, [tick, refreshKey]);
  const totals: DailyTotals = useMemo(computeDailyTotals, [tick, refreshKey]);
  const campaign: CampaignSummary | null = useMemo(
    () =>
      computeCampaignSummary({
        niches: filters.niches ?? [],
        cities: filters.cities ?? [],
        dailyGoal: goals.calls,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, refreshKey, goals.calls, (filters.niches ?? []).join("|"), (filters.cities ?? []).join("|")]
  );

  const pct = (done: number, target: number) =>
    target > 0 ? Math.round((done / target) * 100) : 0;

  const hours = Math.floor(totals.productiveMinutes / 60);
  const mins = totals.productiveMinutes % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <div className="space-y-3">
      {/* Daily operational panel */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatCard
          icon={<Phone className="h-3.5 w-3.5" />}
          label="Ligações"
          value={totals.calls}
          goal={goals.calls}
          percent={pct(totals.calls, goals.calls)}
        />
        <StatCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="Conexões"
          value={totals.connections}
          goal={goals.connections}
          percent={pct(totals.connections, goals.connections)}
        />
        <StatCard
          icon={<UserCheck className="h-3.5 w-3.5" />}
          label="Decisores"
          value={totals.decisionMakers}
          goal={goals.decisionMakers}
          percent={pct(totals.decisionMakers, goals.decisionMakers)}
        />
        <StatCard
          icon={<CalendarCheck className="h-3.5 w-3.5" />}
          label="Reuniões"
          value={totals.meetings}
          goal={goals.meetings}
          percent={pct(totals.meetings, goals.meetings)}
          tone="accent"
        />
        <StatCard
          icon={<DollarSign className="h-3.5 w-3.5" />}
          label="Receita Prevista"
          value={BRL(totals.expectedRevenue)}
          hint="Oportunidades abertas"
        />
        <StatCard
          icon={<Timer className="h-3.5 w-3.5" />}
          label="Tempo Produtivo"
          value={timeStr}
          hint={`${totals.sessions} ${totals.sessions === 1 ? "sessão" : "sessões"}`}
        />
      </div>

      {/* Daily goal progress bar (calls) */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <div className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-accent" />
            <span className="uppercase tracking-wide">Meta diária de ligações</span>
          </div>
          <span>
            <span className="font-semibold text-card-foreground">{totals.calls}</span>{" "}
            / {goals.calls} ({pct(totals.calls, goals.calls)}%)
          </span>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${Math.min(100, pct(totals.calls, goals.calls))}%` }}
          />
        </div>
      </div>

      {/* Campaign panel */}
      {campaign && (
        <div className="rounded-lg border border-accent/30 bg-card p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Campanha atual
              </div>
              <div className="text-sm font-bold text-card-foreground">{campaign.label}</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-accent leading-none">
                {campaign.percentComplete}%
              </div>
              <div className="text-[10px] text-muted-foreground">concluído</div>
            </div>
          </div>

          <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${Math.min(100, campaign.percentComplete)}%` }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            <CampaignStat label="Total" value={campaign.totalLeads} />
            <CampaignStat label="Trabalhados" value={campaign.worked} />
            <CampaignStat label="Restantes" value={campaign.remaining} />
            <CampaignStat label="Meta diária" value={campaign.dailyGoal} />
            <CampaignStat
              label="Ritmo atual"
              value={`${campaign.currentPace}/dia`}
            />
            <CampaignStat
              label="Conclusão"
              value={
                campaign.daysToFinish === null
                  ? "—"
                  : campaign.daysToFinish === 0
                  ? "hoje"
                  : `${campaign.daysToFinish}d`
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-border bg-background/50 px-2 py-1.5">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-card-foreground">{value}</div>
    </div>
  );
}
